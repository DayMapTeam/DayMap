# DayMap backend — public API foundation

The Express app now serves public health and demo-plan endpoints. Use `server/`, matching the architecture's backend directory.

## Run locally

Use Node 22.9 or newer for the built-in optional env-file loading in these scripts. This is a minimum requirement, not the team's pending Node LTS pin.

From the repository root:

```sh
npm --prefix server ci
npm --prefix server run dev
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

CORS allows browser reads only from the exact `CLIENT_ORIGIN` and handles preflight requests. Other origins receive no allow-origin header. CORS is not authentication: curl and other servers can still call these public endpoints. Cookie credentials are not enabled. See the [Express CORS documentation](https://expressjs.com/en/resources/middleware/cors/).

JSON parsing uses Express's default 100 KB limit. Unknown endpoints (including `/`) return 404 `NOT_FOUND`; malformed JSON returns 400 `INVALID_JSON`; oversized bodies return 413 `PAYLOAD_TOO_LARGE`. Unsupported charset/encoding returns 415. Unexpected failures return a generic 500 without exposing internal details. All errors use:

```json
{ "error": { "code": "NOT_FOUND", "message": "Endpoint not found", "retryable": false } }
```

Tests use Node's built-in runner and temporary local HTTP servers. They cover public responses, fixture parity, exact-origin CORS/preflight, configuration validation, and JSON errors. Authentication, persistence, and the frontend API connection follow separately; the client now loads `/api/demo-plan` through its service module and Vite dev proxy. Start the client separately with `npm --prefix client run dev`.

The existing architecture is sufficient: no additional controller/service layers are needed yet. Keep request handling in routes, database access in repositories, provider adapters in integrations, and scheduling rules in planning.

The server currently has its own package and lockfile, like the client. Consolidating them into the planned root npm workspaces and one lockfile is a shared scaffold follow-up coordinated with Rafid. There is no backend compilation step or lint configuration yet; `check` is syntax validation only.
