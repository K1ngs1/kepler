-- ============================================================
-- 010_listing_messages.sql  – Buyer↔Seller messaging on listings
-- ============================================================

-- Messages scoped to a listing + conversation pair
create table if not exists public.listing_messages (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  read boolean not null default false,
  sent_at timestamptz not null default now()
);

alter table public.listing_messages enable row level security;

-- Participants can read their own messages
create policy "Message participants can view"
  on public.listing_messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Authenticated users can send messages on active listings
create policy "Authenticated users can send messages"
  on public.listing_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
      and l.status = 'active'
    )
  );

-- Mark as read
create policy "Recipient can update read status"
  on public.listing_messages for update
  using (auth.uid() = recipient_id);

-- Enable realtime
alter publication supabase_realtime add table public.listing_messages;
