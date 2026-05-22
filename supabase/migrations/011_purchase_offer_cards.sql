-- ============================================================
-- 011_purchase_offer_cards.sql – Add cards_wanted to purchase_offers
-- ============================================================

-- Store the buyer's free-text description of which cards they want
alter table public.purchase_offers
  add column if not exists cards_wanted text;

-- Enable realtime so sellers see new offers instantly
alter publication supabase_realtime add table public.purchase_offers;
