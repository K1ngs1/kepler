-- ─── 003: Reputation System + Cancel Fix ───

-- ─── trade_ratings table ───
create table if not exists public.trade_ratings (
  id uuid primary key default uuid_generate_v4(),
  trade_id uuid not null references public.trade_offers(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  ratee_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (trade_id, rater_id)
);
alter table public.trade_ratings enable row level security;

do $$ begin
  create policy "Ratings are publicly viewable" on public.trade_ratings for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can insert own ratings" on public.trade_ratings for insert
    with check (auth.uid() = rater_id);
exception when duplicate_object then null; end $$;

-- ─── rate_trade ───
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

-- ─── fix cancel_trade: restore for_trade = true on involved cards ───
create or replace function public.cancel_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade trade_offers%rowtype;
begin
  select * into v_trade from trade_offers where id = p_trade_id;

  if v_trade.initiator_id != auth.uid() and v_trade.recipient_id != auth.uid() then
    raise exception 'Not a participant in this trade';
  end if;
  if v_trade.status not in ('proposed', 'countered', 'accepted') then
    raise exception 'Trade cannot be cancelled in its current state';
  end if;

  -- unlock all cards involved in this trade
  update user_cards
  set for_trade = true, updated_at = now()
  where id in (select user_card_id from trade_items where trade_id = p_trade_id);

  update trade_offers set status = 'cancelled', updated_at = now()
  where id = p_trade_id;
end;
$$;
