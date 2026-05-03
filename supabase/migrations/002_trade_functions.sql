-- ─── 002: Trade Messages + Trade Logic Functions ───

-- ─── trade_messages ───
create table if not exists public.trade_messages (
  id uuid primary key default uuid_generate_v4(),
  trade_id uuid not null references public.trade_offers(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  sent_at timestamptz not null default now()
);
alter table public.trade_messages enable row level security;

create policy "Participants can view messages" on public.trade_messages for select
  using (
    exists (
      select 1 from public.trade_offers t
      where t.id = trade_id
        and (t.initiator_id = auth.uid() or t.recipient_id = auth.uid())
    )
  );

create policy "Sender can insert own messages" on public.trade_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.trade_offers t
      where t.id = trade_id
        and (t.initiator_id = auth.uid() or t.recipient_id = auth.uid())
        and t.status not in ('completed', 'cancelled')
    )
  );

alter publication supabase_realtime add table public.trade_messages;

-- ─── add confirmation columns to trade_offers if they don't exist ───
alter table public.trade_offers
  add column if not exists initiator_confirmed boolean not null default false,
  add column if not exists recipient_confirmed boolean not null default false;

-- ─── propose_trade ───
create or replace function public.propose_trade(
  p_recipient_id uuid,
  p_offered_card_ids uuid[],
  p_requested_card_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade_id uuid;
  v_card_id uuid;
begin
  -- validate offered cards (caller owns them and they're for_trade)
  foreach v_card_id in array p_offered_card_ids loop
    if not exists (
      select 1 from user_cards
      where id = v_card_id and user_id = auth.uid() and for_trade = true
    ) then
      raise exception 'Card % is not available for trade', v_card_id;
    end if;
  end loop;

  -- validate requested cards (recipient owns them and they're for_trade)
  foreach v_card_id in array p_requested_card_ids loop
    if not exists (
      select 1 from user_cards
      where id = v_card_id and user_id = p_recipient_id and for_trade = true
    ) then
      raise exception 'Requested card % is not available for trade', v_card_id;
    end if;
  end loop;

  -- create trade offer
  insert into trade_offers (initiator_id, recipient_id, status)
  values (auth.uid(), p_recipient_id, 'proposed')
  returning id into v_trade_id;

  -- insert offered cards
  foreach v_card_id in array p_offered_card_ids loop
    insert into trade_items (trade_id, user_card_id, direction)
    values (v_trade_id, v_card_id, 'offer');
  end loop;

  -- insert requested cards
  foreach v_card_id in array p_requested_card_ids loop
    insert into trade_items (trade_id, user_card_id, direction)
    values (v_trade_id, v_card_id, 'request');
  end loop;

  return v_trade_id;
end;
$$;

-- ─── accept_trade ───
create or replace function public.accept_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade trade_offers%rowtype;
  v_card_id uuid;
begin
  select * into v_trade from trade_offers where id = p_trade_id for update;

  if v_trade.recipient_id != auth.uid() then
    raise exception 'Only the recipient can accept a trade';
  end if;
  if v_trade.status != 'proposed' then
    raise exception 'Trade is not in proposed status';
  end if;

  -- verify all cards are still for_trade
  for v_card_id in
    select user_card_id from trade_items where trade_id = p_trade_id
  loop
    if not exists (select 1 from user_cards where id = v_card_id and for_trade = true) then
      raise exception 'Card % is no longer available for trade', v_card_id;
    end if;
  end loop;

  -- mark all involved cards as no longer for_trade
  update user_cards set for_trade = false
  where id in (select user_card_id from trade_items where trade_id = p_trade_id);

  update trade_offers set status = 'accepted', updated_at = now()
  where id = p_trade_id;
end;
$$;

-- ─── counter_offer ───
create or replace function public.counter_offer(
  p_trade_id uuid,
  p_offered_card_ids uuid[],
  p_requested_card_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade trade_offers%rowtype;
  v_card_id uuid;
begin
  select * into v_trade from trade_offers where id = p_trade_id for update;

  if v_trade.initiator_id != auth.uid() and v_trade.recipient_id != auth.uid() then
    raise exception 'Not a participant in this trade';
  end if;
  if v_trade.status not in ('proposed', 'countered') then
    raise exception 'Trade cannot be countered in its current state';
  end if;

  -- validate new offered cards
  foreach v_card_id in array p_offered_card_ids loop
    if not exists (select 1 from user_cards where id = v_card_id and user_id = auth.uid() and for_trade = true) then
      raise exception 'Card % is not available for trade', v_card_id;
    end if;
  end loop;

  -- delete existing items and replace
  delete from trade_items where trade_id = p_trade_id;

  foreach v_card_id in array p_offered_card_ids loop
    insert into trade_items (trade_id, user_card_id, direction)
    values (p_trade_id, v_card_id, 'offer');
  end loop;

  foreach v_card_id in array p_requested_card_ids loop
    insert into trade_items (trade_id, user_card_id, direction)
    values (p_trade_id, v_card_id, 'request');
  end loop;

  update trade_offers set status = 'proposed', updated_at = now()
  where id = p_trade_id;
end;
$$;

-- ─── cancel_trade ───
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
  if v_trade.status not in ('proposed', 'countered') then
    raise exception 'Trade cannot be cancelled in its current state';
  end if;

  update trade_offers set status = 'cancelled', updated_at = now()
  where id = p_trade_id;
end;
$$;

-- ─── complete_trade ───
create or replace function public.complete_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade trade_offers%rowtype;
  v_both_confirmed boolean;
begin
  select * into v_trade from trade_offers where id = p_trade_id for update;

  if v_trade.initiator_id != auth.uid() and v_trade.recipient_id != auth.uid() then
    raise exception 'Not a participant in this trade';
  end if;
  if v_trade.status != 'accepted' then
    raise exception 'Trade must be accepted before confirming completion';
  end if;

  if v_trade.initiator_id = auth.uid() then
    update trade_offers set initiator_confirmed = true, updated_at = now() where id = p_trade_id;
  else
    update trade_offers set recipient_confirmed = true, updated_at = now() where id = p_trade_id;
  end if;

  -- check if both confirmed
  select (initiator_confirmed and recipient_confirmed) into v_both_confirmed
  from trade_offers where id = p_trade_id;

  if v_both_confirmed then
    update trade_offers set status = 'completed', updated_at = now() where id = p_trade_id;
  end if;
end;
$$;
