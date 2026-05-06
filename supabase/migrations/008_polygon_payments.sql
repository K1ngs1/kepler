-- ─── 008: Polygon USDC Payments ───
-- Replaces Stripe with on-chain USDC payments on Polygon PoS.

-- Rename Stripe column to blockchain-agnostic
alter table public.purchase_offers
  rename column stripe_session_id to payment_txn_hash;

alter table public.purchase_offers
  add column if not exists payment_method text not null default 'usdc_polygon';

-- Trade deposit columns for Polygon
alter table public.trade_offers
  add column if not exists initiator_deposit_txn text,
  add column if not exists recipient_deposit_txn text,
  add column if not exists deposit_token text not null default 'USDC';

-- Rename deposit boolean columns to be token-agnostic
alter table public.trade_offers
  rename column initiator_deposit_paid to initiator_deposit_locked;

alter table public.trade_offers
  rename column recipient_deposit_paid to recipient_deposit_locked;

-- Release transaction hash for completed trades
alter table public.trade_offers
  add column if not exists release_txn_hash text;

-- Seller wallet address for fund release
alter table public.profiles
  add column if not exists polygon_wallet text;
