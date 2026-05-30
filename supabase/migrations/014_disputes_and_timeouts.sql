-- ============================================================
-- 014_disputes_and_timeouts.sql  – Dispute & timeout mechanism
-- ============================================================

-- ─── 1. Add 'disputed' to the status constraint ───
alter table public.trade_offers
  drop constraint trade_offers_status_check;

alter table public.trade_offers
  add constraint trade_offers_status_check
  check (status in ('proposed','countered','accepted','completed','cancelled','disputed'));

-- ─── 2. Add dispute & timeout columns ───
alter table public.trade_offers
  add column if not exists disputed_by uuid references public.profiles(id),
  add column if not exists dispute_reason text,
  add column if not exists disputed_at timestamptz,
  add column if not exists first_confirmed_at timestamptz,
  add column if not exists dispute_resolved_at timestamptz,
  add column if not exists dispute_resolution text
    check (dispute_resolution in ('refund_both','release_to_initiator','release_to_recipient'));

-- ─── 3. Update complete_trade to track first_confirmed_at ───
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

-- ─── 4. open_dispute — either party can open a dispute on an accepted trade ───
create or replace function public.open_dispute(p_trade_id uuid, p_reason text)
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
  if v_trade.status <> 'accepted' then
    raise exception 'Disputes can only be opened on accepted trades.';
  end if;
  if auth.uid() <> v_trade.initiator_id and auth.uid() <> v_trade.recipient_id then
    raise exception 'Only trade participants can open a dispute.';
  end if;

  update public.trade_offers
  set status = 'disputed',
      disputed_by = auth.uid(),
      dispute_reason = p_reason,
      disputed_at = now(),
      updated_at = now()
  where id = p_trade_id;
end;
$$;

-- ─── 5. resolve_dispute — admin resolves a dispute (call via service role) ───
create or replace function public.resolve_dispute(
  p_trade_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
as $$
begin
  if p_resolution not in ('refund_both', 'release_to_initiator', 'release_to_recipient') then
    raise exception 'Invalid resolution. Must be: refund_both, release_to_initiator, or release_to_recipient.';
  end if;

  update public.trade_offers
  set dispute_resolution = p_resolution,
      dispute_resolved_at = now(),
      status = case
        when p_resolution = 'refund_both' then 'cancelled'
        else 'completed'
      end,
      updated_at = now()
  where id = p_trade_id
    and status = 'disputed';
end;
$$;

-- ─── 6. auto_complete_stale_trades — timeout after 7 days ───
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

-- ─── 7. Schedule the cron job (daily at 6 AM UTC) ───
-- Note: pg_cron must be enabled in your Supabase project (Extensions → pg_cron)
-- If pg_cron is not available, run this manually or via a Supabase scheduled function.
select cron.schedule(
  'auto-complete-stale-trades',
  '0 6 * * *',
  $$select public.auto_complete_stale_trades()$$
);
