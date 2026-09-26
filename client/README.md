# DayMap frontend

React + JavaScript + Vite. Issue #5 adds a temporary selection demo, not the final planner or a geographic map. It loads the sample day from the Express backend without login or API keys.

## Run locally

Start the backend in another terminal with `npm --prefix server run dev` (install its dependencies first with `npm --prefix server ci`). From the repository root:

```sh
cd client
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://localhost:3001` and requires port 5173 to be available. VS Code Live Server does not run this React/Vite app or the Express backend. Run checks from `client/` too:

```sh
npm run lint
npm test
npm run build
```

There are no root npm scripts yet. Tests use Node's built-in test runner and introduce no additional dependencies. Lint includes the shared fixture outside `client/`; Vite allows that directory during development.

## Sample day

`shared/fixtures/demoPlan.js` exports `demoPlan`, following ARCHITECTURE.md's stop contract. It contains four fictional activities at approximate public Adelaide locations, stable IDs, UTC times, and the `Australia/Adelaide` display timezone. The first event is fixed; the rest have flexible windows. `legs`, `questions`, and `conflicts` are empty. Gaps between activities are sample spacing, not calculated travel times.

The backend imports the fixture and serves it from `GET /api/demo-plan`. `client/src/services/plans.js` loads it over HTTP. For fixture-based tests, import it with:

```js
import { demoPlan } from '../../shared/fixtures/demoPlan.js'
```

## Shared state for Hannah's planner and Rafid's map

`src/main.jsx` wraps the app once in `PlanProvider`. The `initialPlan` prop seeds a cloned snapshot on mount; later prop changes do not replace the plan. The `loadPlan(plan)` action replaces the accepted plan with a cloned response and clears selection. `DemoLoader` calls it after loading the API response. Do not mutate `plan` or create a second provider around each surface.

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

For the future map adapter:

```jsx
const { plan, selectedStopId, selectStop } = usePlan()
// MapView will be implemented in the map issue.
return <MapView stops={plan.stops} legs={plan.legs} selectedStopId={selectedStopId} onSelectStop={selectStop} />
```

`usePlan()` throws a descriptive error outside the provider. Context/hook, reducer, and provider live in separate files to support React Fast Refresh. Editing, persistence, and draft/proposal actions are later work.

## Verify the temporary demo

1. Start both servers and open the page: a loading message is followed by four events; Shared selection says No event selected.
2. Select Morning lecture, then Library study. The pressed button and separate detail panel agree on the selected event and its ID.
3. Click Clear selection in the detail panel. No event remains pressed; the empty state returns.
4. Use Tab and Enter/Space to select events by keyboard.
5. Refresh: the fixture reloads with no selected event. Selection is intentionally not persisted.

The two consumers are `src/demo/EventSelector.jsx` and `src/demo/SelectionPreview.jsx`. Replace these temporary components with the real planner/map later, keeping the provider and hook.

## API loading and failure recovery

`DemoLoader` cancels requests on unmount, ignores obsolete responses, and times out after 10 seconds. Failure shows a retry button; no local fixture silently replaces a failed API call. Stop the backend and reload to verify the error state, then restart it and choose Try again.

For a deployed backend or a different API origin, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to the server origin (without `/api`). Configure the server `CLIENT_ORIGIN` to the frontend origin and restart Vite after environment changes. An empty API base uses relative `/api` requests; the dev proxy applies only to the development server. Production hosting needs an API base URL or a reverse proxy.
