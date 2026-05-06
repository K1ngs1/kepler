-- ─── 008: Polygon USDC Payments ───
-- Replaces Stripe with on-chain USDC payments on Polygon PoS.

-- Rename stripe_session_id → payment_txn_hash on purchase_offers
alter table public.purchase_offers
  rename column stripe_session_id to payment_txn_hash;

-- Add buyer wallet address to purchase_offers
alter table public.purchase_offers
  add column if not exists buyer_wallet text;

-- Add deposit transaction hashes to trade_offers
alter table public.trade_offers
  add column if not exists initiator_deposit_txn text,
  add column if not exists recipient_deposit_txn text,
  add column if not exists release_txn_hash text;
