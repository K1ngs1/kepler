-- ============================================================
-- 023_admin_disputes.sql
-- Introduce an admin role and lock dispute resolution to it.
--
-- resolve_dispute was SECURITY DEFINER with NO caller check, so any
-- authenticated user could call it over PostgREST and resolve their own
-- dispute in their own favour — moving real escrowed USDC. This migration:
--   1. adds profiles.is_admin + an is_admin() helper
--   2. gates resolve_dispute to admins (service_role still allowed)
--   3. lets admins read disputed trades + their messages so the admin
--      screen can list and adjudicate them
--
-- Grant the first admin manually in the dashboard:
--   update public.profiles set is_admin = true where id = '<your-uuid>';
-- ============================================================

-- ─── 1. Admin flag ───
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ─── 2. is_admin() — true when the current caller is a flagged admin.
--       SECURITY DEFINER so it reads profiles regardless of RLS. ───
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ─── 3. Gate resolve_dispute. service_role (edge functions / dashboard)
--       keeps its escape hatch; everyone else must be an admin. ───
create or replace function public.resolve_dispute(
  p_trade_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'Only an administrator can resolve disputes.';
  end if;

  if p_resolution not in ('refund_both', 'release_to_initiator', 'release_to_recipient') then
    raise exception 'Invalid resolution. Must be: refund_both, release_to_initiator, or release_to_recipient.';
  end if;

  -- Drive to 'completed' for all resolutions so the release webhook fires;
  -- polygon-release branches on dispute_resolution to decide the payout.
  -- The status='disputed' guard makes this idempotent.
  update public.trade_offers
  set dispute_resolution = p_resolution,
      dispute_resolved_at = now(),
      status = 'completed',
      updated_at = now()
  where id = p_trade_id
    and status = 'disputed';
end;
$$;

-- ─── 4. Admin read access for adjudication ───
create policy "Admins can view all trades" on public.trade_offers
  for select using (public.is_admin());

create policy "Admins can view all trade messages" on public.trade_messages
  for select using (public.is_admin());
