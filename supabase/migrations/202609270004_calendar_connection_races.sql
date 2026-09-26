begin;

-- Retain claimed attempts until completion, cancellation or expiry. Deleting
-- state before the Google exchange loses the ability to cancel an in-flight call.
alter table private.calendar_oauth_states add column claimed_at timestamptz;

create function private.begin_calendar_connection(p_user_id uuid, p_state_hash text, p_expires_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calendar:' || p_user_id::text, 0));
  delete from private.calendar_oauth_states where user_id = p_user_id;
  insert into private.calendar_oauth_states (state_hash, user_id, expires_at)
    values (p_state_hash, p_user_id, p_expires_at);
end;
$$;

create function private.finish_calendar_connection(p_user_id uuid, p_state_hash text, p_ciphertext text, p_scopes text[])
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calendar:' || p_user_id::text, 0));
  delete from private.calendar_oauth_states
    where state_hash = p_state_hash and user_id = p_user_id
      and claimed_at is not null and expires_at > pg_catalog.now();
  if not found then return false; end if;
  insert into private.calendar_credentials (user_id, refresh_token_ciphertext, scopes)
    values (p_user_id, p_ciphertext, p_scopes)
    on conflict (user_id) do update set refresh_token_ciphertext = excluded.refresh_token_ciphertext,
      scopes = excluded.scopes, updated_at = pg_catalog.now();
  return true;
end;
$$;

create function private.disconnect_calendar(p_user_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare ciphertext text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calendar:' || p_user_id::text, 0));
  delete from private.calendar_oauth_states where user_id = p_user_id;
  delete from private.calendar_credentials where user_id = p_user_id
    returning refresh_token_ciphertext into ciphertext;
  return ciphertext;
end;
$$;

revoke all on function private.begin_calendar_connection(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.finish_calendar_connection(uuid, text, text, text[]) from public, anon, authenticated;
revoke all on function private.disconnect_calendar(uuid) from public, anon, authenticated;
commit;
