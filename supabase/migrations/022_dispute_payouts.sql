-- ============================================================
-- 022_dispute_payouts.sql
-- Wire dispute resolution to real money movement.
--
-- Before this migration resolve_dispute only flipped a status flag and
-- no funds ever moved: refund_both set status='cancelled' (which the
-- release webhook never fires on) and the release_to_* paths set
-- status='completed' but polygon-release hard-required both parties to
-- have confirmed receipt (a disputed trade never has) and only ever paid
-- the seller. So every resolution stranded escrowed USDC in the merchant
-- wallet.
--
-- Fix: every resolution now drives status -> 'completed', which fires the
-- same `trade_offers UPDATE (status -> completed)` webhook that calls
-- polygon-release. polygon-release reads `dispute_resolution` and pays out
-- accordingly (see supabase/functions/polygon-release). The resolution
-- detail is preserved in dispute_resolution, so the UI still distinguishes
-- a refund from a normal completion.
-- ============================================================

create or replace function public.resolve_dispute(
  p_trade_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
as $$
begin
  if p_resolution not in ('refund_both', 'release_to_initiator', 'release_to_recipient') then
    raise exception 'Invalid resolution. Must be: refund_both, release_to_initiator, or release_to_recipient.';
  end if;

  -- Drive to 'completed' for all resolutions so the release webhook fires.
  -- polygon-release branches on dispute_resolution to decide who is paid.
  -- The conditional on status='disputed' makes this idempotent: a second
  -- call (or a re-resolution attempt) matches no row and moves no money.
  update public.trade_offers
  set dispute_resolution = p_resolution,
      dispute_resolved_at = now(),
      status = 'completed',
      updated_at = now()
  where id = p_trade_id
    and status = 'disputed';
end;
$$;
