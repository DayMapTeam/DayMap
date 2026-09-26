# DayMap frontend

React + JavaScript + Vite. Issue #5 adds a temporary selection demo, not the final planner or a geographic map. It runs without login, API keys, or a backend.

## Run locally

From the repository root:

```sh
cd client
npm ci
npm run dev
```

Open the Local URL printed by Vite. Run checks from `client/` too:

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

`src/main.jsx` wraps the app once in `PlanProvider`. The `initialPlan` prop seeds a cloned snapshot on mount; later prop changes do not replace the plan. Future data loading/replacement needs a deliberate reducer action. Do not mutate `plan` or create a second provider around each surface.

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

`usePlan()` throws a descriptive error outside the provider. Context/hook, reducer, and provider live in separate files to support React Fast Refresh. Editing, persistence, loading data from `/api/demo-plan`, and draft/proposal actions are later work.

## Verify the temporary demo

1. Open the page: four events appear; Shared selection says No event selected.
2. Select Morning lecture, then Library study. The pressed button and separate detail panel agree on the selected event and its ID.
3. Click Clear selection in the detail panel. No event remains pressed; the empty state returns.
4. Use Tab and Enter/Space to select events by keyboard.
5. Refresh: the fixture reloads with no selected event. Selection is intentionally not persisted.

The two consumers are `src/demo/EventSelector.jsx` and `src/demo/SelectionPreview.jsx`. Replace these temporary components with the real planner/map later, keeping the provider and hook.
