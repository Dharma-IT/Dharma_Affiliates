-- Run once in the Supabase SQL Editor before deploying.
create table if not exists public.affiliate_workbooks (
  id text primary key check (id = 'main'),
  sheets jsonb not null check (jsonb_typeof(sheets) = 'array'),
  revision integer not null check (revision > 0)
);
alter table public.affiliate_workbooks enable row level security;
revoke all on public.affiliate_workbooks from anon, authenticated;
grant select, insert, update on public.affiliate_workbooks to service_role;
-- Browser clients have no direct access. Only the password-protected Vercel
-- Function uses the server-side secret key to read and update this table.
