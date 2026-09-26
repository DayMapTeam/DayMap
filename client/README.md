# DayMap frontend

React + JavaScript + Vite. The page shows the map-page layout (DM-02 in progress): a glass header, a placeholder map, and the planner panel listing the shared sample day. The Google map requires a browser Maps key; the planner and public demo API work without login or Google credentials. The sample plan loads from the Express backend.

## Run locally

Start the backend in another terminal with `npm --prefix server run dev` (first install with `npm --prefix server ci`). From the repository root:

```sh
cd client
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://localhost:3001`. Run checks from `client/` too:

```sh
npm run lint
npm test
npm run build
```

There are no root npm scripts yet. Tests use Node's built-in test runner and introduce no additional dependencies. Lint includes the shared fixture outside `client/`; Vite allows that directory during development.

## Sample day

`shared/fixtures/demoPlan.js` exports `demoPlan`, following ARCHITECTURE.md's stop contract. It contains four fictional activities at approximate public Adelaide locations, stable IDs, UTC times, and the `Australia/Adelaide` display timezone. The first event is fixed; the rest have flexible windows. `legs`, `questions`, and `conflicts` are empty. Gaps between activities are sample spacing, not calculated travel times.

From `client/src/main.jsx`, import it with:

```js
import { demoPlan } from '../../shared/fixtures/demoPlan.js'
```

## Shared state for Hannah's planner and Rafid's map

`src/main.jsx` wraps the app once in `PlanProvider`. The `initialPlan` prop seeds a cloned snapshot on mount; later prop changes do not replace the plan. The `loadPlan(plan)` action loads a cloned API response and clears selection and any draft. `DemoLoader` calls this after fetching `/api/demo-plan`. Do not mutate `plan` or create a second provider around each surface.

Both surfaces consume `usePlan()`:

```jsx
import { usePlan } from '../app/planContext.js'

export function EventButtons() {
  const { plan, selectedStopId, selectStop, clearSelection } = usePlan()
  return (
    <div>
      {plan.stops.map((stop) => (
        <button
          key={stop.id}
          aria-pressed={selectedStopId === stop.id}
          onClick={() => selectStop(stop.id)}
        >
          {stop.title}
        </button>
      ))}
      <button onClick={clearSelection}>Clear selection</button>
    </div>
  )
}
```

| Value | Meaning |
| --- | --- |
| `plan` | Accepted plan snapshot; read-only to consumers |
| `selectedStopId` | A valid stop ID, or `null` when cleared |
| `selectedStop` | Derived stop object, or `null`; never a separate stored copy |
| `selectStop(id)` | Select a known ID; unknown IDs leave selection unchanged |
| `clearSelection()` | Reset selection without changing plan data |
| `draft` | `{ baseVersion, plan, stale }` holding saved but unaccepted edits, or `null` |
| `editStopDraft(id, edit)` | Put an edit to a flexible stop (`{ title, scheduledStartAt, scheduledEndAt }`) into the draft; invalid edits and fixed stops are ignored (rules in `src/app/planEdits.js`) |
| `acceptDraft()` | Replace the accepted plan with the draft and bump `version`, only if the draft's `baseVersion` still matches; otherwise mark the draft `stale` |
| `discardDraft()` | Keep the current plan and drop the draft |

For the future map adapter:

```jsx
const { plan, selectedStopId, selectStop } = usePlan()
// MapView will be implemented in the map issue.
return <MapView stops={plan.stops} legs={plan.legs} selectedStopId={selectedStopId} onSelectStop={selectStop} />
```

`usePlan()` throws a descriptive error outside the provider. Context/hook, reducer, and provider live in separate files to support React Fast Refresh. Edits follow ARCHITECTURE §4: they create a draft, and only `acceptDraft()` changes the accepted plan. Preview (conflicts and routes), persistence, and server-held proposals are later work.

## Verify the planner

1. Start both servers and open the page; loading is followed by the planner. The header shows the plan date and `9:50am · demo time`; demo mode uses a fixed clock on the plan date so finished stops look the same whenever the demo runs.
2. The planner lists four stops in order, each with its time range, Fixed/Flexible, location and duration. Stops that ended before the demo time are greyed out (none in the current fixture; Morning lecture runs until 10:00am). Between rows, travel shows as *Travel unknown* until routes exist.
3. Select a row by click, or with Tab and Enter/Space. It highlights; selecting another row moves the highlight. Selection lives in `PlanProvider`, so the map will follow it.
4. Type `market` in *Filter your day*: one row remains, *Showing 1 of 4 stops* appears, and the travel lines hide. Clear it and all four return. Typing in *Search places* (top left) says place results aren't available yet.
5. Expand *Morning lecture*: details only, with "DayMap will never move a fixed event." Expand *Library study*: the edit form opens and the lecture row closes. An end before the start, or times outside 10:00am–12:00pm, show an error and nothing is saved.
6. Change Library study to 10:45–11:45 and Save. The row shows the new time marked *Changed*, and a card lists the change. *Keep current plan* restores 10:30–11:30; *Accept changes* applies it.
7. Collapse the planner with the › button; the *Planner* pill reopens it. Below 720px the planner is a bottom sheet; its handle switches between peek and full height. Open/collapsed is remembered per browser.
8. Refresh: the fixture reloads with no selected stop and no draft. Selection and edits are not persisted yet.

The planner lives in `src/planner/`, shared UI helpers in `src/components/`, and design tokens in `src/theme/tokens.css`.

## API loading and failure recovery

`DemoLoader` cancels requests on unmount, ignores obsolete responses, and times out after 10 seconds. Failure shows a retry button; no local fixture silently replaces a failed API call. Stop the backend and reload to verify the error state, then restart it and choose Try again.

For a deployed backend or a different API origin, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to the server origin (without `/api`). Configure the server `CLIENT_ORIGIN` to the frontend origin and restart Vite after environment changes. An empty API base uses relative `/api` requests; the dev proxy applies only to the development server. Production hosting needs an API base URL or a reverse proxy.
