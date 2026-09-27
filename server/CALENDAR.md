# Google Calendar connection backend (DM-06)

The server connects a user's Google Calendar and imports one day of events
into their saved day plan (#30). It never changes Google Calendar. In the app,
signed-in users connect, import and disconnect from the account menu (#34).

## Team configuration

Use a team-owned Google Cloud project and one OAuth **web application** client
for each environment. Enable the Google Calendar API and configure the consent
screen. Add each developer's own Google account as a test user while the app is
in Testing. Register the exact callback URL:

```text
http://localhost:3001/api/calendar/callback
```

The OAuth client ID identifies the DayMap app. The client secret is a server
secret, not a personal Google API key. Every developer signs in with their own
Google account and grants access to that account's Calendar. No teammate needs
your Google password, your Calendar tokens, or your personal Cloud project.
Google's Testing mode may expire Calendar grants and refresh tokens after seven
days; reconnect during development.

Set these in ignored `server/.env` or the deployment secret store:

```text
DATABASE_URL=<server-only direct PostgreSQL URL for the shared dev project>
GOOGLE_OAUTH_CLIENT_ID=<team OAuth web client ID>
GOOGLE_OAUTH_CLIENT_SECRET=<team OAuth web client secret>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/api/calendar/callback
TOKEN_ENCRYPTION_KEY=<base64-encoded 32-byte key>
```

Locally, `npm run setup` fills in all five and generates the encryption key. By hand, generate it with `openssl rand -base64 32`. Keep one stable
key for an environment; changing it makes existing stored refresh tokens
unreadable. Never commit the values. The direct database credential can read
the `private` schema and must stay on the server. Apply
`supabase/migrations/202609260003_calendar_credentials.sql`, then
`supabase/migrations/202609270004_calendar_connection_races.sql` after the first
two migrations, before starting the updated backend. Use the existing environment's
encryption key when sharing a database; do not generate a different key per developer.
The database login must own the Calendar tables/functions or have explicitly granted
access. Browser roles cannot call these functions.

## Backend endpoints

All three user routes require a Supabase access token in
`Authorization: Bearer <token>`. The server checks that session before using
the associated user ID.

- `POST /api/calendar/connect` returns `{ "url": "https://accounts.google.com/..." }`.
  Navigate the browser to the URL. It requests only
  `calendar.events.readonly`, offline access, and a fresh consent.
- `GET /api/calendar/callback` is the exact Google redirect. A one-time,
  ten-minute state binds it to the user who started the flow. It exchanges
  the code on the server, encrypts the refresh token, and redirects to the
  configured frontend origin with `?calendar=connected`, `?calendar=denied`
  or `?calendar=error&reason=<CODE>` (for example `INVALID_OAUTH_STATE`,
  `CALENDAR_RECONNECT_REQUIRED`, `CALENDAR_NOT_CONFIGURED`). It never shows an
  error page on the API origin and never returns a Google token to the browser.
- `GET /api/calendar/status` returns `{ "connected": true | false }`.
- `POST /api/calendar/disconnect` deletes the stored credential and attempts
  Google revocation. It returns `{ "disconnected": true, "revoked": boolean }`.
  If revocation is unavailable, local access is still deleted.
- `POST /api/calendar/import` takes `{ "date": "YYYY-MM-DD", "timezone": "<IANA>" }`
  and optionally `"restoreRemoved": true` (bring back every removed event) or
  `"restoreEvents": [{ "sourceCalendarId", "sourceEventId" }]` (at most 500;
  bring back just those), and returns
  `{ "plan": {...}, "summary": { "added", "updated", "removed", "hidden" } }`
  (201 when it created the day's plan, otherwise 200). See **Event import** below.

Starting another connection replaces that user's unfinished attempt. A callback
claims its state once, then waits for Google without holding a database lock.
Completion and disconnect use the same per-user PostgreSQL transaction lock:
completion saves only if the claimed attempt still exists and has not expired.
If disconnect or a newer connect removed it, completion returns 409
`CALENDAR_CONNECTION_CANCELLED`. This also works across separate server processes.
An old refresh failure deletes only the credential it actually used; a successful
refresh checks that credential is still current before returning an access token.
Expired attempts are cleaned up when a new connection starts.

Google revocation remains best-effort, outside the database transaction. Local
cancellation does not guarantee cancellation of a Google request already in flight.

No Calendar request runs in demo mode. The server refuses a partial Calendar
configuration. Missing configuration returns 503 for Calendar endpoints.

## In the app

- The account menu shows the Calendar status and **Connect Google Calendar**,
  **Import today's events** or **Disconnect**. An empty day offers the same.
- Back from Google, DayMap shows the outcome, removes `?calendar=…` from the
  address bar and, after a successful connection, imports today straight away.
- With Calendar connected, each loaded day is imported once automatically, so
  opening DayMap shows the day's events. A message appears only if something changed.
- Import waits until local changes are saved and no draft is pending. If the day
  changes locally while an import runs, the import result is not applied over it.
- On start-up the server logs whether sign-in and Calendar are configured (naming
  missing variables, never values) and whether the Calendar migrations are applied.
  Unexpected server errors are logged with their code and message only.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Menu says "Not set up on this server" | Set all five Calendar variables in `server/.env` and restart. |
| Server logs "Google Calendar database: not ready" | Apply migrations 003 and 004 to the database in `DATABASE_URL`. |
| Google shows `redirect_uri_mismatch` | Register exactly `http://localhost:3001/api/calendar/callback` on the OAuth client, matching `GOOGLE_OAUTH_REDIRECT_URI`. |
| Google shows "access blocked" / app not verified | Add your Google account as a test user on the consent screen. |
| Back in DayMap with "didn't grant offline Calendar access" | Connect again and tick the Calendar permission. |
| Import says access expired | Testing-mode grants expire after seven days; use **Reconnect**. |

## Verification

Run `npm --prefix server test` and `npm --prefix server run check`. Regression
tests pause mocked Google exchanges and exercise disconnect, a replacement
connection, replay, expiry, and late refresh responses. They use a fake database.

For actual SQL checks, start the disposable PostgreSQL container described in
`PERSISTENCE.md` and apply migrations 001 and 002, then run from the repository root:

```sh
docker exec -i daymap-dm04-test psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202609260003_calendar_credentials.sql
docker exec -i daymap-dm04-test psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202609270004_calendar_connection_races.sql
docker exec -i daymap-dm04-test psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/calendar-isolation.sql
docker exec -i daymap-dm04-test psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/calendar-connections.sql
docker stop daymap-dm04-test
```

The SQL checks verify actual functions, transitions and permissions. They do not
exercise simultaneous database sessions or live Google OAuth. After configuring
the team's environment, verify real consent, status and disconnect with a test
account before wiring event import into the frontend.

## Event import

`server/src/integrations/googleCalendar.js` is the provider adapter. It receives
a server-held access token, the primary calendar ID and the local day's UTC
boundaries (`shared/planning/dayBounds.js`, daylight-saving safe). It requests
`events.list` with `singleEvents=true`, so recurring events arrive as
occurrences, and follows `nextPageToken`. The access token is sent only in the
`Authorization` header to Google and never leaves `calendar/service.js`.

Normalisation:

- Timed events become `fixed` stops with their original start and end.
  A timed event longer than 24 hours is shown as `all-day`.
- Date-only events become `all-day` stops with no invented times.
- Cancelled events and events the user declined are skipped.
- Stop IDs are UUIDs derived from calendar ID + event ID, so a re-import
  produces the same IDs.
- Calendar location text is never guessed into a map pin. Every new stop has
  `location: null` and a location question quoting the Calendar text, or
  noting an online meeting.

`calendar/importPlan.js` merges into the saved plan for that date and timezone,
or creates one with `dataMode: 'live'`:

- Deduplicates by `sourceCalendarId` + `sourceEventId`.
- Updates the title and times of existing Calendar stops, keeping their ID,
  status and any location the user already confirmed. A deferred location
  question stays deferred. A Calendar event the person made flexible (#38)
  keeps its DayMap times; only its title follows Calendar. A stop the person
  renamed or re-timed in DayMap (`localEdits: ['title' | 'time']`, #61) keeps
  that title or those times.
- Removes Calendar stops whose event no longer exists, unless completed.
- Leaves out events the person removed in DayMap (`plan.removedEvents`) and
  counts them in `summary.hidden`. `restoreRemoved: true` clears that list and
  imports them again; `restoreEvents` does the same for just those events.
  A removed event no longer in Calendar for that day (deleted, declined or
  moved) is dropped from the list, so the hidden count stays true.
- Any accepted change to a Calendar stop's times in DayMap (an edit, an
  accepted suggestion, a stop added in front that moves it) records
  `localEdits: ['time']`, so a quiet re-import never moves it back.
- Never touches manual stops.

The merged plan passes the same validation as `PUT /api/plans/:id` and is saved
with the loaded version, so a concurrent save returns 409 `VERSION_CONFLICT`
and changes nothing. An unchanged import returns the saved plan without a new
version. Google failures return 503 (retryable) or 409
`CALENDAR_RECONNECT_REQUIRED`, leaving the saved plan untouched.

Resolving Calendar location text into coordinates needs the server Places key
and the provider-retention decision (ARCHITECTURE §12), so it is not done yet.

The Google Maps browser key and any server Places/Routes key are separate from
Calendar OAuth. Use keys owned by the team project, restricted to the APIs and
origins or server environment that need them. Supabase's publishable key may
be used by every developer against the shared project, but each person uses
their own Supabase Auth account; secret/database credentials stay server-side.
