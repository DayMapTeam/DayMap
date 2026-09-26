# Google Calendar connection backend (DM-06)

This branch implements the server-side connection foundation. It does not yet
import events or change Google Calendar. Rafid's Calendar adapter and the
frontend connection UI remain separate work.

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

Generate the encryption key with `openssl rand -base64 32`. Keep one stable
key for an environment; changing it makes existing stored refresh tokens
unreadable. Never commit the values. The direct database credential can read
the `private` schema and must stay on the server. Apply
`supabase/migrations/202609260003_calendar_credentials.sql` after the first
two migrations.

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
  configured frontend origin with `?calendar=connected` or
  `?calendar=denied`. It never returns a Google token to the browser.
- `GET /api/calendar/status` returns `{ "connected": true | false }`.
- `POST /api/calendar/disconnect` deletes the stored credential and attempts
  Google revocation. It returns `{ "disconnected": true, "revoked": boolean }`.
  If revocation is unavailable, local access is still deleted.

No Calendar request runs in demo mode. The server refuses a partial Calendar
configuration. Missing configuration returns 503 for Calendar endpoints.

## Next integration

Rafid's adapter should accept an access token supplied by the server, a
primary-calendar ID, and timezone-aware UTC day boundaries. It should return
normalized DayMap stops, expand recurring occurrences, follow pagination, and
handle cancellations, all-day and unlocated events. The backend will refresh
access tokens from the encrypted credential, deduplicate by calendar plus event
ID, and save imported stops through versioned plan operations. Agree that
adapter's exact input/output contract before adding `POST /api/calendar/import`.

The Google Maps browser key and any server Places/Routes key are separate from
Calendar OAuth. Use keys owned by the team project, restricted to the APIs and
origins or server environment that need them. Supabase's publishable key may
be used by every developer against the shared project, but each person uses
their own Supabase Auth account; secret/database credentials stay server-side.
