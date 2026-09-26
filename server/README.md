# DayMap backend — stage 1

This is the Express application and server entry point. Use `server/`, matching the architecture's backend directory.

## Run locally

Use Node 22.9 or newer for the built-in optional env-file loading in these scripts. This is a minimum requirement, not the team's pending Node LTS pin.

From the repository root:

```sh
npm --prefix server ci
npm --prefix server run dev
```

The server defaults to port 3001. Optionally copy `server/.env.example` to `server/.env` and change `PORT`. An existing environment variable takes precedence. Use `npm --prefix server start` without watch mode, and `npm --prefix server run check` to check JavaScript syntax.

## Responsibilities

- `src/app.js` creates and exports the Express app with JSON body parsing. Importing it does not start a listener, so later tests can supply their own HTTP server.
- `src/index.js` validates the port and starts listening. Startup failures exit unsuccessfully.
- Future endpoint handlers go in `src/routes/` and are mounted in `app.js`. Create middleware, repositories, integrations, and planning modules as their features arrive.

No endpoints are implemented in this stage, so requesting `/` returns Express's default 404. Health and demo-plan endpoints are the next increment. Authentication, persistence, CORS configuration, and the frontend API connection follow separately; the client still imports its fixture directly.

The existing architecture is sufficient: no additional controller/service layers are needed yet. Keep request handling in routes, database access in repositories, provider adapters in integrations, and scheduling rules in planning.

The server currently has its own package and lockfile, like the client. Consolidating them into the planned root npm workspaces and one lockfile is a shared scaffold follow-up coordinated with Rafid. There is no backend compilation step or lint configuration yet; `check` is syntax validation only.
