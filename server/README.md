# DayMap API

This Express server provides public health and demo endpoints plus authenticated
day-plan persistence. Signed-in frontend users load and save their day through the plan API.

## Local setup

Use Node 22.9 or newer. From the repository root:

```sh
npm --prefix server ci
npm --prefix server run dev
```

The server listens on port 3001 by default. Copy `server/.env.example` to the
ignored `server/.env` to configure `PORT`, an exact `CLIENT_ORIGIN`, and the two
Supabase variables. Public endpoints work without Supabase configuration.

```sh
curl http://localhost:3001/api/health
curl http://localhost:3001/api/demo-plan
npm --prefix server test
npm --prefix server run check
```

`GET /api/health` returns `{ "status": "ok" }`. `GET /api/demo-plan` returns
the shared fictional fixture without external calls. The API uses exact-origin
CORS, a 100 KB JSON body limit, and the shared JSON error shape. Importing
`src/app.js` does not start a listener; `src/index.js` does.

Authenticated plan endpoints, Supabase migrations, setup, and isolation tests
are documented in [PERSISTENCE.md](PERSISTENCE.md).
The server-side Google Calendar connection flow is documented in
[CALENDAR.md](CALENDAR.md).
