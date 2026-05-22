-- ============================================================
-- 009_mvp_simplify.sql  – Strip catalog‑dependent features for MVP
-- ============================================================

-- a. Make listing_items text-based (no catalog required)
alter table public.listing_items
  alter column catalog_card_id drop not null;

alter table public.listing_items
  add column if not exists card_name text,
  add column if not exists set_name text,
  add column if not exists condition_text text;

-- custom_price may already exist; add only if missing
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listing_items'
      and column_name = 'custom_price'
  ) then
    alter table public.listing_items add column custom_price numeric;
  end if;
end $$;

-- b. Add free-form trade offer columns to trade_offers
alter table public.trade_offers
  add column if not exists offered_cards jsonb,
  add column if not exists requested_listing_item_ids uuid[];

-- c. New MVP trade proposal function
create or replace function public.propose_mvp_trade(
  p_listing_id uuid,
  p_recipient_id uuid,
  p_requested_listing_item_ids uuid[],
  p_offered_cards jsonb default '[]'::jsonb,
  p_cash_amount numeric default 0
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_trade_id uuid;
  v_listing_seller_id uuid;
  v_listing_status text;
  v_item_count int;
begin
  -- Validate listing
  select seller_id, status into v_listing_seller_id, v_listing_status
  from public.listings
  where id = p_listing_id;

  if v_listing_seller_id is null then
    raise exception 'Listing not found.';
  end if;
  if v_listing_status <> 'active' then
    raise exception 'Listing is not active.';
  end if;
  if v_listing_seller_id <> p_recipient_id then
    raise exception 'Recipient does not own the listing.';
  end if;

  -- Validate requested items belong to the listing
  select count(*) into v_item_count
  from public.listing_items
  where id = any(p_requested_listing_item_ids)
    and listing_id = p_listing_id;

  if v_item_count <> array_length(p_requested_listing_item_ids, 1) then
    raise exception 'One or more requested items do not belong to this listing.';
  end if;

  -- Create the trade
  insert into public.trade_offers (
    initiator_id,
    recipient_id,
    status,
    cash_amount,
    listing_id,
    offered_cards,
    requested_listing_item_ids
  ) values (
    auth.uid(),
    p_recipient_id,
    'proposed',
    p_cash_amount,
    p_listing_id,
    p_offered_cards,
    p_requested_listing_item_ids
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

-- d. Simplify accept_trade — just update status, no card locking
create or replace function public.accept_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_trade record;
begin
  select * into v_trade from public.trade_offers where id = p_trade_id;

  if v_trade is null then
    raise exception 'Trade not found.';
  end if;
  if v_trade.recipient_id <> auth.uid() then
    raise exception 'Only the recipient can accept.';
  end if;
  if v_trade.status not in ('proposed', 'countered') then
    raise exception 'Trade is not in a proposable state.';
  end if;

  update public.trade_offers
  set status = 'accepted', updated_at = now()
  where id = p_trade_id;
end;
$$;

-- e. Simplify complete_trade — just update status, no ownership transfer
create or replace function public.complete_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_trade record;
  v_caller_is_initiator boolean;
begin
  select * into v_trade from public.trade_offers where id = p_trade_id;

  if v_trade is null then
    raise exception 'Trade not found.';
  end if;
  if v_trade.status <> 'accepted' then
    raise exception 'Trade must be accepted before completing.';
  end if;

  v_caller_is_initiator := (auth.uid() = v_trade.initiator_id);

  if v_caller_is_initiator then
    if v_trade.initiator_confirmed then
      raise exception 'You have already confirmed.';
    end if;
    update public.trade_offers
    set initiator_confirmed = true, updated_at = now()
    where id = p_trade_id;
  else
    if auth.uid() <> v_trade.recipient_id then
      raise exception 'Only trade participants can confirm.';
    end if;
    if v_trade.recipient_confirmed then
      raise exception 'You have already confirmed.';
    end if;
    update public.trade_offers
    set recipient_confirmed = true, updated_at = now()
    where id = p_trade_id;
  end if;

  -- Check if both confirmed
  perform 1 from public.trade_offers
  where id = p_trade_id
    and initiator_confirmed = true
    and recipient_confirmed = true;

  if found then
    update public.trade_offers
    set status = 'completed', updated_at = now()
    where id = p_trade_id;
  end if;
end;
$$;
