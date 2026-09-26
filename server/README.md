# DayMap backend

Express serves the public health/demo API and authenticated plan read/save endpoints.
The browser uses `/api`; ordinary database requests use the caller's verified
Supabase token and owner-scoped RLS. No service-role key is required.

## Run and verify

Use Node 22 (minimum 22.12), selected by the root `.nvmrc`:

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
```

Run these commands from the repository root. Vite listens on 5173 and proxies
`/api` to Express on 3001. `npm run dev --workspace=server` starts only Express;
`npm run start --workspace=server` runs without file watching.

Optional configuration goes in ignored `server/.env`; see `.env.example`.
`CLIENT_ORIGIN` must be one exact HTTP(S) origin with no path/trailing slash.
Supabase configuration is optional for the public demo. See
[PERSISTENCE.md](PERSISTENCE.md) for project setup, migrations, endpoint examples,
and two-user database tests. The account UI is still separate work.

## Implemented routes

| Request | Result |
| --- | --- |
| `GET /api/health` | Public `200 { "status": "ok" }` |
| `GET /api/demo-plan` | Public fictional fixture; no external requests |
| `GET /api/plans?date=YYYY-MM-DD&timezone=Australia%2FAdelaide` | Verified user's matching plan as `{ "plans": [...] }` |
| `PUT /api/plans/:id` | Create at base version 0 or atomically update an existing version |

JSON errors use `{ "error": { "code": "...", "message": "...", "retryable": false } }`.
Malformed JSON returns 400, bodies above 100 KB return 413, invalid sessions return
401, unknown endpoints/inaccessible plans return 404, stale saves return 409, and
provider failures return 503 without exposing internal details. CORS permits only
`CLIENT_ORIGIN`; it is browser policy and does not replace authentication.

`src/app.js` constructs the app without opening a port; `src/index.js` validates
PORT and starts listening. Request handling belongs in routes, database access in
repositories, provider adapters in integrations, and scheduling in planning.
There is no backend compilation step: build runs syntax checks. Node tests cover
HTTP behavior, verification/identity forwarding, version conflicts, invalid data,
and failure preservation; SQL tests separately exercise PostgreSQL RLS.
