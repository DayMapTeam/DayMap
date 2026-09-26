begin;
insert into auth.users (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into private.calendar_credentials (user_id, refresh_token_ciphertext, scopes)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'encrypted-test-value', array['calendar.events.readonly']);
insert into private.calendar_oauth_states (state_hash, user_id, expires_at)
values ('test-state-hash', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() + interval '10 minutes');

set local role authenticated;
do $$ begin
  begin
    perform 1 from private.calendar_credentials;
    raise exception 'Authenticated user could read Calendar credentials';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.calendar_oauth_states;
    raise exception 'Authenticated user could read OAuth states';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
do $$ begin
  begin
    perform 1 from private.calendar_credentials;
    raise exception 'Anonymous user could read Calendar credentials';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.calendar_oauth_states;
    raise exception 'Anonymous user could read OAuth states';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo 'PASS: Calendar credentials and OAuth states remain outside public Data API access'
