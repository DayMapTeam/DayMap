begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Australia/Adelaide',
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_create on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
commit;
