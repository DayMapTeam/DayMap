# DayMap backend — public API foundation

The Express app now serves public health and demo-plan endpoints. Use `server/`, matching the architecture's backend directory.

## Run locally

Use Node 22.9 or newer for the built-in optional env-file loading in these scripts. This is a minimum requirement, not the team's pending Node LTS pin.

From the repository root:

```sh
npm ci
npm run dev
```

The server defaults to port 3001. Optionally copy `server/.env.example` to `server/.env` and change `PORT` or `CLIENT_ORIGIN`. The client origin defaults to `http://localhost:5173`; set it to the exact frontend origin (scheme, host, and port, without a path or trailing slash). Invalid origins fail startup. An existing environment variable takes precedence. Use `npm --prefix server start` without watch mode, and `npm --prefix server run check` to check JavaScript syntax.

## Responsibilities

- `src/app.js` creates and exports the Express app with JSON body parsing. Importing it does not start a listener, so later tests can supply their own HTTP server.
- `src/index.js` validates the port and starts listening. Startup failures exit unsuccessfully.
- Endpoint handlers live in `src/routes/`, mounted in `app.js`. Shared JSON error handling lives in `src/middleware/errors.js`. Repositories, integrations, and planning modules follow with their features.

## Public endpoints

| Request | Response |
| --- | --- |
| `GET /api/health` | `200` with `{ "status": "ok" }`; no dependency checks or secrets |
| `GET /api/demo-plan` | `200` with `shared/fixtures/demoPlan.js`, without authentication or external requests |

```sh
curl http://localhost:3001/api/health
curl http://localhost:3001/api/demo-plan
npm --prefix server test
```

CORS allows browser reads only from the exact `CLIENT_ORIGIN` and handles preflight requests. Other origins receive no allow-origin header. CORS is not authentication: curl and other servers can still call these public endpoi