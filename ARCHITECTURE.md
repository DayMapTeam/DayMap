# DayMap architecture

**Status:** initial implementation, September 2026. The React frontend now has a shared sample day and selection demo (issue #5). Backend, live integrations, map rendering, and the remaining architecture are proposed. Current run commands and the selection interface are in [client/README.md](client/README.md). Who builds what, and when, is in [CONTRIBUTING.md](CONTRIBUTING.md).

This is the technical source of truth. Changing the data contract (§5), the API (§6), or the security rules (§7, §8, §10) needs team agreement. When an [open decision](#12-open-decisions) is resolved, record it in the relevant section and remove it from §12.

## Contents

1. [Product scope](#1-product-scope)
2. [System overview](#2-system-overview)
3. [Repository layout](#3-repository-layout)
4. [Frontend](#4-frontend)
5. [Shared data contract](#5-shared-data-contract)
6. [Backend API](#6-backend-api)
7. [Database and access control](#7-database-and-access-control)
8. [Google Calendar integration](#8-google-calendar-integration)
9. [Routing and scheduling](#9-routing-and-scheduling)
10. [Configuration and deployment](#10-configuration-and-deployment)
11. [Verification](#11-verification)
12. [Open decisions](#12-open-decisions)

## 1. Product scope

DayMap is a web app that shows a user's day on a real geographic map with a linked event planner. Calendar commitments, manually added activities, and travel times form one plan. Later, weather and transport changes can produce understandable suggestions.

### MVP boundaries

| Dimension | First scope |
| --- | --- |
| Area | Adelaide |
| Time span | One day |
| Calendar | The user's primary Google Calendar, read-only |
| Transport | One mode, chosen at kickoff |
| Scheduling | Keeps the user's order and flags conflicts ([§9](#9-routing-and-scheduling)). Never promise globally optimal scheduling. |

### Core flow

Milestones A to C build up to this flow:

1. Load the day's stops.
2. Select a stop on either the map or the planner, and the other surface follows.
3. Import Calendar events.
4. Confirm locations for events that lack one.
5. Calculate journeys between located stops.
6. Preview one schedule adjustment, then accept it or keep the current plan.

### Not in the MVP

- **Later backlog**, once milestones A to C work: weather, direct Adelaide Metro/GTFS feeds and forecasting, morning plan generation, background jobs and Calendar webhooks, notifications, a calendar picker, mixed transport modes, drag-to-reorder, camera tours.
- **Deferred:** AI features, multi-day optimisation, team calendars, automatic Calendar edits (any write-back), offline navigation, microservices.

The first product should demonstrate one coherent day and one understandable adjustment.

## 2. System overview

### Stack

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Client | React, JavaScript/JSX, Vite; CSS or Tailwind (chosen in DM-01) | UI, map lifecycle, local editing, selection |
| Client state | React context + reducer (`PlanProvider`) | One accepted plan, draft/proposal, selected stop, UI state |
| Server | Node.js + Express, JavaScript ES modules | Session checks, validation, integrations, plan calculation and persistence |
| Database | Supabase PostgreSQL | Per-user preferences and versioned day plans |
| Identity | Supabase Auth | DayMap sign-in and sessions |
| Map display | Google Maps JavaScript API, photorealistic 3D, with a 2D fallback | Terrain and buildings, markers, route polylines |
| External data | Google Calendar, Places, Routes; weather later | Events, places, travel estimates, forecasts |
| Tooling | npm workspaces (`client`, `server`), one lockfile, Node LTS pinned in `.nvmrc` | Reproducible installs |

The codebase is JavaScript only. Use JSDoc where it clarifies shared shapes. TypeScript is not part of the initial stack.

### Components

```mermaid
flowchart TD
    UI[React app: map and planner] --> STATE[Shared plan state]
    UI --> MAP[Google Maps JavaScript renderer]
    UI <--> AUTH[Supabase Auth]
    STATE <-->|Authenticated /api requests| API[Express server]
    API --> ENGINE[Planning module]
    API <--> DB[Supabase Postgres]
    API <--> CAL[Google Calendar]
    API <--> PLACE[Google Places]
    API <--> ROUTE[Google Routes]
    API -. Later .-> WEATHER[Weather service]
```

### Boundaries

| From | To | Rule |
| --- | --- | --- |
| Browser | Supabase | **Auth only.** All app data reads and writes go through the Express `/api`. |
| Browser | Google Maps JavaScript API | The renderer, Places autocomplete/preview and walking Route Matrix estimates load in the browser using a website- and API-restricted key. Google objects stay inside client adapters. |
| Server | Google Calendar; future server routing | Calendar credentials and persistence remain server-side. Rafid approved browser Places (#16) and walking Routes for the current planning flow; future authenticated server routing remains separate. |
| Frontend services | Demo or live data | Both modes sit behind the same service interface ([§4](#demo-and-live-modes)). |

## 3. Repository layout

```text
client/src/
  app/                  # App shell and PlanProvider (Rafid coordinates)
  map/                  # Map adapter, markers, route overlays (Rafid)
  planner/              # Cards, editing, questions, proposals (Hannah)
  components/           # Shared UI primitives (Hannah coordinates)
  services/             # Express API and Supabase Auth clients
server/src/
  routes/               # Express handlers and validation (Sudipta)
  middleware/           # Authentication and error handling (Sudipta)
  integrations/         # Calendar, Places, Routes, later weather (Rafid)
  planning/             # Scheduling and conflict/proposal calculation (Sudipta)
  repositories/         # Database access and secure token storage (Sudipta)
shared/
  fixtures/             # Fictional Adelaide demo plan
  contracts/            # JSDoc shapes and agreed validation rules
supabase/migrations/    # Versioned SQL schema and access policies (Sudipta)
```

**Integration split.** Rafid owns the provider adapters in `server/src/integrations/`: provider requests and response normalisation. Sudipta owns everything that exposes them to the app: authenticated endpoints, session binding, secure token storage, database writes, and the planning engine. They agree on each adapter's inputs and outputs before implementing it.

- npm workspaces for `client` and `server`, one committed lockfile, one agreed Node LTS version. Exact dependency versions are pinned during scaffolding (DM-01).
- `shared/contracts/` and `shared/fixtures/` are agreed by the whole team. Fixtures contain fictional Adelaide data only.
- The schema changes only through `supabase/migrations/` ([§7](#7-database-and-access-control)).

Area owners are listed in [CONTRIBUTING.md §1](CONTRIBUTING.md#1-team-and-ownership).

## 4. Frontend

### UI surfaces

Based on the initial sketch:

| Surface | Behaviour | Owner |
| --- | --- | --- |
| Full-screen map | Photorealistic 3D where supported; stop markers and actual route geometry | Rafid |
| Top location search | Finds geographic places; choosing one opens a location popover with **Add event** | Rafid (integration), Hannah (styling) |
| Top-left menu | Account, Calendar connection, preferences | Hannah |
| Right floating Events panel | Chronological cards, event filter, add/edit controls, travel summaries | Hannah |
| Place/event popover | Details of the selected place or activity; links map selection with planner selection | Shared |
| Left vertical rail | Purpose not labelled in the sketch. Leave it out until the team agrees on one. | Team decision |

### Layout and interaction

- **Two different searches.** The top search finds *places*. The panel filter searches *existing events*. Searching never silently adds an activity: a confirmed **Add event** supplies a duration and either a fixed time or a flexible window.
- **Panel.** Roughly 360px wide on desktop, with a collapse control. A bottom sheet on mobile.
- **Map space.** Leave room for map attribution and controls. Don't open large popovers for every stop at once.
- **Accessibility.** Every card shows readable times. Every map interaction has a keyboard-accessible alternative.
- **Camera.** Selecting a stop may focus the camera on it. Background schedule updates must never move the camera. During a trip the person chose to start, the camera follows them until they move the map themselves, then flies back to where it was when the trip ends ([Trip mode](#trip-mode-issue-29)). Camera tours are later work.

### Plan state

`PlanProvider` owns the accepted plan, the current draft or proposal, and the selected stop. Components dispatch actions (select, edit, add, remove) and never keep their own copy of the plan. Planner filters and the map camera position are UI state.

```mermaid
stateDiagram-v2
    direction LR
    Accepted --> Draft: user edits
    Draft --> Proposal: preview
    Proposal --> Accepted: Accept
    Proposal --> Accepted: Keep current plan
```

- An explicit edit creates a draft. Edits that change timing mark the affected legs stale until they are recalculated.
- Preview returns routes, conflicts, and a proposal without touching the accepted plan.
- **Accept** replaces the accepted plan only if the proposal's base version still matches; otherwise the server returns 409. **Keep current plan** leaves the accepted plan unchanged.
- Recalculation (DM-08) reuses this flow. There is no separate route editor.

### Saved days (issue #32)

Signed in, `usePlanSync` loads today's plan in the browser's timezone from `GET /api/plans` (or starts an empty live day) and saves each new *accepted* plan with `PUT /api/plans/:id`. Saves run one at a time against the version the server last returned; the local `plan.version` is only a local edit counter. A 409 stops saving until the person picks **Load latest** or **Keep mine**. Place IDs and legs are stripped before saving (§12), and unlocated stops get a location question. Signed out, the demo day is kept in sessionStorage only. At midnight (browser timezone) the next day loads — after any trip in progress — and Calendar imports it (issue #56). A day with nothing saved starts where the day before ended: yesterday's end place becomes today's start place, and a day that started and ended at the same place (home) does so again.

### Browser place search (issue #16)

Rafid approved browser Places autocomplete and selected-place details so search can work before the backend is merged. `client/src/services/places.js` owns session tokens and Google prediction objects, returning plain place data. Suggestions are biased toward Adelaide and restricted to Australia. The selected preview lives in App UI state, separate from the accepted plan; it never creates an activity. Requests are debounced and late results ignored. The planned server Places endpoints below are deferred for this flow; Calendar and persistence retain their server boundaries.

Enable Places API (New) and Maps JavaScript API for the restricted browser key. Results are transient, not persisted.

### Browser walking estimates (issue #20)

The current planning flow uses the Maps JavaScript `routes` library and
`RouteMatrix.computeRouteMatrix` with `WALKING`. Enable Routes API on the same
project and allow it on the website-restricted browser key. The adapter requests
only duration, distance and condition, and returns plain seconds to the pure
shared engine. It does not request or draw route geometry.

The client fetches missing adjacent journeys outside render, grouping destinations
by origin (up to 25 per request), with two requests running at a time. Existing
walking results are reused for unchanged location pairs during the active session;
time-only edits of those journeys need no new request. Alternative-order pairs
are fetched on explicit request when a suggested move cannot be verified.
Results are not stored in localStorage or the database. Late results fill only
their original location keys and never overwrite plan edits. A transient failure
retries once; authorization, quota and timeout failures require explicit Retry.

With a browser key, Google estimates are used for the fictional day too.
`VITE_TRAVEL_PROVIDER=demo` selects labelled simulation for demo plans only.
Live plans and failed Google requests never silently switch to simulation.
Application and acceptance both recheck current estimates. Transit, driving,
route polylines and authenticated server validation are separate increments.

### Travel modes (issues #40, #44)

Each journey's mode is chosen automatically unless the person picks one. Automatic: journeys up to 1.5 km straight-line are walked; longer ones request `TRANSIT` at the leg's exact departure plus `WALKING`, and use public transport only when it saves at least 5 minutes (walking when there is no transit route). Transit results are keyed by departure time, so the engine's exact-departure rule holds. Buffers: walk 5, transit 5, car 10 minutes.

The journey line between two planner rows opens the **journey popup**: Walk, Public transport and Car with their times, plus Automatic. Choosing sets `travelMode` on the destination stop (`walk` | `transit` | `drive`, null = automatic), which is saved with the plan and kept on Calendar re-import, so one day can mix bus and car journeys. The popup lists real public-transport services from Maps JS `Route.computeRoutes` (TRANSIT, alternatives) through `services/transitOptions.js`, which returns plain data: lines with colours, departure and arrival stops and times, stop counts and the walking before, between and after. Car shows a note when the journey before wasn't by car. Suggested moves verify walking or driving legs at new times; a public-transport leg at a new time is unknown until that departure is fetched. Trip mode and the popup hand off to Google Maps with the journey's mode.

Each journey line reads like a Google Maps route summary (issue #46): the mode icon and "Leave 10:00am" for walking or driving, and for public transport the steps walk › rides (line badges in their colours) › walk with the time to leave for the first stop. The service shown arrives earliest, unless one with fewer changes arrives within 10 minutes of it. `services/transitStore.js` requests each journey's services once per departure; the line and the popup share it.

**Adding (issues #52, #60)** starts with a place search or arbitrary text. The same compact choices are always available: **Activity** (default, From–To times), **Note** (no time), and **Day start/end** (reveals a start/end/both selector). Names never infer a day endpoint: visiting home and reading afterwards are ordinary activities. A separate optional place picker preserves the typed name and can reuse an explicitly selected location already in the day. Day endpoints require resolved coordinates; typed “Home” never invents an address. Existing endpoints are named before replacement.

The planner displays manual notes in a separate collapsible **Day notes** section above the itinerary. Adding, restoring, or revealing a note opens the section and highlights its row; filtering searches notes too. Notes have edit/delete controls without time, fixed/flexible, or place controls, and are excluded from itinerary row adjacency so they cannot interrupt travel connectors.

Notes reuse manual `all-day` stops with null duration and timestamps, so they never occupy a time slot, move appointments, or request journeys. Unlocated notes use the existing deferred location question (“no place needed”). They can be renamed through the draft/accept flow, deleted, undone after adding, and saved with the existing API shape. Imported all-day Calendar entries retain their existing edit restrictions. No new backend fields or endpoints are introduced.

The planner shows *Day starts* above the first stop and *Day ends* after the last; these are explicit route endpoints, not an automatic consequence of adding Home.

**Adding a stop (issue #42)** uses the same estimates. A flexible stop starts once you can get there from the stop before it (travel + buffer, rounded to five minutes); later flexible stops move only as far as their own journeys need, and fixed stops never move. A fixed new stop keeps its time and says how late the journey there would make you. The add sheet requests missing journeys, says "Checking travel time…" while they load, and names what it allowed for. The reducer commits with the same planning context as the preview, so the result is what was shown. Unknown travel counts as zero only in the fit and is always reported.

### Trip mode (issues #29, #48)

`client/src/trip/` guides the person from stop to stop. The rules in `tripRules.js` are pure and unit-tested; `useTrip` feeds each position reading through them once. The map stays passive; the planner is the main surface.

- **Go.** The bottom left of the map shows only a Go button. Go heads to the next planned, located, timed stop in the *accepted* plan after the stop the person is at (or the first that has not ended), so an event just added into a gap is next. If the person is already at that place (by position, or because the stop they are at is in the same place) Go just records it and the map doesn't move. **Directions** in a pin's popup starts a trip to any navigable stop. During a trip the same spot shows a slim bar: destination, **I'm here**, **Recenter** (after the map was moved) and **×**.
- **Location** is watched for as long as DayMap is open; the browser asks for permission when the app opens. Denied or unavailable location keeps Go and **I'm here** working. Positions stay in memory and are never saved to the plan, the server, storage or logs.
- **Leaving** where you are settled — the stop you are at, or otherwise the first place DayMap saw you, such as home — by more than ~150 m for three consecutive readings starts directions to the next stop straight away, with a short **Cancel** notice. A cancelled start waits until the person returns and leaves again. Nothing starts after the last stop.
- **Arriving** (within ~50 m for two consecutive readings, or **I'm here**) ends the trip and the camera flies back to where it was. Reaching a stop without a trip also records it. GPS accuracy widens both circles by up to 50 m; readings worse than 200 m are ignored.
- **Navigation mode (issue #54).** While a trip runs, the app behaves like Google Maps navigation on a phone: the header, search and planner step aside; a banner at the top shows the *next* turn with its arrow and distance (on a bus or train: where to get off), and the step after; a bar at the bottom shows time left (red when late), distance, arrival time, mute, I'm here, **Google Maps** (opens Google Maps' own navigation with `dir_action=navigate` — the fallback for a locked screen or background use) and exit. The camera chases from low behind the person, heading-up along the route, centred a little ahead; moving the map pauses it for 10 s. The person is a heading arrow snapped to the route within 25 m, the route is a bold line (rides in their colour) and the travelled part turns grey. Voice guidance uses the Web Speech API (start, "In 150 metres, turn right…", the turn, get off soon, arrival; mute remembered per device), and the Screen Wake Lock keeps the screen on. A failed route keeps the chosen mode and reports the failure; it never silently switches to driving. Choosing another mode for the same destination reloads navigation from the current position.
- **Plan data.** Trip state is UI state. It never edits the plan, the draft or the version; marking a stop completed stays an explicit action.
- **Guidance (issue #50).** When a trip starts, `useNavigation` requests a route from the person's position (or the stop they're at / the stop before) to the destination with Maps JS `Route.computeRoutes`, in the journey's chosen mode (short trips walk; otherwise the planned mode). The route is drawn on the 3D map as `Polyline3DElement`s per step (walking, driving, rides in their line colour), and the bottom-left card shows the current step with a turn arrow, Google's instruction and the distance to the next turn (for rides: line, boarding stop and time, stop to get off), then remaining time, distance, arrival time and on time/late. Each position is projected onto the route (`trip/navigation.js`); more than ~50 m off it for three readings recalculates from there, at most every 20 s. The camera follows looking along the route ahead. Route geometry stays in memory for the trip only. A website cannot read location while the tab is closed or the phone is locked; the journey popup still hands off to Google Maps.

### Departure checks and recovery

A compact **Trip options** disclosure sits beside Go and the navigation controls, outside the planner. It shows departure timing or predicted lateness, with a polite accessibility status for urgent advice and an optional five-minute quiet period. It never opens itself or inserts planner cards. On phones it steps aside while the full planner is open; the expanded disclosure scrolls within the available space below the header/directions banner.

`trip/useRecovery.js` checks the immediate timed appointment within 90 minutes, using only the accepted plan. Live comparisons need a location fix at most 30 seconds old with accuracy within 100 metres. Walking and transit are checked; driving is added only after the person confirms **I have a car here**. That confirmation belongs to this destination and position (and remains valid during the confirmed driving trip). An unknown immediate destination is not skipped for a later one. Being at the destination ends the departure check.

`trip/recoveryStore.js` holds a single comparison in memory, refreshes an unchanged request context at most once a minute, times out after 12 seconds, and rejects superseded results. Options expire after a minute or movement over 75 metres and are rechecked when selected. Checks pause when the page is hidden. No device coordinates or route geometry are saved to the plan or account. Demo mode uses fictional coordinates and explicitly labelled simulated estimates, even if Google credentials exist.

Options rank by arrival plus the existing transition/parking buffer. Transit must still be catchable, including walking approaches and transfers; its arrival follows the last scheduled ride plus the final walk, and its leave alert follows the boarding deadline. Driving requests use Google's [traffic-aware routing](https://developers.google.com/maps/documentation/javascript/routes/traffic-options). A verified alternative saving at least two minutes is suggested, but only a user selection sets the destination's existing `travelMode` and starts/updates navigation.

If all available routes are late, a flexible appointment can offer **Review a later start** based on the currently chosen mode. It preserves duration, respects the time window and day boundary, and opens the existing draft/accept flow for the rest of the day to be checked. This is a draft to review, not a guarantee that the whole day fits. Fixed appointments are never moved by recovery, and pending drafts block recovery mutations. No new backend endpoints or persisted fields are introduced. This is foreground in-app guidance; background/locked-screen push notifications remain future work.

### `MapView` adapter

The map sits behind a single adapter:

```jsx
<MapView stops={stops} legs={legs} selectedStopId={selectedStopId} onSelectStop={selectStop} />
```

- The adapter holds no planning logic and renders what it is given. The same inputs can drive a 2D fallback.
- One map instance stays mounted while panels and data change.
- Stops without a location are left off the map but stay in the planner.

### Demo and live modes

- Normal signed-out startup is an empty local day, stored separately from account and demo plans in this tab. Only events in the shown plan get numbered event pins and journey arcs; Google’s built-in place labels are hidden. A selected search result has one temporary dashed preview pin and an Add to planner action (also available in its pin popup). This opens the existing event sheet with the place prefilled and editable From–To times. Only Add to day creates the event; Cancel leaves the plan unchanged, clearing search removes the preview, and a successful add replaces it with the selected event pin. Demo mode is explicitly opened from the account menu (`?demo=1`) and must keep working without login or Calendar credentials. Issue #5 imports `shared/fixtures/demoPlan.js` directly so the frontend runs before the backend exists. Once DM-04 is implemented, the demo service will read the same fixture through `GET /api/demo-plan`, which makes no external API calls.
- Simulated data, including sample route geometry and disruptions, is clearly labelled in the UI (`dataMode: 'demo'`).

## 5. Shared data contract

The contract lives in `shared/contracts/` (JSDoc shapes and validation rules) and `shared/fixtures/`. Field names, units, and enums change only with whole-team agreement.

### Conventions

| Topic | Rule |
| --- | --- |
| IDs | Stable strings. Production record IDs are UUIDs. |
| Timestamps | Stored in UTC, with an IANA timezone (e.g. `Australia/Adelaide`) for day boundaries and display. **Never hard-code Adelaide's UTC offset**, because daylight saving changes it. |
| Coordinates | Named `lat`/`lng` properties, never arrays. |
| Durations | Route durations in **seconds**. User-entered visit durations in **minutes**, with explicit names such as `durationMinutes`. |
| Fixed events | Keep their original start and end. |
| All-day items | Stay visible and are never given a made-up arrival time. |
| Missing location | `location: null` plus a planner question. Travel to or from the stop is *unknown*, never zero. |

### `dayPlan` shape

```js
// Abbreviated shape; the shared fixture should contain several stops and legs.
const dayPlan = {
  id: 'demo-plan',
  date: '2026-09-26',
  timezone: 'Australia/Adelaide',
  version: 1,
  dataMode: 'demo', // 'demo' | 'live'
  stops: [{
    id: 'stop-1',
    title: 'Library study',
    source: 'manual', // 'manual' | 'google-calendar'
    sourceEventId: null,
    sourceCalendarId: null,
    location: {
      label: 'Confirmed library location',
      placeId: null,
      lat: -34.9206,
      lng: 138.6062
    }, // null when unresolved or not a physical destination
    timing: {
      kind: 'flexible', // 'fixed' | 'flexible' | 'all-day'
      durationMinutes: 60,
      fixedStartAt: null,
      fixedEndAt: null,
      earliestStartAt: null,
      latestEndAt: null,
      scheduledStartAt: null,
      scheduledEndAt: null
    },
    status: 'planned', // 'planned' | 'completed' | 'skipped'
    travelMode: null, // 'walk' | 'transit' | 'drive'; null = automatic
    // Google Calendar stops only, and only when non-empty: what the person changed
    // in DayMap, so re-import keeps DayMap's title and/or times (issue #61).
    localEdits: ['title', 'time'] // optional
  }],
  legs: [],
  conflicts: [],
  questions: [],
  // Where the day starts and ends (home, a hotel): a place without times, or null (issue #52).
  startPlace: null, // { label, placeId: null, lat, lng }
  endPlace: null,
  // Optional, only when non-empty (at most 500, oldest dropped first): Calendar events
  // the person removed, so re-import doesn't bring them back (issue #61).
  removedEvents: [] // [{ sourceCalendarId, sourceEventId, title }]
};
```

### Related objects

§5 defines what each object must contain. The exact field names are set in DM-01 ([§12](#12-open-decisions)).

| Object | Required content |
| --- | --- |
| Journey leg | `id`, `fromStopId`, `toStopId`, mode, departure and arrival, duration in seconds, route coordinates, provider, fetched time, status |
| Conflict | Stable ID, affected stop IDs, reason code, plain-language explanation |
| Question | Stop ID, missing field, prompt, status. Skipping a question must not invent a location. |
| Proposal | ID, plan ID, base version, proposed stops and legs, explanation, remaining conflicts |

### Enums

| Field | Values |
| --- | --- |
| `dataMode` | `demo`, `live` |
| `stops[].source` | `manual`, `google-calendar` |
| `stops[].timing.kind` | `fixed`, `flexible`, `all-day` |
| `stops[].status` | `planned`, `completed`, `skipped` |
| Leg status | `ready`, `unavailable`, `stale` |
| Question status | `unanswered`, `deferred`, `answered` |

## 6. Backend API

### Rules

- `GET /api/health` and `GET /api/demo-plan` are public. Every user-data endpoint requires a verified Supabase session. The Calendar callback is validated by its one-time state.
- The server takes the user ID from the verified session, **never** from a request-body `userId`.
- Errors share one shape and use a meaningful status code, for example 401 for an expired session and 409 for a stale version:

  ```json
  { "error": { "code": "...", "message": "...", "retryable": false } }
  ```

- Provider failures never erase a saved plan. The last accepted plan stays visible, and stale travel estimates are shown as stale.
- The health endpoint exposes no secrets.

### Endpoints

These endpoints are proposed, starting with DM-04.

| Endpoint | Purpose | Issue |
| --- | --- | --- |
| `GET /api/health` | Basic health | DM-04 |
| `GET /api/demo-plan` | Fictional fixture, no external API calls | DM-04 |
| `GET /api/plans?date=YYYY-MM-DD&timezone=...` | Read the signed-in user's plan for a day | DM-04 |
| `PUT /api/plans/:id` | Validate and save a plan, checking `baseVersion` | DM-04 |
| `POST /api/plans/:id/preview` | Validate an edited draft and return routes, conflicts, and a proposal without changing the accepted plan | DM-07/DM-08 ([§12](#12-open-decisions)) |
| `POST /api/plans/:id/accept` | Accept a server-held proposal if its base version still matches | DM-08 |
| `POST /api/calendar/connect` | Create a Google authorisation URL with one-time state bound to the user | DM-06 |
| `GET /api/calendar/callback` | Validate the state and complete the server-side code exchange | DM-06 |
| `POST /api/calendar/import` | Import the chosen day from the primary calendar | DM-06 |
| `POST /api/calendar/disconnect` | Revoke access where possible and delete stored Google credentials | DM-06 |
| `GET /api/places/search?q=...` | Find candidate places (the client debounces requests) | DM-07 |
| `GET /api/places/:id` | Resolve a chosen place's coordinates and details | DM-07 |

## 7. Database and access control

### Tables

| Table | Contents |
| --- | --- |
| `profiles` | Timezone and preferences |
| `day_plans` | Owner, date, timezone, version, plan (JSONB) |
| `plan_proposals` | Owner, plan, base version, candidate plan, status |
| Calendar credentials (server-only schema) | User ID, granted scopes, encrypted Google refresh token |

A single JSONB plan keeps the first model small. Split stops and legs into their own tables later, and only if querying needs justify it.

### Access rules

- Enable row-level security (RLS) on every user-facing table, with policies tied to `auth.uid()`.
- Use the caller's verified token for ordinary database access so those policies apply.
- The Supabase secret (service-role) key bypasses RLS. Use it only for narrowly scoped privileged operations, and verify ownership explicitly every time.
- Keep Calendar credentials in a server-only table or schema, outside public Data API access.
- Saving a plan and accepting a proposal each run an atomic check against `baseVersion`. A mismatch returns 409.

### Migrations

- Every schema change, including access policies, is a versioned migration in `supabase/migrations/`. No undocumented dashboard edits. Sudipta owns migrations.
- Migrations ship with access-isolation tests that prove one user cannot read or change another user's plans.
- The team starts with one shared development Supabase project.

## 8. Google Calendar integration

### Sign-in vs Calendar access

Supabase Auth signs users into DayMap. A separate **Connect Google Calendar** flow grants Calendar access. A Supabase login token is not a Google Calendar token, and Supabase does not refresh Google provider tokens for the app.

### Connection flow

1. `POST /api/calendar/connect`: the server creates one-time state bound to the user's session and returns a Google authorisation URL.
2. The user consents to `calendar.events.readonly`, with offline access where refresh is needed. Calendar-list permission is added only if a calendar picker is built (later backlog).
3. `GET /api/calendar/callback`: the server validates the state and completes the authorisation-code exchange server-side.
4. The server encrypts the refresh token with `TOKEN_ENCRYPTION_KEY` and stores it with the user ID and the granted scopes.

Token rules:

- Never return tokens in API responses or write them to logs.
- Never overwrite an existing refresh token with an absent one.
- Handle denial, revocation, a missing refresh token, and reconnection explicitly. Denied or expired access prompts the user to reconnect.
- Disconnecting revokes access where possible and deletes the stored credentials.

### Import rules

- Primary calendar only.
- Convert the local day's boundaries, in the user's timezone, to timestamps for the query.
- Expand recurring events into occurrences, and follow pagination.
- Deduplicate by calendar ID plus event/occurrence ID (`sourceCalendarId` + `sourceEventId`), so repeated imports create no duplicates.
- Handle cancellations, date-only all-day events, virtual meetings, and missing or ambiguous addresses.
- A missing location becomes a planner question, never a guessed map pin.
- Imported events start `fixed`. The person can make any timed event flexible (or fixed again) in its details; a Calendar event made flexible keeps DayMap's times on re-import, and only its title follows Calendar.
- Imported events are DayMap's copy. The person can rename, move, resize or remove any of them (fixed ones too; "fixed" only means suggestions never move it). A renamed or re-timed event records `localEdits` and keeps DayMap's title or times on re-import; any accepted change to its times counts, including an accepted suggestion or an added stop that moves it. A removed event is remembered in `plan.removedEvents` and stays out of later imports (counted as `summary.hidden`) until the person brings them all back (`restoreRemoved: true`) or some of them (`restoreEvents: [{ sourceCalendarId, sourceEventId }]`). A removed event no longer in Calendar for that day is forgotten on the next import.
- Import is read-only. DayMap never writes to Google Calendar.

## 9. Routing and scheduling

Map rendering and route calculation use separate APIs. Draw the route geometry that Routes returns: straight lines between pins are not journeys.

### Scheduling rules

For each candidate plan:

1. Preserve completed activities and fixed commitments.
2. Place flexible activities in the order the user gave. Do not start with a general route optimiser.
3. Calculate travel between successive physical stops at the relevant departure times.
4. Include each activity's duration and the user's transition buffer.
5. Flag missed time windows and fixed-event conflicts. An unresolved location makes the affected travel unknown, not zero.
6. Return a proposal with explicit changes and reasons. Never silently move a fixed event.

### Journey requests

- Request each journey separately, because Google transit routes do not support intermediate waypoints.
- Use each journey's actual departure time. Later departures depend on earlier travel and visit durations, so requests cannot all assume the same start time.
- If mixed transport modes are added later, keep the user's car location consistent.

### Stale responses and provider terms

- Abort superseded client requests, and tag requests with draft/version IDs so late responses cannot overwrite newer edits.
- Debounce edits and bound retries.
- Reuse provider responses only where the provider's terms allow it. Don't treat Google map imagery, place content, or route geometry as a permanent cache: confirm the retention rules before persisting provider fields ([§12](#12-open-decisions)), and refetch when required.

### Weather (later)

Weather first annotates relevant times and stops. Turning rain into schedule changes needs explicit rules and user preferences. Direct GTFS integration and forecasting are later work, not dependencies of milestones A to C.

## 10. Configuration and deployment

### Environment variables

| Variable | Side | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Client | Express API base URL |
| `VITE_SUPABASE_URL` | Client | Supabase project URL for Auth |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client | Supabase publishable key for Auth |
| `VITE_GOOGLE_MAPS_API_KEY` | Client | Browser map, Places and walking Routes; restricted by website and API |
| `VITE_TRAVEL_PROVIDER` | Client | Optional `google` or `demo`; simulation is only available for demo plans |
| `PORT` | Server | Express port (3001 locally) |
| `CLIENT_ORIGIN` | Server | Exact allowed frontend origin |
| `SUPABASE_URL` | Server | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Session verification and user-scoped database access |
| `SUPABASE_SECRET_KEY` | Server | Privileged operations only; bypasses RLS |
| `GOOGLE_MAPS_SERVER_KEY` | Server | Places and Routes requests |
| `GOOGLE_OAUTH_CLIENT_ID` | Server | Calendar authorisation-code flow |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Server | Calendar authorisation-code flow |
| `GOOGLE_OAUTH_REDIRECT_URI` | Server | Exact Calendar callback URL |
| `TOKEN_ENCRYPTION_KEY` | Server | Encrypts stored Google refresh tokens |

- Anything prefixed `VITE_` is visible in the browser. Only client configuration belongs there. Server secrets never get a `VITE_` prefix.
- Add every new variable to the matching `client/.env.example` or `server/.env.example` as a placeholder. Real values live in git-ignored local files (`client/.env.local`, `server/.env`) and in deployment settings, and are shared privately.
- The Supabase publishable key and the browser Maps key are designed for client use with access policies and restrictions. Server credentials are not. Restrict the browser Maps key by allowed websites and APIs. Give the server its own Maps key, with API restrictions and deployment-appropriate application restrictions.

### Hosting

- Serve the Vite build from a static host and Express from a Node-capable host. The hosts are still to be chosen ([§12](#12-open-decisions)).
- Use HTTPS, exact allowed frontend origins, and exact OAuth callback URLs. Register localhost separately for development.
- Local development: client on port 5173, server on 3001, with Vite proxying `/api` to the server.

### Background work

The MVP recalculates on user actions and on explicit refresh while the app is open. A normal web page cannot guarantee background polling after it is closed. Morning plan generation, Calendar webhooks, scheduled jobs, and push notifications need a later server worker/scheduler design.

## 11. Verification

### On the demo laptop, early

Check 3D coverage at the demo locations, graphics support, marker readability, route visibility, and panel overlap. When 3D cannot load, show 2D or a clear retry/fallback experience.

### Behaviour checks

- Map and card selection stay in sync.
- Missing locations remain editable.
- Two users cannot access each other's plans.
- Recurring imports do not create duplicates.
- Fixed times survive recalculation.
- Failed API calls preserve the last accepted plan.
- Stale proposals cannot be accepted.
- Demo mode works without login or Calendar credentials.

### Tests

Write focused automated tests for scheduling calculations, Calendar normalisation, stale-response handling, and access rules. Check the interface visually. Don't write tests that only mirror styling code.

## 12. Open decisions

Resolve each one by the point shown, record the outcome in the relevant section, and delete the row.

| Decision | Decide by | Notes |
| --- | --- | --- |
| Transport mode for the MVP | Kickoff | One mode only ([§1](#1-product-scope)) |
| Node LTS version | Kickoff / DM-01 | Pinned in `.nvmrc` |
| CSS or Tailwind | DM-01 | |
| Linter and formatter | DM-01 | Backs the root `lint` script |
| Field names for legs, conflicts, questions, and proposals | DM-01 | §5 defines only their required content |
| Test framework | First planning or access-control tests | Backs the root `test` script |
| How DM-07 gets route geometry | Before DM-07 starts | The only endpoint that returns routes today is `POST /api/plans/:id/preview`, which is otherwise DM-08 scope |
| Whether place search requires sign-in | Before DM-07 starts | Affects demo mode and server key usage |
| Which provider fields saved plans may persist | Before legs or place details are saved | Google retention rules; route geometry is part of each leg |
| Frontend and backend hosts | Before the connected demo | Must not block Milestone A. Record origins and OAuth redirects in the setup docs. |
| Purpose of the left vertical rail | Team decision | Leave it out until agreed |

## References

- [Google 3D Maps overview](https://developers.google.com/maps/documentation/javascript/3d/overview) and [coverage](https://developers.google.com/maps/documentation/javascript/3d/coverage).
- [Google transit route capabilities](https://developers.google.com/maps/documentation/routes/transit-route).
- [Calendar events listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) and [permission scopes](https://developers.google.com/workspace/calendar/api/auth).
- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) and [Maps key security](https://developers.google.com/maps/api-security-best-practices).
- [Supabase database](https://supabase.com/docs/guides/database/overview), [Auth](https://supabase.com/docs/guides/auth), and [provider-token responsibilities](https://supabase.com/docs/guides/auth/social-login).
