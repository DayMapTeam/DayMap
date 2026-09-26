# DayMap

An interactive map that turns your calendar into a personalised daily route and planner, adapting as your plans and travel conditions change.

DayMap puts one day on a 3D map of Adelaide, next to a linked event planner. Google Calendar events, activities you add, and the travel time between them form a single plan. When something runs over, DayMap proposes one clear adjustment and changes nothing until you accept it.

> **Status (September 2026):** initial implementation. The frontend loads the shared demo through Express, with linked map/planner selection and local draft edits. Public health/demo endpoints and the Vite proxy are implemented. Live integrations remain planned.

## Documentation

| Document | Read it for |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, data contract, API, integrations, scheduling rules, environment variables |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Team ownership, kickoff setup, milestones, starter issues, workflow |
| [AGENTS.md](AGENTS.md) | Rules for AI coding agents working in this repository |

## Getting started

Use Node 22 (`nvm install && nvm use`); the minimum supported version is 22.12. From the repository root:

```sh
npm ci
npm run dev
```

This starts Express on port 3001 and Vite on port 5173. Open http://localhost:5173. Vite forwards `/api` to Express, including `/api/health` and `/api/demo-plan`. Use this command instead of VS Code Live Server.

Optional local configuration:

- Copy `client/.env.example` to `client/.env.local` and add a restricted `VITE_GOOGLE_MAPS_API_KEY` to display the Google map. Leave `VITE_API_BASE_URL` empty for the local proxy.
- Copy `server/.env.example` to `server/.env` for backend settings. Defaults are port 3001 and client origin `http://localhost:5173`. Node loads this file through the server scripts; dotenv is not required.
- Restart the dev servers after environment changes. Never commit local environment files.

Root checks: `npm test`, `npm run lint`, and `npm run build`. npm workspaces install both packages using the root `package-lock.json`. See [client/README.md](client/README.md) and [server/README.md](server/README.md) for implementation details.

## Team Members

- Sudipta Bhattacharya
