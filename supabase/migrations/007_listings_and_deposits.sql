-- ─── 007: Listings and Security Deposits ───

-- Listings
create table if not exists public.listings (
  id uuid primary key default uuid_generate_v4(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  price_min numeric,
  price_max numeric,
  pricing_mode text not null default 'market' check (pricing_mode in ('market','custom')),
  trade_preferences text,          -- JSON array of catalog_card_id or free-text
  cover_photo_url text,
  status text not null default 'active' check (status in ('active','sold','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.listings enable row level security;
create policy "Active listings are public" on public.listings for select using (status = 'active');
create policy "Users can view own listings" on public.listings for select using (auth.uid() = seller_id);
create policy "Users can create listings" on public.listings for insert with check (auth.uid() = seller_id);
create policy "Users can update own listings" on public.listings for update using (auth.uid() = seller_id);

-- Listing items (cards in a listing)
create table if not exists public.listing_items (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_card_id uuid references public.user_cards(id) on delete set null,
  catalog_card_id uuid not null references public.catalog_cards(id),
  condition text not null default 'NM',
  custom_price numeric,
  photo_urls jsonb,                -- array of photo URLs for this specific card
  created_at timestamptz not null default now()
);
alter table public.listing_items enable row level security;
create policy "Listing items are visible if listing is visible" on public.listing_items for select using (
  exists (select 1 from public.listings where id = listing_id and (status = 'active' or seller_id = auth.uid()))
);
create policy "Seller can manage listing items" on public.listing_items for all using (
  exists (select 1 from public.listings where id = listing_id and seller_id = auth.uid())
);

-- Listing photos (overall listing photos)
create table if not exists public.listing_photos (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.listing_photos enable row level security;
create policy "Listing photos are visible if listing is visible" on public.listing_photos for select using (
  exists (select 1 from public.listings where id = listing_id and (status = 'active' or seller_id = auth.uid()))
);
create policy "Seller can manage listing photos" on public.listing_photos for all using (
  exists (select 1 from public.listings where id = listing_id and seller_id = auth.uid())
);

-- Purchase Offers
create table if not exists public.purchase_offers (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','paid','completed','cancelled')),
  stripe_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.purchase_offers enable row level security;
create policy "Participants can view purchase offers" on public.purchase_offers for select using (
  auth.uid() = buyer_id or auth.uid() = seller_id
);
create policy "Buyer can create purchase offers" on public.purchase_offers for insert with check (
  auth.uid() = buyer_id
);
create policy "Participants can update purchase offers" on public.purchase_offers for update using (
  auth.uid() = buyer_id or auth.uid() = seller_id
);

-- New columns on trade_offers
alter table public.trade_offers
  add column if not exists cash_amount numeric,
  add column if not exists deposit_amount numeric,
  add column if not exists initiator_deposit_paid boolean not null default false,
  add column if not exists recipient_deposit_paid boolean not null default false,
  add column if not exists listing_id uuid references public.listings(id) on delete set null;

-- NEW POSTGRESQL FUNCTION: propose_trade_from_listing
create or replace function public.propose_trade_from_listing(
  p_listing_id uuid,
  p_recipient_id uuid,
  p_selected_item_ids uuid[],
  p_offered_card_ids uuid[],
  p_cash_amount numeric,
  p_new_cards jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade_id uuid;
  v_card_id uuid;
  v_listing_item_id uuid;
  v_new_card record;
  v_existing_card_id uuid;
  v_created_card_id uuid;
  v_offered_card_ids_final uuid[] := p_offered_card_ids;
  v_seller_user_card_id uuid;
begin
  -- Process new cards the buyer doesn't own yet (they are adding them for this trade)
  if p_new_cards is not null and jsonb_array_length(p_new_cards) > 0 then
    for v_new_card in select * from jsonb_to_recordset(p_new_cards) as x(catalog_card_id uuid, condition text) loop
      -- Check if buyer already owns this card in this condition
      select id into v_existing_card_id
      from user_cards
      where user_id = auth.uid() and catalog_card_id = v_new_card.catalog_card_id and condition = v_new_card.condition
      limit 1;

      if v_existing_card_id is not null then
        update user_cards set quantity = quantity + 1, for_trade = true where id = v_existing_card_id;
        v_offered_card_ids_final := array_append(v_offered_card_ids_final, v_existing_card_id);
      else
        insert into user_cards (user_id, catalog_card_id, condition, quantity, for_trade)
        values (auth.uid(), v_new_card.catalog_card_id, v_new_card.condition, 1, true)
        returning id into v_created_card_id;
        v_offered_card_ids_final := array_append(v_offered_card_ids_final, v_created_card_id);
      end if;
    end loop;
  end if;

  -- Validate offered cards (caller owns them and they're for_trade)
  foreach v_card_id in array v_offered_card_ids_final loop
    if not exists (
      select 1 from user_cards
      where id = v_card_id and user_id = auth.uid() and for_trade = true
    ) then
      raise exception 'Card % is not available for trade', v_card_id;
    end if;
  end loop;

  -- Create trade offer
  insert into trade_offers (initiator_id, recipient_id, status, cash_amount, listing_id)
  values (auth.uid(), p_recipient_id, 'proposed', p_cash_amount, p_listing_id)
  returning id into v_trade_id;

  -- Insert offered cards
  foreach v_card_id in array v_offered_card_ids_final loop
    insert into trade_items (trade_id, user_card_id, direction)
    values (v_trade_id, v_card_id, 'offer');
  end loop;

  -- Insert requested cards from listing items
  foreach v_listing_item_id in array p_selected_item_ids loop
    -- Get the seller's user_card_id from the listing item
    select user_card_id into v_seller_user_card_id
    from listing_items
    where id = v_listing_item_id and listing_id = p_listing_id;

    if v_seller_user_card_id is null then
      raise exception 'Listing item % does not have an associated user card', v_listing_item_id;
    end if;

    if not exists (
      select 1 from user_cards
      where id = v_seller_user_card_id and user_id = p_recipient_id and for_trade = true
    ) then
      raise exception 'Requested card % is not available for trade', v_seller_user_card_id;
    end if;

    insert into trade_items (trade_id, user_card_id, direction)
    values (v_trade_id, v_seller_user_card_id, 'request');
  end loop;

  return v_trade_id;
end;
$$;

-- Allow public access to bucket for listing-photos if you create the bucket
-- Policy for bucket listing-photos could go here if handled by SQL
