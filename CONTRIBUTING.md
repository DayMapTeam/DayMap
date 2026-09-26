# Contributing to DayMap

DayMap turns a day's activities into a geographic map and a linked planner. This guide defines our initial work split, shared setup, and first GitHub Project issues. See [ARCHITECTURE.md](ARCHITECTURE.md) for technical contracts.

**Status:** initial plan, September 2026. The repository currently has documentation only. Directories, commands, endpoints, and environment variables below are targets for the first implementation issues, not features already available.

## 1. Team ownership

| Person | Initial responsibility | First deliverable | Review partner |
| --- | --- | --- | --- |
| Hannah | App layout and planner | Floating event panel reading the shared sample plan | Rafid |
| Rafid | Project scaffold, shared frontend state, and map | App shell plus an Adelaide map with selectable stops | Hannah |
| Shudipto | Backend, Supabase, and integrations | Express health endpoint, sample-plan endpoint, and initial database migration | Rafid |

Ownership means coordinating changes, not working alone. Rafid owns shared configuration initially to avoid conflicting scaffolds and lockfiles. Shudipto owns database migrations. Agree before changing another person's component interface.

The backend has the largest workload. After the map works, Rafid helps connect Places and Routes. After the planner works, Hannah builds login, Calendar connection, and integration error screens against Shudipto's endpoints.

## 2. Shared setup before splitting up

Do this together in one short kickoff. Leave with one sample plan and one runnable scaffold.

| Setup | Coordinator | Completion check |
| --- | --- | --- |
| Repository access | Rafid | Hannah and Shudipto can clone and push feature branches using their own GitHub accounts |
| GitHub Project | Rafid | Board uses Backlog, Ready, In progress, In review, Done; issues have an owner and milestone |
| Runtime and package manager | Rafid | One supported Node LTS version is pinned in `.nvmrc`; everyone uses npm and the committed lockfile |
| Scaffold and development commands | Rafid, with Shudipto | React/JavaScript/Vite client and Express/JavaScript server start with one root command |
| Shared contract and fixture | All three | Agree on stop fields, stable IDs, missing locations, timezone, and map/card selection; commit one fictional Adelaide sample plan |
| Google Cloud project | Rafid | Enable Maps JavaScript, Places, Routes, and Calendar APIs as needed; configure billing/quota controls and separate browser/server credentials |
| Google OAuth | Shudipto | Configure consent screen, development test users, and exact local callback URLs; document deployment callbacks when hosting is chosen |
| Supabase development project | Shudipto | Team access, Auth configuration, first migration, row-level access policies, and a test user are ready |
| Environment templates | Rafid + Shudipto | Commit names and placeholders in `.env.example` files; share real credentials privately |
| Visual conventions | Hannah | Agree on spacing, colour, card dimensions, loading/error styles, and keyboard focus styles |

Use one shared development Supabase project initially. Commit schema changes as migrations so nobody has to reproduce undocumented dashboard edits. Use fictional activities for the demo fixture; connecting a personal calendar is optional during frontend development.

Choose a frontend host and a Node-capable backend host together before the connected demo. Record their origins in setup instructions and register the exact OAuth redirects. Do not let deployment selection block the first local milestone.

## 3. Roadmap and handoffs

### Milestone A: connected visual prototype

Goal: a working map and planner using the same sample data, without requiring login or Calendar access.

1. **Together:** finalise the contract, scaffold, and sample data (issue DM-01).
2. **Hannah:** build layout and planner (DM-02).
3. **Rafid:** build the map adapter and stop markers (DM-03).
4. **Shudipto:** build the backend and Supabase foundation (DM-04).
5. **Hannah + Rafid:** connect selection and editing (DM-05). Shudipto checks contract compatibility.

Demo: select an event card and highlight its marker; select a marker and open its card; edit an activity and see both views update. Unlocated activities remain in the planner. Any sample route geometry is explicitly demo data.

Merge and run this complete flow within roughly the first quarter of the hackathon. Do not wait until each area is visually finished.

### Milestone B: real events and journeys

1. **Shudipto:** complete authenticated plan persistence, then Google Calendar import (DM-06).
2. **Rafid:** add location search and actual route geometry (DM-07), pairing with Shudipto on server integration.
3. **Hannah:** integrate login/connection states, location confirmation, travel times, and errors.

Demo: connect a test calendar, import today's events, resolve one missing location, and display actual journeys between located stops. Refresh the page and recover the saved plan.

### Milestone C: one adaptive planning flow

1. **Shudipto:** implement duration/buffer calculations and one recalculation proposal (DM-08).
2. **Hannah:** build the proposal card with Accept and Keep current plan.
3. **Rafid:** preview affected legs on the map and help finish the end-to-end demo.

Demo: extend a library visit, show the resulting conflict with a fixed event, propose a valid change if possible, and update both views only after acceptance.

Weather, direct Adelaide Metro feeds, automatic morning jobs, notifications, drag-to-reorder, and camera tours belong in the later backlog. Add them after the three milestones work.

## 4. Starter GitHub Project issues

These are **issue drafts**, not existing GitHub issue numbers. Create these eight issues initially; keep later ideas in Backlog. Use the person's actual GitHub account as assignee once their username is known.

Recommended fields: Status, Assignee, Milestone, Priority. Suggested area labels: `frontend`, `map`, `backend`, `integration`, `setup`. Keep one main issue per person In progress. Mark an issue Ready when its dependencies are merged or a usable mock contract exists.

### DM-01 — Scaffold the app and publish the shared plan fixture

- **Owner:** Rafid; **milestone:** A; **priority:** P0; **depends on:** none.
- Set up npm workspaces, React/Vite, Express, shared fixtures, lint/format configuration, and environment templates.
- Add a PlanProvider using React context/reducer for the accepted plan and selected stop.
- Acceptance: all three developers can start the app from a fresh clone; frontend reads the shared fixture; root development/build/lint scripts are documented and work; secrets and dependencies are ignored by Git.

### DM-02 — Build the map-page layout and floating event panel

- **Owner:** Hannah; **milestone:** A; **priority:** P0; **depends on:** DM-01.
- Follow the sketch: full-screen map area, menu button, top location search area, compact right-side Events panel with its own event filter.
- Add cards with explicit times, duration, location status, and fixed/flexible status; add/edit/remove flexible activities.
- Acceptance: works with fixture data, supports empty/loading/error states and keyboard selection; panel collapses; mobile uses a bottom sheet; filtering cards does not remove stops from the plan.

### DM-03 — Render the Adelaide 3D map and selectable stops

- **Owner:** Rafid; **milestone:** A; **priority:** P0; **depends on:** DM-01 and map credentials.
- Validate 3D coverage at demo locations; mount one persistent map instance, render pins, and implement stop selection.
- Acceptance: markers match fixture coordinates; selecting a marker updates shared selection; selecting a card highlights the marker; unlocated stops are omitted from the map; a clear fallback/error state exists if 3D fails; attribution remains visible.

### DM-04 — Set up Express, Supabase Auth, and plan persistence

- **Owner:** Shudipto; **milestone:** A foundation / B persistence; **priority:** P0; **depends on:** DM-01 and Supabase setup.
- Add health/sample endpoints, session verification, initial migration, and authenticated plan read/save endpoints.
- Acceptance: fixture endpoint works without external services; authenticated users can save/reload their plans; another user cannot access them; privileged credentials never reach the browser. Provide endpoint examples and error responses for Hannah/Rafid.

### DM-05 — Connect map and planner into one usable flow

- **Owner:** Hannah; **pair:** Rafid; **milestone:** A; **priority:** P0; **depends on:** DM-02, DM-03.
- Connect both surfaces through the shared provider; implement the place-popover-to-add-event interaction.
- Acceptance: selection works both ways; adding/editing/removing a flexible activity updates both surfaces without resetting the map; closing a popup does not delete data; no duplicate plan state is maintained inside components.

### DM-06 — Connect Google Calendar and import today's events

- **Owner:** Shudipto; **UI support:** Hannah; **milestone:** B; **priority:** P1; **depends on:** DM-04 and OAuth setup.
- Implement read-only Calendar authorisation, primary-calendar import, token handling, and a normaliser that returns DayMap stops.
- Acceptance: date boundaries use the user's timezone; recurring occurrences import correctly; repeated import creates no duplicates; all-day/online/missing-location events remain usable; denied or expired access prompts reconnection. Import never changes Google Calendar.

### DM-07 — Resolve places and draw actual journeys

- **Owner:** Rafid; **server support:** Shudipto; **UI support:** Hannah; **milestone:** B; **priority:** P1; **depends on:** DM-05 and backend integration interface from DM-04.
- Connect the top search to Places, confirm a result, and fetch routes between consecutive located stops using one agreed transport mode initially.
- Acceptance: selected places provide coordinates; legs follow returned route geometry, not straight pin-to-pin lines; departure times reflect activity durations; route failure is visible; stale responses cannot overwrite newer edits. This can be built using the fixture while DM-06 is in progress.

### DM-08 — Recalculate the remaining day and offer one change

- **Owner:** Shudipto; **UI/map support:** Hannah + Rafid; **milestone:** C; **priority:** P1; **depends on:** DM-06, DM-07.
- Calculate travel, visit durations, buffers, and fixed-event conflicts; return a versioned proposed plan with an explanation.
- Acceptance: fixed commitments remain fixed; impossible plans show a conflict; Accept updates map/planner/saved plan together; Keep current plan leaves them unchanged; outdated proposals are rejected. Cover these scheduling behaviours with focused tests.

## 5. Development workflow

Once DM-01 is merged, its README instructions are authoritative. The intended commands are:

```sh
git clone https://github.com/DayMapTeam/DayMap.git
cd DayMap
nvm install
nvm use
npm ci
cp client/.env.example client/.env.local
cp server/.env.example server/.env
npm run dev
```

**These commands are not yet available in the documentation-only repository.** DM-01 should provide root `dev`, `build`, and `lint` scripts. Add `test` when meaningful planning or access-control tests are introduced. Planned local ports: frontend `5173`, backend `3001`; Vite proxies `/api` to the backend.

Use feature branches such as `feat/planner-panel`, `feat/map-stops`, and `feat/calendar-import`. Open small pull requests linked to the board issue. Request one teammate's review before merging into `main`; never force-push `main`. Keep the lockfile change with the dependency change, and coordinate additions to shared configuration.

Each pull request should state:

- What users can now do and which issue it completes.
- How it was verified; include a screenshot for visible changes.
- Any new environment variable, migration, or changed interface.

Before marking Done, run the relevant build/lint checks, exercise the connected flow, and update setup instructions if needed. Use focused tests for scheduling constraints, imports, stale responses, and access isolation; simple styling changes need visual verification rather than implementation-mirroring tests.

## 6. Working agreements

- Update the board and tell the team promptly when blocked; continue against shared fixtures where possible.
- Keep credentials, real calendar exports, and tokens out of commits, screenshots, issue bodies, and logs.
- Use JavaScript and JSX; introduce JSDoc where it clarifies shared shapes. TypeScript is not part of the initial stack.
- Agree before adding a framework, changing the contract, or broadening the MVP.
- Keep demo mode functional without login or Calendar credentials. Label simulated data and disruptions clearly.
- Before judging, walk through one complete story together on the actual demo laptop, including failed route/Calendar requests.
