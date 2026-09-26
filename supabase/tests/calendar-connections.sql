-- Run as the owner in a disposable database after migrations 001 through 004.
-- These exercise the real functions and state transitions; simultaneous requests
-- still require a multi-session integration test. All fixture data rolls back.
begin;
insert into auth.users (id) values ('ffffffff-ffff-4fff-8fff-ffffffffffff');

do $$
declare
  u uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  scopes text[] := array['https://www.googleapis.com/auth/calendar.events.readonly'];
begin
  perform private.begin_calendar_connection(u, 'first', now() + interval '10 minutes');
  if private.finish_calendar_connection(u, 'first', 'unclaimed-token', scopes) then
    raise exception 'Unclaimed state could save a token';
  end if;

  update private.calendar_oauth_states set claimed_at = now() where state_hash = 'first';
  perform private.disconnect_calendar(u);
  if private.finish_calendar_connection(u, 'first', 'late-token', scopes) then
    raise exception 'Cancelled exchange reconnected the user';
  end if;
  if exists (select 1 from private.calendar_credentials where user_id = u) then
    raise exception 'Disconnect left a credential behind';
  end if;

  perform private.begin_calendar_connection(u, 'old', now() + interval '10 minutes');
  update private.calendar_oauth_states set claimed_at = now() where state_hash = 'old';
  perform private.begin_calendar_connection(u, 'new', now() + interval '10 minutes');
  update private.calendar_oauth_states set claimed_at = now() where state_hash = 'new';
  if not private.finish_calendar_connection(u, 'new', 'new-token', scopes) then
    raise exception 'Valid connection was rejected';
  end if;
  if private.finish_calendar_connection(u, 'old', 'old-token', scopes) then
    raise exception 'Older exchange replaced a newer connection';
  end if;
  if private.finish_calendar_connection(u, 'new', 'replayed-token', scopes) then
    raise exception 'Completed state could be replayed';
  end if;

  perform private.begin_calendar_connection(u, 'expired', now() - interval '1 minute');
  update private.calendar_oauth_states set claimed_at = now() where state_hash = 'expired';
  if private.finish_calendar_connection(u, 'expired', 'expired-token', scopes) then
    raise exception 'Expired exchange replaced a connection';
  end if;
  if private.disconnect_calendar(u) is distinct from 'new-token' then
    raise exception 'Disconnect did not return the current token for revocation';
  end if;
  if private.disconnect_calendar(u) is not null then
    raise exception 'Repeated disconnect was not idempotent';
  end if;
  if exists (select 1 from private.calendar_oauth_states where user_id = u) then
    raise exception 'Disconnect left an unfinished attempt';
  end if;

  if has_function_privilege('anon', 'private.begin_calendar_connection(uuid,text,timestamptz)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.begin_calendar_connection(uuid,text,timestamptz)', 'EXECUTE')
    or has_function_privilege('anon', 'private.finish_calendar_connection(uuid,text,text,text[])', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.finish_calendar_connection(uuid,text,text,text[])', 'EXECUTE')
    or has_function_privilege('anon', 'private.disconnect_calendar(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.disconnect_calendar(uuid)', 'EXECUTE') then
    raise exception 'Browser database roles can execute Calendar mutation functions';
  end if;
end $$;
rollback;
\echo 'PASS: Calendar completion, cancellation, replacement, expiry, replay and function permissions'
