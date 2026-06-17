-- ============================================================
-- 019_reconcile_schema_drift.sql
-- Idempotently bring a drifted database to the intended baseline.
--
-- The live DB was built by applying migrations piecemeal/out of order, so a
-- few earlier migrations' effects are missing:
--   * 004 never added user_cards.photo_url
--   * 013's middleman_* column drops were never applied
--   * 003's rate_trade may be absent/stale
--
-- This migration re-applies ONLY those gaps, guarded so it is safe to run on
-- any database (already-correct or drifted). It deliberately does NOT recreate
-- accept_trade/complete_trade (which 013 also defined) — those have since been
-- superseded by 016/018, and re-running 013's versions would regress the
-- migration-018 escrow guard.
-- ============================================================

-- ─── 004: optional user-uploaded photo on collection cards ───
alter table public.user_cards
  add column if not exists photo_url text;

-- ─── 013: remove the abandoned middleman columns from trade_offers ───
-- (label_url and tracking_number from 012 are intentionally kept.)
alter table public.trade_offers
  drop column if exists middleman_id,
  drop column if exists middleman_status,
  drop column if exists middleman_fee,
  drop column if exists middleman_confirmed,
  drop column if exists middleman_requested_by;

-- ─── 003: ensure rate_trade exists with the correct definition ───
create or replace function public.rate_trade(p_trade_id uuid, p_rating integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade trade_offers%rowtype;
  v_ratee_id uuid;
begin
  select * into v_trade from trade_offers where id = p_trade_id;

  if v_trade.initiator_id != auth.uid() and v_trade.recipient_id != auth.uid() then
    raise exception 'Not a participant in this trade';
  end if;
  if v_trade.status != 'completed' then
    raise exception 'Trade must be completed before rating';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if v_trade.initiator_id = auth.uid() then
    v_ratee_id := v_trade.recipient_id;
  else
    v_ratee_id := v_trade.initiator_id;
  end if;

  insert into trade_ratings (trade_id, rater_id, ratee_id, rating)
  values (p_trade_id, auth.uid(), v_ratee_id, p_rating);

  update profiles
  set reputation_score = (
    select round(avg(rating))::integer
    from trade_ratings
    where ratee_id = v_ratee_id
  )
  where id = v_ratee_id;
end;
$$;
