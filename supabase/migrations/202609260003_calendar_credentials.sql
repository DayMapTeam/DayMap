begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Only the trusted server's direct PostgreSQL connection may read this schema.
create table private.calendar_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index calendar_oauth_states_expires_at on private.calendar_oauth_states (expires_at);

create table private.calendar_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token_ciphertext text not null,
  scopes text[] not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on all tables in schema private from public, anon, authenticated;
commit;
