-- ============================================================
-- 020_payment_integrity.sql
-- Make the money columns on trade_offers server-authoritative.
--
-- Previously the client could directly `update trade_offers
-- set payment_status='paid'` (PaymentModal did exactly this), which let a
-- purchase complete with no verified on-chain payment. payment_status,
-- payment_txn_hash and release_txn_hash must only ever be written by the
-- edge functions (service role) — polygon-verify (payment in) and
-- polygon-release (funds out). This migration enforces that at the DB level
-- and adds on-chain-tx replay protection.
--
-- Discriminator: end users reach the table as the 'authenticated' (or
-- 'anon') PostgREST role. Edge functions use the service key
-- (role 'service_role'); migrations / direct connections have no JWT
-- (auth.role() is null). The existing SECURITY DEFINER RPCs
-- (complete_trade, auto_complete_stale_trades, open_dispute, resolve_dispute)
-- never touch these three columns, so blocking them for end users does not
-- interfere with the trade state machine.
-- ============================================================

-- ─── 1. Atomic-claim column for polygon-release ───
-- A release is claimed by stamping release_claimed_at in a single conditional
-- update BEFORE any USDC is sent, so concurrent webhook deliveries can't
-- double-spend. release_txn_hash holds the real hash written after the
-- transfer confirms (kept distinct from the claim so the unique index below
-- only ever sees real, unique hashes).
alter table public.trade_offers
  add column if not exists release_claimed_at timestamptz;

-- ─── 2. Guard trigger: only privileged roles may write the money columns ───
create or replace function public.enforce_payment_columns_server_only()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only end-user API roles are restricted. service_role (edge functions)
  -- and null (migrations/direct SQL) pass through untouched.
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if new.payment_status   is distinct from old.payment_status
       or new.payment_txn_hash  is distinct from old.payment_txn_hash
       or new.release_txn_hash  is distinct from old.release_txn_hash
       or new.release_claimed_at is distinct from old.release_claimed_at then
      raise exception
        'payment_status, payment_txn_hash and release fields are server-managed and cannot be set directly.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_payment_columns on public.trade_offers;
create trigger trg_enforce_payment_columns
  before update on public.trade_offers
  for each row
  execute function public.enforce_payment_columns_server_only();

-- ─── 3. Replay protection: an on-chain tx hash can be used at most once ───
-- Partial unique indexes ignore the common NULL case. NOTE: if legacy rows
-- already contain duplicate non-null hashes these creates will fail; dedupe
-- first if so (real tx hashes are globally unique, so this is unexpected).
create unique index if not exists trade_offers_payment_txn_hash_key
  on public.trade_offers (payment_txn_hash)
  where payment_txn_hash is not null;

create unique index if not exists trade_offers_release_txn_hash_key
  on public.trade_offers (release_txn_hash)
  where release_txn_hash is not null;
