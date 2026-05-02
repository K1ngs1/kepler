-- ─── Kepler Trading Platform Schema ───
-- Run this in your Supabase project: SQL Editor → New Query → paste & run

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── profiles ───
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_url text,
  location text,
  reputation_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── catalog_cards ───
create table if not exists public.catalog_cards (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  set_name text not null,
  set_code text not null,
  number text not null,
  rarity text,
  image_url text,
  tcgdex_id text unique,
  created_at timestamptz not null default now()
);
alter table public.catalog_cards enable row level security;
create policy "Catalog is publicly readable" on public.catalog_cards for select using (true);

-- ─── user_cards (collection) ───
create table if not exists public.user_cards (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  catalog_card_id uuid not null references public.catalog_cards(id) on delete cascade,
  condition text not null default 'NM',
  quantity integer not null default 1,
  for_trade boolean not null default false,
  wanted boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, catalog_card_id, condition)
);
alter table public.user_cards enable row level security;
create policy "Users can view own cards" on public.user_cards for select using (auth.uid() = user_id);
create policy "Users can insert own cards" on public.user_cards for insert with check (auth.uid() = user_id);
create policy "Users can update own cards" on public.user_cards for update using (auth.uid() = user_id);
create policy "Users can delete own cards" on public.user_cards for delete using (auth.uid() = user_id);
create policy "Trade cards are visible to others" on public.user_cards for select using (for_trade = true);

-- ─── trade_offers ───
create table if not exists public.trade_offers (
  id uuid primary key default uuid_generate_v4(),
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'proposed'
    check (status in ('proposed','countered','accepted','completed','cancelled')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.trade_offers enable row level security;
create policy "Trade participants can view" on public.trade_offers for select
  using (auth.uid() = initiator_id or auth.uid() = recipient_id);
create policy "Initiator can create trade" on public.trade_offers for insert
  with check (auth.uid() = initiator_id);
create policy "Participants can update trade" on public.trade_offers for update
  using (auth.uid() = initiator_id or auth.uid() = recipient_id);

-- ─── trade_items (cards in each trade offer) ───
create table if not exists public.trade_items (
  id uuid primary key default uuid_generate_v4(),
  trade_id uuid not null references public.trade_offers(id) on delete cascade,
  user_card_id uuid not null references public.user_cards(id) on delete cascade,
  direction text not null check (direction in ('offer','request')),
  created_at timestamptz not null default now()
);
alter table public.trade_items enable row level security;
create policy "Trade item participants can view" on public.trade_items for select
  using (
    exists (
      select 1 from public.trade_offers t
      where t.id = trade_id
        and (t.initiator_id = auth.uid() or t.recipient_id = auth.uid())
    )
  );

-- ─── lots (auction listings) ───
create table if not exists public.lots (
  id serial primary key,
  catalog_card_id uuid references public.catalog_cards(id),
  seller_id uuid references public.profiles(id),
  title text not null,
  grade text,
  grade_label text,
  set_name text,
  current_price numeric(10,2) not null default 0,
  buy_now_price numeric(10,2),
  bids_count integer not null default 0,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','ended','cancelled')),
  created_at timestamptz not null default now()
);
alter table public.lots enable row level security;
create policy "Active lots are public" on public.lots for select using (status = 'active');

-- ─── bids ───
create table if not exists public.bids (
  id uuid primary key default uuid_generate_v4(),
  lot_id integer not null references public.lots(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);
alter table public.bids enable row level security;
create policy "Bidder can view own bids" on public.bids for select using (auth.uid() = bidder_id);
create policy "Authenticated users can bid" on public.bids for insert with check (auth.uid() = bidder_id);

-- ─── enable real-time for key tables ───
alter publication supabase_realtime add table public.lots;
alter publication supabase_realtime add table public.bids;
alter publication supabase_realtime add table public.trade_offers;
