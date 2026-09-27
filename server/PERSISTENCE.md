# DM-04: authenticated persistence

The public demo remains available without Supabase. Persistence uses Supabase
Auth's `/auth/v1/user` endpoint to verify each Bearer token and forwards that same
token to PostgREST. No service-role key or new runtime dependency is needed.
The frontend signs in with Supabase Auth and saves the accepted plan through these endpoints (#32); see `client/README.md`.

## Shared development project

1. Create one Supabase development project in the team's organisation and agreed
   region. Store its database password privately.
2. Apply `supabase/migrations/202609260001_profiles.sql`, then
   `202609260002_day_plans.sql` (and `202609260003_calendar_credentials.sql`,
   then `202609270004_calendar_connection_races.sql`
   when testing the Calendar backend) using the Supabase migration workflow. With the
   Supabase CLI installed and authenticated: `supabase link --project-ref <ref>`
   then `supabase db push`. Review the target before pushing.
3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in ignored `server/.env`.
   Both must be present. Use the project origin without a trailing slash.
4. Run `npm --prefix server run dev`. Unauthenticated requests to `/api/plans` return 401.
   A supplied token with no Supabase configuration returns 503
   `AUTH_NOT_CONFIGURED`; public demo endpoints continue working.
5. Create two test users through Supabase Auth, sign in separately, and exercise
   the API examples below using their access tokens. Do not put tokens in Git,
   screenshots, or PR descriptions.

## Local Supabase (no shared project needed)

`supabase/config.toml` runs the whole stack (Postgres, Auth, PostgREST) in Docker.
`npm run setup` in the repository root does everything in this section for you.
By hand, with Docker running and Node 22:

```sh
npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor
```

The first run downloads images, then applies every file in `supabase/migrations/`.
It prints the local `API_URL` (`http://127.0.0.1:54321`) and `PUBLISHABLE_KEY`.
Put them in `server/.env` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) and
`client/.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). These
are Supabase's fixed local defaults, not secrets. Email/password sign-up works
immediately, since local confirmation emails are off (sent mail appears at
`http://127.0.0.1:54324`). Google sign-in and Calendar still need Google OAuth
credentials. The Calendar `DATABASE_URL` is
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

Use `npx supabase stop` to stop the stack (data is kept) and `npx supabase db reset` to
wipe it and reapply the migrations. Studio (`-x` above leaves it on) is at
`http://127.0.0.1:54323` for browsing tables.

Profiles contain timezone/preferences and are created explicitly by their owner;
there is no signup trigger or profile endpoint yet. Day plans reference Auth users
directly, so saving does not depend on a profile row already existing.

## API for the frontend owners

All requests use `Authorization: Bearer <Supabase access token>`. Identity is derived
from Auth, never a body `userId`. Browser application-data calls go through Express.
Responses for authenticated routes have `Cache-Control: no-store`.

`GET /api/plans?date=2026-09-26&timezone=Australia%2FAdelaide` returns
`200 { "plans": [] }` or a single matching plan in that array. There is at most one
plan per user/date/timezone. Date and timezone are required, validated parameters.

`PUT /api/plans/<UUID>` takes `{ "baseVersion": 0, "plan": { ... } }` to create.
The plan must have the same UUID as the path and `version: 0`. Success returns the
complete saved plan with `version: 1` and status 201. To update, send the accepted
plan's version as both `baseVersion` and `plan.version`; success returns status 200
and increments the version. Date, timezone, ID and owner are immutable on update.
Use a new UUID to create a different day.

For example, the initial empty plan body is:

```json
{
  "baseVersion": 0,
  "plan": {
    "id": "11111111-1111-4111-8111-111111111111",
    "date": "2026-09-26",
    "timezone": "Australia/Adelaide",
    "version": 0,
    "dataMode": "live",
    "stops": [],
    "legs": [],
    "conflicts": [],
    "questions": []
  }
}
```

Conflicting saves return 409 `VERSION_CONFLICT`; reload and let the user decide
before retrying. An update to a missing or another user's plan returns 404
`PLAN_NOT_FOUND`. Invalid input returns 400 `INVALID_PLAN`. Expired, invalid and
missing sessions return 401 `INVALID_SESSION`. Provider outages return 503 without
exposing upstream details or altering accepted data. Errors retain the shared
`{ "error": { "code": "...", "message": "...", "retryable": false } }` shape.

The 100 KB JSON body limit remains. Stop fields follow the documented contract;
live stop IDs are UUIDs. Unlocated stops require a location question. Journey
persistence and non-null place IDs are rejected until provider retention and
journey contracts are agreed (DM-07). DM-04 does not calculate routes or schedules.
Annotation fields in this implementation are proposed for teammate review:
questions `{ id?, stopId, field, prompt, status }`, conflicts
`{ id, stopIds, code, message }`. Preview/accept endpoints remain unimplemented.

## Verification

`npm --prefix server test` includes mocked Auth/PostgREST HTTP-boundary tests for two users,
concurrent saves, invalid sessions, validation and outage preservation. These
tests do not claim to exercise hosted Supabase.

For actual PostgreSQL RLS and migration tests using Docker:

```sh
docker run --detach --rm --name daymap-dm04-test -e POSTGRES_PASSWORD=local-test-only postgres:17-alpine
# Wait until: docker exec daymap-dm04-test pg_isready -U postgres
docker exec -i daymap-dm04-test psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/bootstrap-postgres.sql
docker exec -i daymap-dm04-test psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202609260001_profiles.sql
docker exec -i daymap-dm04-test psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202609260002_day_plans.sql
docker exec -i daymap-dm04-test psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/isolation.sql
docker stop daymap-dm04-test
```

The bootstrap is **only** for the disposable plain-Postgres test container;
Supabase already provides `auth.users`, roles and `auth.uid()`. Isolation tests
switch database roles and two fictional user identities, check owner reads/writes,
forged ownership, stale versions, JSON constraints and anonymous denial, then roll
back all test data. A hosted two-session smoke test is still needed after project
creation and configuration.
