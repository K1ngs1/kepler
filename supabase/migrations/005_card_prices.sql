-- ─── 005: Card Prices — market value estimates for trade fairness ───

create table if not exists public.card_prices (
  id uuid primary key default uuid_generate_v4(),
  catalog_card_id uuid not null references public.catalog_cards(id) on delete cascade,
  market_price numeric(10,2) not null,
  updated_at timestamptz not null default now(),
  unique (catalog_card_id)
);

alter table public.card_prices enable row level security;
create policy "Card prices are publicly readable" on public.card_prices for select using (true);
create policy "Only service role can manage prices" on public.card_prices for all using (false);
