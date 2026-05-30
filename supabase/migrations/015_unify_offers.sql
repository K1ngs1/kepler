-- ============================================================
-- 015_unify_offers.sql  – Unify purchase_offers into trade_offers
-- ============================================================

-- ─── 1. Add purchase-related columns to trade_offers ───
alter table public.trade_offers
  add column if not exists offer_type text not null default 'trade'
    check (offer_type in ('trade', 'purchase')),
  add column if not exists payment_txn_hash text,
  add column if not exists payment_status text
    check (payment_status in ('pending', 'paid', 'verified'));

-- ─── 2. Update propose_mvp_trade to support both offer types ───
create or replace function public.propose_mvp_trade(
  p_listing_id uuid,
  p_recipient_id uuid,
  p_requested_listing_item_ids uuid[],
  p_offered_cards jsonb default '[]'::jsonb,
  p_cash_amount numeric default 0,
  p_offer_type text default 'trade'
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

  -- Create the offer
  insert into public.trade_offers (
    initiator_id,
    recipient_id,
    status,
    cash_amount,
    listing_id,
    offered_cards,
    requested_listing_item_ids,
    offer_type
  ) values (
    auth.uid(),
    p_recipient_id,
    'proposed',
    p_cash_amount,
    p_listing_id,
    p_offered_cards,
    p_requested_listing_item_ids,
    p_offer_type
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

-- ─── 3. Migrate existing purchase_offers into trade_offers ───
insert into public.trade_offers (
  initiator_id,
  recipient_id,
  status,
  cash_amount,
  listing_id,
  offer_type,
  payment_txn_hash,
  payment_status,
  created_at,
  updated_at
)
select
  po.buyer_id,
  po.seller_id,
  case
    when po.status = 'pending' then 'proposed'
    when po.status = 'rejected' then 'cancelled'
    when po.status = 'paid' then 'accepted'
    else po.status
  end,
  po.amount,
  po.listing_id,
  'purchase',
  po.payment_txn_hash,
  case when po.status = 'paid' then 'paid' else null end,
  po.created_at,
  coalesce(po.updated_at, po.created_at)
from public.purchase_offers po
where not exists (
  select 1 from public.trade_offers t
  where t.listing_id = po.listing_id
    and t.initiator_id = po.buyer_id
    and t.offer_type = 'purchase'
    and t.cash_amount = po.amount
);
