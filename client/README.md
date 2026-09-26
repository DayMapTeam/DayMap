# DayMap frontend

React + JavaScript + Vite. The page shows an Adelaide 3D map, a floating planner, and browser Places search. The planner uses fictional sample data without login or a backend. Map rendering and place search require a restricted Google browser key.

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

## Google setup and place search

1. In the DayMap Google Cloud project, enable **Maps JavaScript API** and **Places API (New)**.
2. Edit the browser key: keep **Websites** restrictions for `http://localhost:5173/*` and `http://127.0.0.1:5173/*`; allow both APIs under **API restrictions**. Billing must be enabled on the project.
3. Set `VITE_GOOGLE_MAPS_API_KEY` in ignored `client/.env.local`, using `.env.example` as the template. Restart Vite after changing it. Never commit the real key.
4. Search for `State Library` in the top-left field. Choose a suggestion by pointer or ArrowDown/Enter. A dashed search pin (not in your day) previews the location and the camera moves there.
5. Choose another place: the previous preview is replaced. Clear search or press Escape: the preview disappears. It never changes the day's activities or selected itinerary stop.
6. Confirm itinerary pin/card selection still works. Try a query with no matches and check that the status is clear.

Search waits 300ms after typing and requires two characters. Results favour Adelaide and are restricted to Australia. Loading, no-results and provider errors appear below the field. Session tokens group autocomplete with the selected place details; only coordinates and formatted address are requested. No Places data is persisted. Live verification requires the Cloud setup above; unit tests cover debouncing, stale responses, clearing during details loading and disposal.

## Walking estimates from Google

The existing `VITE_GOOGLE_MAPS_API_KEY` now also loads Google's browser `routes`
library. Enable **Routes API** in the project and allow it in that key's API
restrictions, alongside Maps JavaScript and Places API (New). Website restrictions
remain in place. There is no new key or server secret to copy.

With a key configured, the planner uses Google walking estimates even for the
fictional demo day. It shows loading/unresolved states and **Retry routes** on
failure. Failed routes are never replaced with simulation. For repeatable offline
demo testing, set `VITE_TRAVEL_PROVIDER=demo` in ignored `client/.env.local` and
restart Vite; this applies to demo plans only. The default with a key is Google.

`walkingRoutes.js` normalises `RouteMatrix.computeRouteMatrix` responses into
seconds. `walkingRouteStore.js` holds active-session results in memory, deduplicates
location-pair requests, groups destinations per origin, and limits concurrency to
two. It retries transient failures once, bounds waiting to 15 seconds and leaves
failures unavailable until Retry. No durations or geometry are persisted.
The hook requests only missing adjacent journeys initially. If a proposed
relocation needs other pairs, **Check alternative walking routes** fetches them
on demand. Walking estimates do not depend on event times; editing times without
changing the journey pairs makes no additional Routes requests.

Manual verification with the existing key:

1. Reload. Travel connectors should change from Loading to **Google Maps · … min
   walk**, or explain an unresolved request with Retry.
2. Change lunch to **12:15–13:00**. A verified break suggestion should appear;
   its time depends on Google's result (the development check suggested 13:15).
3. Apply, Revert and Accept should preserve the same explicit draft flow.
4. In Network, filter `routes.googleapis.com`: the four-stop day initially needs
   three adjacent-journey requests. Repeating the above time edit should not add
   calls while those walking results are available. No route polyline is drawn
   in this increment.

Reference: [Google Route Matrix](https://developers.google.com/maps/documentation/javascript/routes/get-a-route-matrix).

## Sample day fixture

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
| `draft` | `{ baseVersion, plan, stale, editedStopIds }` holding saved but unaccepted edits, or `null`; an active suggestion also stores `suggestion`, `beforeSuggestion` and `suggestionInvalid` |
| `editStopDraft(id, edit)` | Put an edit to a flexible stop (`{ title, scheduledStartAt, scheduledEndAt }`) into the draft; invalid edits and fixed stops are ignored (rules in `src/app/planEdits.js`) |
| `removeStop(id)` | Delete a flexible stop (and its legs) the user confirmed; bumps `version`. A pending draft keeps its other edits. Fixed and unknown stops are ignored |
| `applySuggestion(proposal, ctx)` | Revalidate one suggested move against the shown plan and current analysis context, then put it in the draft. Stale/invalid proposals and a second active suggestion are ignored |
| `revertSuggestion()` | Remove the active suggestion, restoring the user's draft from before it |
| `acceptDraft(ctx?)` | Replace the accepted plan with the draft and bump `version`, only if the draft's `baseVersion` still matches; otherwise mark `stale`. A draft containing a suggestion additionally requires current `ctx` and repeats feasibility checks; failure sets `suggestionInvalid` and leaves the accepted plan untouched |
| `discardDraft()` | Keep the current plan and drop the draft |
| `addStop({ newStop, afterStopId, baseVersion, now })` | Add a stop confirmed in an add flow. Re-runs `fitNewStop` (`src/app/planAdd.js`) and applies it only if it still fits, `baseVersion` matches and no edit draft is pending; bumps `version` and selects the new stop |
| `undoAdd(stopId)` | Restore the day from before that add (including stops it moved), only if nothing else changed the plan since |

The planner now shows conflicts, free-time gaps and suggestion controls. The
shared `usePlanAnalysis` hook supplies `ctx` as documented in
[`shared/planning/README.md`](../shared/planning/README.md): explicit current
`now`, synchronous travel lookup, mode choices and buffers. Build fresh context
on Apply and Accept; do not reuse a generation-time clock or estimates. The
reducer adds `draft.editedStopIds` to the supplied locks itself. A failed
acceptance leaves the suggestion reversible; UI should offer Revert/refresh
when `draft.suggestionInvalid` is true; the draft card now offers this.

A new valid manual edit removes the active suggestion and applies that edit to
the saved user draft. Deleting an event also removes the suggestion, then keeps
the existing deletion behaviour and other user edits. Invalid edits leave the
suggestion untouched. This prevents outdated suggested moves from being accepted
as ordinary edits. The ordinary edit/accept flow still works without `ctx`.

For the map adapter:

```jsx
const { plan, draft, selectedStopId, selectStop } = usePlan()
const shown = draft?.plan ?? plan
return <MapView stops={shown.stops} selectedStopId={selectedStopId} onSelectStop={selectStop} />
```

Every map pin is drawn by `stopMarkerSvg()` in `src/map/stopMarker.js`: a numbered head on a stem above a ground dot, where the ground dot is the stop's exact position. Numbers come from `numberStops()` in `src/app/stopNumbers.js` (plan order, starting at 1), which the popup badge also uses. Fixed stops are dark, flexible blue, all-day grey, and search previews dashed. Selected pins get a smaller head and a blue halo, finished stops fade, and the stem shortens above 45° tilt. Colours come from `src/theme/tokens.css`. Clash and preview-shifted states now come from the same analysis as the planner. Marker titles describe their state too. Existing markers update in place when drafts change.

Besides the documented props, `MapView` takes:

| Prop | Meaning |
| --- | --- |
| `onSelectStop(stopId, { anchor })` | A pin was clicked. `anchor` is the click point in map pixels; the 3D map has no lat/lng-to-pixel API, so this is how the popup knows where to point. |
| `onClearSelection()` | The empty map was clicked. |
| `onCameraMove()` | The camera moved. The popup is placed on screen and cannot follow it, so `App.jsx` closes it (the stop stays selected). |
| `now` | Stops that ended before this are drawn faded. |
| `previewPlace` | The place-search preview, drawn as a dashed search pin. |
| `stopStates` | Per-stop `{ clash, previewShifted, note }` from shared analysis; updates pin appearance and title without moving the camera |

`App.jsx` opens the popup only from a pin click, never from the planner or search.

`usePlan()` throws a descriptive error outside the provider. Context/hook, reducer, and provider live in separate files to support React Fast Refresh. Edits follow ARCHITECTURE §4: they create a draft, and only `acceptDraft()` changes the accepted plan. Preview (conflicts and routes), persistence, loading data from `/api/demo-plan`, and server-held proposals are later work.

## Verify the planner

### Conflict and suggestion flow

For the deterministic walkthrough below, set `VITE_TRAVEL_PROVIDER=demo` and restart
Vite. This uses **labelled simulated walking estimates**, based on straight-line
distance with a 1.3 detour factor, walking at 1.3 m/s, plus a 5-minute buffer.
These are not Google routes. With the default Google provider, the same controls
use fetched walking durations instead, so suggested times may differ.

1. Open Lunch at the market. Set Start to **12:15** and End to **13:00**, then Save.
2. A late-arrival conflict appears with a suggestion to move Afternoon break from
   **13:00–13:30** to **13:10–13:40**. Lunch stays locked as your own edit.
3. Choose **Apply suggestion to draft**. Both changes are previewed; the conflict
   clears under the demo estimates. The map marks draft changes without moving
   its camera.
4. Choose **Revert suggestion**. Lunch remains at 12:15–13:00; the break returns
   to 13:00–13:30. Apply again, then **Keep current plan** to discard both edits.
5. Repeat and choose **Accept changes** to keep both. Reopen the event rows to
   confirm the times; acceptance rechecks the current clock and estimates.
6. Expand **Free time** to see usable intervals at the next destination after
   travel and buffer. Choosing an activity to fill a gap is a later feature.
7. Dismiss a suggestion: its conflict stays visible, muted. **Suggest a fix**
   brings it back. Existing conflicts need this click; a newly introduced error
   gets one automatic suggestion. A bounded search may report no one-event fix.

Automated coverage: `node --test src/services/planningContext.test.js` from
`client/` runs this fixture's edit/apply/revert/accept sequence without a Maps key.
The existing add-event fit remains time-only; the day checks show any resulting
travel issues after adding. Refresh still resets to the fixture.

### Existing planner interactions

1. Open the page. The header shows the plan date and `9:50am · demo time`; demo mode uses a fixed clock on the plan date so finished stops look the same whenever the demo runs.
2. The planner lists four stops by time, each with its time range, Fixed/Flexible, location and duration. Stops that ended before the demo time are greyed out (none in the current fixture; Morning lecture runs until 10:00am). Between rows, demo travel and buffer minutes are labelled as simulated; missing or ambiguous journeys stay unresolved.
3. Select a row by click, or with Tab and Enter/Space. It highlights; selecting another row moves the highlight. Selection lives in `PlanProvider`, so the map will follow it.
4. Type `market` in *Filter your day*: one row remains, *Showing 1 of 4 stops* appears, and the travel lines hide. Clear it and all four return. Use *Search places* (top left) for Google location suggestions; it is independent of the planner filter.
5. Expand *Morning lecture*: details only, with "DayMap will never move a fixed event." Expand *Library study*: the edit form opens and the lecture row closes. An end before the start, or times outside 10:00am–12:00pm, show an error and nothing is saved.
6. Change Library study to 10:45–11:45 and Save. The row shows the new time marked *Changed*, and a card lists the change. *Keep current plan* restores 10:30–11:30; *Accept changes* applies it.
7. Collapse the planner with the › button; the *Planner* pill reopens it. Below 720px the planner is a bottom sheet; its handle switches between peek and full height. Open/collapsed is remembered per browser.
8. With a Maps key in `.env.local`, click a pin: a popup opens above it (below it near the top), never under the planner, with the stop's time, Fixed/Flexible and address. There is no photo yet ("No photo yet") until place details exist (DM-07). Selecting rows or searching never opens it. The popup shows the pin's number and points at the pin head. Esc, ×, clicking the same pin again, or clicking the empty map closes it and clears the selection; moving the camera or selecting another stop in the planner only closes it. *View in planner* keeps it open, opens the panel if collapsed, clears the filter, expands that row, scrolls to it and briefly highlights it.
9. Expand *Library study* and press the red *Delete* on the left of Cancel and Save. A dialog over the planner asks "Are you sure you want to delete this event?". *Cancel* (or Esc) changes nothing and returns focus to Delete; *Confirm* removes the stop. Only flexible stops show Delete.
10. The round *+* button in the planner header (or the N key) opens the add sheet: *Where?* (a place, or *Use “…”* without one), *When?* (duration and the best times, or a set time), then *Check your day* listing what is new, moved or unchanged. Nothing changes until *Add to day*. The new row is marked *New* and selected, and a toast offers *Undo* for 5 seconds. Try *At a set time* 11:00–11:20am: it overlaps Library study and *Next* stays disabled. Without a Maps key, place search says it is unavailable and events can still be added without a place (shown as *Location needed*).
11. Adding is disabled while an edit is waiting to be accepted. Fits use clock times only: travel is unknown until routes exist, and every message says so. The fit logic is local (`src/app/planAdd.js`) until the planning endpoint exists.
12. Refresh: the fixture reloads with no selected stop and no draft. Selection and edits are not persisted yet.

The planner lives in `src/planner/`, shared UI helpers in `src/components/`, and design tokens in `src/theme/tokens.css`.
