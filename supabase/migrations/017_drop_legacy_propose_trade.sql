-- ============================================================
-- 017_drop_legacy_propose_trade.sql
-- Remove the obsolete 5-arg overload of propose_mvp_trade.
--
-- Migration 015 added a `p_offer_type` parameter (with a default),
-- which `create or replace function` treats as a NEW signature rather
-- than a replacement. Both overloads ended up coexisting, so a 5-arg
-- RPC call (the trade flow in app/trades/new) matched both candidates
-- and Postgres raised "could not choose the best candidate function".
--
-- The 6-arg version supersedes it (p_offer_type defaults to 'trade'),
-- so we drop the legacy overload.
-- ============================================================

drop function if exists public.propose_mvp_trade(
  uuid, uuid, uuid[], jsonb, numeric
);
