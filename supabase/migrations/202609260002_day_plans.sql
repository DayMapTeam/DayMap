begin;
create table public.day_plans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  timezone text not null,
  version integer not null check (version > 0),
  plan jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, timezone),
  constraint plan_shape check ((
    jsonb_typeof(plan) = 'object'
    and plan ?& array['id', 'date', 'timezone', 'version', 'dataMode', 'stops', 'legs', 'conflicts', 'questions']
    and plan->>'id' = id::text and plan->>'date' = date::text
    and plan->>'timezone' = timezone and plan->'version' = to_jsonb(version)
    and plan->>'dataMode' in ('demo', 'live')
    and jsonb_typeof(plan->'stops') = 'array' and jsonb_typeof(plan->'legs') = 'array'
    and jsonb_typeof(plan->'conflicts') = 'array' and jsonb_typeof(plan->'questions') = 'array'
  ) is true)
);
alter table public.day_plans enable row level security;
revoke all on public.day_plans from anon, authenticated;
grant select, insert, update on public.day_plans to authenticated;
create policy plans_read on public.day_plans for select to authenticated
  using ((select auth.uid()) = user_id);
create policy plans_create on public.day_plans for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy plans_update on public.day_plans for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Enforce monotonic versions even if a caller bypasses Express and uses REST.
create function public.check_day_plan_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.version <> 1 then
      raise exception 'New plans start at version 1' using errcode = '23514';
    end if;
  else
    if new.id <> old.id or new.user_id <> old.user_id or new.date <> old.date or new.timezone <> old.timezone then
      raise exception 'Plan identity is immutable' using errcode = '23514';
    end if;
    if new.version <> old.version + 1 then
      raise exception 'Stale plan version' using errcode = '40001';
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.check_day_plan_version() from public, anon, authenticated;
create trigger day_plan_version before insert or update on public.day_plans
  for each row execute function public.check_day_plan_version();
commit;
