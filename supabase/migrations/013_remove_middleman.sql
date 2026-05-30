-- ============================================================
-- 013_remove_middleman.sql  – Replace middleman with automated escrow
-- ============================================================

-- ─── 1. Move any in-progress inspection trades to accepted ───
update public.trade_offers set status = 'accepted' where status = 'inspection';

-- ─── 2. Drop middleman columns from trade_offers ───
alter table public.trade_offers
  drop column if exists middleman_id,
  drop column if exists middleman_status,
  drop column if exists middleman_fee,
  drop column if exists middleman_confirmed,
  drop column if exists middleman_requested_by;

-- ─── 3. Simplify accept_trade — always go straight to accepted ───
create or replace function public.accept_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_trade record;
begin
  select * into v_trade from public.trade_offers where id = p_trade_id;

  if v_trade is null then
    raise exception 'Trade not found.';
  end if;
  if v_trade.recipient_id <> auth.uid() then
    raise exception 'Only the recipient can accept.';
  end if;
  if v_trade.status not in ('proposed', 'countered') then
    raise exception 'Trade is not in a proposable state.';
  end if;

  update public.trade_offers
  set status = 'accepted', updated_at = now()
  where id = p_trade_id;
end;
$$;

-- ─── 4. Drop the middleman status function ───
drop function if exists public.update_middleman_status(uuid, text);

-- ─── 5. Simplify complete_trade — remove middleman fee comment ───
create or replace function public.complete_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_trade record;
  v_caller_is_initiator boolean;
begin
  select * into v_trade from public.trade_offers where id = p_trade_id;

  if v_trade is null then
    raise exception 'Trade not found.';
  end if;
  if v_trade.status <> 'accepted' then
    raise exception 'Trade must be accepted before completing.';
  end if;

  v_caller_is_initiator := (auth.uid() = v_trade.initiator_id);

  if v_caller_is_initiator then
    if v_trade.initiator_confirmed then
      raise exception 'You have already confirmed.';
    end if;
    update public.trade_offers
    set initiator_confirmed = true, updated_at = now()
    where id = p_trade_id;
  else
    if auth.uid() <> v_trade.recipient_id then
      raise exception 'Only trade participants can confirm.';
    end if;
    if v_trade.recipient_confirmed then
      raise exception 'You have already confirmed.';
    end if;
    update public.trade_offers
    set recipient_confirmed = true, updated_at = now()
    where id = p_trade_id;
  end if;

  -- Check if both confirmed
  perform 1 from public.trade_offers
  where id = p_trade_id
    and initiator_confirmed = true
    and recipient_confirmed = true;

  if found then
    update public.trade_offers
    set status = 'completed', updated_at = now()
    where id = p_trade_id;
  end if;
end;
$$;
