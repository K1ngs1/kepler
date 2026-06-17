-- ============================================================
-- 018_require_escrow_before_complete.sql
-- Enforce that any offer carrying money is funded into escrow before
-- it can be confirmed/completed.
--
-- Previously complete_trade only required status='accepted' and both
-- parties' confirmation — it never checked payment_status. That let a
-- purchase, or a trade that includes a cash sweetener, complete with no
-- money ever moving into escrow. Whenever money is owed — offer_type
-- 'purchase', or a trade with cash_amount > 0 — the initiator must have
-- paid (payment_status in 'paid'/'verified') before any confirmation is
-- accepted.
--
-- Re-creates complete_trade from migration 014 with the added guard.
-- ============================================================

create or replace function public.complete_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_trade record;
  v_caller_is_initiator boolean;
  v_both boolean;
begin
  select * into v_trade from public.trade_offers where id = p_trade_id;

  if v_trade is null then
    raise exception 'Trade not found.';
  end if;
  if v_trade.status <> 'accepted' then
    raise exception 'Trade must be accepted before completing.';
  end if;

  -- Any offer carrying money (a purchase, or a trade with a cash sweetener)
  -- must be funded into escrow before anyone can confirm receipt.
  if (v_trade.offer_type = 'purchase' or coalesce(v_trade.cash_amount, 0) > 0)
     and coalesce(v_trade.payment_status, '') not in ('paid', 'verified') then
    raise exception 'Payment must be escrowed before completing.';
  end if;

  v_caller_is_initiator := (auth.uid() = v_trade.initiator_id);

  if v_caller_is_initiator then
    if v_trade.initiator_confirmed then
      raise exception 'You have already confirmed.';
    end if;
    update public.trade_offers
    set initiator_confirmed = true,
        first_confirmed_at = coalesce(first_confirmed_at, now()),
        updated_at = now()
    where id = p_trade_id;
  else
    if auth.uid() <> v_trade.recipient_id then
      raise exception 'Only trade participants can confirm.';
    end if;
    if v_trade.recipient_confirmed then
      raise exception 'You have already confirmed.';
    end if;
    update public.trade_offers
    set recipient_confirmed = true,
        first_confirmed_at = coalesce(first_confirmed_at, now()),
        updated_at = now()
    where id = p_trade_id;
  end if;

  select (initiator_confirmed and recipient_confirmed) into v_both
  from public.trade_offers where id = p_trade_id;

  if v_both then
    update public.trade_offers
    set status = 'completed', updated_at = now()
    where id = p_trade_id;
  end if;
end;
$$;

-- Belt-and-suspenders: the 7-day auto-complete must also skip any
-- money-carrying offer that was never funded into escrow.
create or replace function public.auto_complete_stale_trades()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer := 0;
  v_trade record;
begin
  for v_trade in
    select id from public.trade_offers
    where status = 'accepted'
      and first_confirmed_at is not null
      and first_confirmed_at < now() - interval '7 days'
      and (not initiator_confirmed or not recipient_confirmed)
      and ((offer_type <> 'purchase' and coalesce(cash_amount, 0) = 0)
           or coalesce(payment_status, '') in ('paid', 'verified'))
  loop
    update public.trade_offers
    set initiator_confirmed = true,
        recipient_confirmed = true,
        status = 'completed',
        updated_at = now()
    where id = v_trade.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
