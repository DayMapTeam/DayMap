-- Run after migrations in a disposable database. Rolls back all test data.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
insert into public.profiles (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.day_plans (id, user_id, date, timezone, version, plan) values (
  '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2026-09-26', 'Australia/Adelaide', 1,
  '{"id":"11111111-1111-4111-8111-111111111111","date":"2026-09-26","timezone":"Australia/Adelaide","version":1,"dataMode":"live","stops":[],"legs":[],"conflicts":[],"questions":[]}'
);
do $$ begin
  if (select count(*) from public.day_plans) <> 1 then raise exception 'Alice cannot read her plan'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Alice cannot read her profile'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
do $$ declare affected integer; begin
  if exists (select 1 from public.day_plans) then raise exception 'Bob can read Alice plan'; end if;
  if exists (select 1 from public.profiles) then raise exception 'Bob can read Alice profile'; end if;
  update public.day_plans set version = 2, plan = jsonb_set(plan, '{version}', '2')
    where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Bob can update Alice plan'; end if;
  update public.profiles set timezone = 'UTC' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Bob can update Alice profile'; end if;
  begin
    insert into public.profiles (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    raise exception 'Bob can create Alice profile';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.day_plans (id, user_id, date, timezone, version, plan) values (
      '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-09-27', 'Australia/Adelaide', 1,
      '{"id":"22222222-2222-4222-8222-222222222222","date":"2026-09-27","timezone":"Australia/Adelaide","version":1,"dataMode":"live","stops":[],"legs":[],"conflicts":[],"questions":[]}'
    );
    raise exception 'Bob can create plans owned by Alice';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.profiles (id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.day_plans (id, user_id, date, timezone, version, plan) values (
  '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '2026-09-26', 'Australia/Adelaide', 1,
  '{"id":"22222222-2222-4222-8222-222222222222","date":"2026-09-26","timezone":"Australia/Adelaide","version":1,"dataMode":"live","stops":[],"legs":[],"conflicts":[],"questions":[]}'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
do $$ declare affected integer; begin
  if (select count(*) from public.day_plans) <> 1 then raise exception 'Alice can read Bob plan'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Alice can read Bob profile'; end if;
  begin
    update public.day_plans set version = 1;
    raise exception 'Unversioned update succeeded';
  exception when serialization_failure then null; end;
  begin
    update public.day_plans set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version = 2;
    raise exception 'Owner reassignment succeeded';
  exception when check_violation or insufficient_privilege then null; end;
  update public.day_plans set version = 2, plan = jsonb_set(plan, '{version}', '2') where version = 1;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Versioned save failed'; end if;
  update public.day_plans set version = 2, plan = jsonb_set(plan, '{version}', '2') where version = 1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Stale save succeeded'; end if;
  begin
    update public.day_plans set version = 3, plan = jsonb_set(plan, '{version}', 'null');
    raise exception 'Invalid JSON version succeeded';
  exception when check_violation then null; end;
  begin
    delete from public.day_plans;
    raise exception 'Unexposed delete operation succeeded';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
do $$ begin
  begin
    perform 1 from public.day_plans;
    raise exception 'Anonymous read succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.profiles;
    raise exception 'Anonymous profile read succeeded';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo 'PASS: two-user RLS, ownership, versioning, JSON constraints, anonymous denial'
