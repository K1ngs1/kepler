-- ============================================================
-- 012_middleman_shipping.sql  – Middleman service & shipping addresses
-- ============================================================

-- ─── 1. Add middleman columns to trade_offers ───
alter table public.trade_offers
  add column if not exists middleman_id uuid references public.profiles(id),
  add column if not exists middleman_status text,
  add column if not exists middleman_fee numeric default 0,
  add column if not exists middleman_confirmed boolean default false,
  add column if not exists middleman_requested_by uuid[] default '{}',
  add column if not exists label_url text,
  add column if not exists tracking_number text;

-- ─── 2. shipping_addresses table ───
create table if not exists public.shipping_addresses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  street text not null,
  city text not null,
  state text not null,
  zip text not null,
  country text not null default 'US',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shipping_addresses enable row level security;

-- Users can only see/manage their own addresses
create policy "Users can view own addresses"
  on public.shipping_addresses for select
  using (auth.uid() = user_id);

create policy "Users can insert own addresses"
  on public.shipping_addresses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own addresses"
  on public.shipping_addresses for update
  using (auth.uid() = user_id);

create policy "Users can delete own addresses"
  on public.shipping_addresses for delete
  using (auth.uid() = user_id);

-- ─── 3. Updated accept_trade — middleman support ───
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

  -- If middleman is assigned, go to inspection instead of accepted
  if v_trade.middleman_id is not null then
    update public.trade_offers
    set status = 'inspection',
        middleman_status = 'pending',
        updated_at = now()
    where id = p_trade_id;
  else
    update public.trade_offers
    set status = 'accepted', updated_at = now()
    where id = p_trade_id;
  end if;
end;
$$;

-- ─── 4. update_middleman_status — middleman advances the trade ───
create or replace function public.update_middleman_status(
  p_trade_id uuid,
  p_status text
)
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
  if v_trade.middleman_id <> auth.uid() then
    raise exception 'Only the assigned middleman can update status.';
  end if;
  if v_trade.status <> 'inspection' then
    raise exception 'Trade is not in inspection status.';
  end if;
  if p_status not in ('received', 'verified', 'shipped') then
    raise exception 'Invalid middleman status. Must be: received, verified, or shipped.';
  end if;

  update public.trade_offers
  set middleman_status = p_status,
      updated_at = now()
  where id = p_trade_id;

  -- When middleman marks as verified, move trade to accepted so parties can confirm
  if p_status = 'verified' then
    update public.trade_offers
    set middleman_confirmed = true,
        updated_at = now()
    where id = p_trade_id;
  end if;

  -- When middleman marks as shipped, move to accepted for final confirmation
  if p_status = 'shipped' then
    update public.trade_offers
    set status = 'accepted',
        updated_at = now()
    where id = p_trade_id;
  end if;
end;
$$;

-- ─── 5. Updated complete_trade — middleman fee handling ───
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
    -- Note: escrow release (deposit to seller, middleman fee) is handled
    -- via the polygon-release edge function, same as the existing flow.
  end if;
end;
$$;
