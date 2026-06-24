-- ============================================================
-- 021_shipping_tracking.sql
-- Let the shipping party record carrier + tracking number on an
-- accepted trade. This is the evidence anchor for dispute resolution:
-- a "never received" claim is adjudicated against the carrier's
-- delivery scan, not either party's word.
--
-- tracking_number already exists (migration 012). This adds carrier +
-- shipped_at and a mark_shipped RPC restricted to trade participants.
-- ============================================================

alter table public.trade_offers
  add column if not exists carrier text,
  add column if not exists shipped_at timestamptz;

create or replace function public.mark_shipped(
  p_trade_id uuid,
  p_tracking_number text,
  p_carrier text default null
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
  if v_trade.status <> 'accepted' then
    raise exception 'Shipping can only be recorded on an accepted trade.';
  end if;
  if auth.uid() <> v_trade.initiator_id and auth.uid() <> v_trade.recipient_id then
    raise exception 'Only trade participants can record shipping.';
  end if;
  if coalesce(trim(p_tracking_number), '') = '' then
    raise exception 'A tracking number is required.';
  end if;

  update public.trade_offers
  set tracking_number = trim(p_tracking_number),
      carrier = nullif(trim(coalesce(p_carrier, '')), ''),
      shipped_at = now(),
      updated_at = now()
  where id = p_trade_id;
end;
$$;
