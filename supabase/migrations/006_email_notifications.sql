-- ─── 006: Email Notifications preference on profiles ───

alter table public.profiles
  add column if not exists email_notifications boolean not null default false;
