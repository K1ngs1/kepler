-- ============================================================
-- 016_counter_trade.sql  – Add counter-offer functionality
-- ============================================================

-- Counter a trade: the recipient proposes new terms (different cards/cash)
-- and the roles flip — the original initiator becomes the new recipient.
create or replace function public.counter_trade(
  p_trade_id uuid,
  p_offered_cards jsonb default '[]'::jsonb,
  p_cash_amount numeric default 0
)
returns void
language plpgsql
security definer
as $$
declare
  v_trade record;
  v_caller uuid := auth.uid();
begin
  select * into v_trade from public.trade_offers where id = p_trade_id;

  if v_trade is null then
    raise exception 'Trade not found.';
  end if;

  -- Only the current recipient can counter
  if v_trade.recipient_id <> v_caller then
    raise exception 'Only the recipient can counter this offer.';
  end if;

  -- Can only counter proposed or previously countered offers
  if v_trade.status not in ('proposed', 'countered') then
    raise exception 'Trade is not in a state that can be countered.';
  end if;

  -- Swap initiator/recipient and update terms
  update public.trade_offers
  set
    status = 'countered',
    initiator_id = v_caller,
    recipient_id = v_trade.initiator_id,
    offered_cards = p_offered_cards,
    cash_amount = p_cash_amount,
    updated_at = now()
  where id = p_trade_id;
end;
$$;

-- Update accept_trade to allow the new recipient (after counter) to accept
-- (already handles 'countered' status, but ensure recipient check works after swap)
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
