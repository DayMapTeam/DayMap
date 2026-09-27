# Shared planning: timeline, conflicts and travel checks

Pure JavaScript; no browser globals, network calls, React, or external dependencies.
Run `npm test` from `client/` to test this module alongside the existing app.

- `buildTimeline(plan)`: returns valid, timed, non-skipped stops ordered by start,
  end, then original position. Completed stops remain for historical context.
- `sortStopsForDisplay(stops)`: keeps every stop, with all-day items first,
  then valid timed items, then unscheduled/invalid items. The planner uses this
  ordering without changing the stored stop array.
- `analyzeOverlaps(plan, { now })`: returns `{ conflicts, unresolved }` without
  modifying the plan. Supply a Date or epoch milliseconds explicitly; use the
  demo clock for demo plans. Stops require unique non-empty string IDs.

Conflict fields: `id`, `code: 'overlap'`, `severity: 'error'`, `stopIds`,
`minutes`, `needsDecision`, and `factsKey`. Minutes measure the full intersection
of the two intervals, rounded up. Fixed/fixed overlaps set `needsDecision`.
IDs use a canonical pair of escaped stop IDs; `factsKey` changes when the pair's
times, statuses or timing kinds change. It is a dismissal key, not a proposal
validity fingerprint.

Touching endpoints are not overlaps. Completed and skipped stops do not generate
current warnings. Once the overlapping portion has ended, it is quiet even if
one event continues. Nested overlaps are detected against every active interval.
Malformed or partial timed schedules return `invalid-time` unresolved entries;
fully unscheduled and all-day items are excluded from overlap checking.

Example consumer:

```js
const shownPlan = draft?.plan ?? plan
const { conflicts, unresolved } = analyzeOverlaps(shownPlan, { now })
```

`analyzeOverlaps` is time-only analysis, not a feasibility verdict. An empty
conflict list does not imply journeys fit.

## Travel and free-time analysis

`analyzePlan(plan, ctx)` in `analyze.js` combines overlaps with journey checks.
It returns `{ legs, conflicts, unresolved, freeTime, pending, summary }`.
It is a pure function: it never fetches or persists provider data or changes a plan.

```js
const analysis = analyzePlan(draft?.plan ?? plan, {
  now, // Date or epoch milliseconds; use the demo clock for fictional plans
  modeFor: () => 'walk', // or { mode, source: 'you' | 'habit' | 'preset' }
  buffers: { walk: 5 }, // minutes, explicitly supplied for each enabled mode
  freeTimeMin: 15,
  travel: (from, to, { mode, departAt }) => estimates.lookup(from, to, { mode, departAt }),
})
```

The lookup is synchronous and returns a supplied estimate, not a Promise:

- Ready: `{ status: 'ready', travelSeconds, provider, timeDependent?, departAt? }`.
- Unknown: `{ status: 'pending' | 'stale' | 'unavailable', reason? }`.
- Undefined means pending. Only pending/stale/unverified departures enter `pending`;
  unavailable journeys require a deliberate retry rather than an analysis loop.

`late` means travel itself exceeds the gap. `lateMinutes` measures arrival
lateness; `minutes` measures the total shortfall including buffer. `tight` means
travel fits but the buffer does not. Exact fits do not create warnings.
Unresolved legs keep durations and spare time null, never zero.

Free-time entries describe a concrete interval **at the destination after travel
and buffer** (`placement: 'after-travel'`), with its `locationStopId`. A stop with
`leaveTiming: 'late'` is left for just in time instead: the journey departs at
the latest five-minute mark that still arrives with its buffer, and the free time
is at the origin before it (`placement: 'before-travel'`). Public transport is
looked up again at that later departure (a few times at most, if services are
slower); until it is known, or when nothing later fits, the journey leaves early.
Conflicts are always judged from the earliest departure. They require at least 15 minutes by
default. A proposed activity elsewhere must still account for both new journeys.
Confirmed equal non-empty place IDs require no journey or buffer; nearby
coordinates alone do not establish this. Estimates retain their provider label,
including `demo` when tests or future simulation explicitly supply that label.

Transit and estimates marked `timeDependent` require the exact departure time.
A mismatched departure is unresolved and pending verification, not a reliable
feasibility result. Traffic-unaware driving can be supplied as time-independent;
the eventual provider/UI must explain that limitation.

Connected overlap groups and their adjacent journeys remain unresolved, because
there is no confirmed physical order through those events. Analysis resumes for
subsequent unambiguous pairs. Journeys whose destination has ended/completed are
quiet. Once a departure is in the past, actual progress is unknown; the engine
does not assume the user is still at the origin or already at the destination.

There is no global `feasible` flag: unresolved data and unscheduled activities
must be considered by consumers. The planner consumes this analysis and
acceptance revalidates proposals. The client supplies Google walking estimates;
the existing add-event fit still uses time-only checks.

## Proposal plan fingerprints

`planFingerprint(plan)` in `fingerprint.js` returns a stable comparison string
for JSON plans. It includes identity, version, date, timezone, every stop field,
and each leg's endpoints, mode and mode source. Nested object-key order does not
matter; array order does. The input is never mutated.

Store this string as a proposal's `baseFingerprint` and compare it against the
currently shown plan (draft when present) before applying a proposal. A mismatch
means the suggestion was built against different plan inputs.

Derived travel values and analysis are intentionally excluded. A matching
fingerprint is NOT sufficient to accept: current time, started/completed stops,
edit locks, preferences, buffers and journey estimates must also be revalidated
at application and acceptance. This string is not a security hash and does not
replace the server's ownership checks or version guard.

## Single-stop suggestions

`suggestFix(plan, conflictId, ctx)` in `proposals.js` uses the same analysis
context plus `lockedStopIds`, an iterable of IDs the user edited in the draft.
Call it against the currently shown plan. It returns one of:

- `{ status: 'proposal', proposal }`: one verified move, with before/after stop
  snapshots, base version/fingerprint, resulting legs, resolved conflict IDs,
  remaining conflicts and free minutes.
- `{ status: 'needsDecision', conflictId }`: both conflicting stops are fixed.
- `{ status: 'noFit', reason, blockers }`: no verified single-stop move found,
  with blocker codes for each relevant stop. This is not proof of impossibility.

Only planned, flexible, scheduled stops that have not started and are not locked
can move. The helper considers the target conflict's stops, preserves duration,
and keeps the entire activity within its window and local plan day. Missing
window bounds use local midnight boundaries in the explicit IANA timezone,
including daylight-saving changes. Invalid dates/timezones throw.

The bounded search tries one nearest start per insertion gap. Starts land on
five-minute marks, falling back to whole minutes when needed. Same-neighbour
slides rank before relocations; ties use shift size, total travel, later start,
then stop ID. It does not attempt multi-stop ripples or exhaustive transit-time
searches. Travel lookups must remain synchronous and free of side effects.

Every candidate is analyzed again. It must clear all conflicts for the target
pair, introduce no conflicts or unresolved entries, and not increase any
remaining conflict's exact shortfall/overlap. All journeys touching the moved
stop must be resolved. Transit and traffic-dependent travel require matching
departure estimates; missing estimates result in `noFit`, never assumed travel.
Other existing problems remain visible in the proposal.

Generating a suggestion changes nothing and makes no API requests. Consumers
must not directly save the returned stop snapshots.

## Applying and accepting suggestions

`applyProposal(plan, proposal, ctx)` returns a new plan snapshot or `null` for
an invalid, stale or unverified single-stop move. It checks identity, version,
fingerprint, original stop data, current time, edit locks, duration and windows.
Only scheduled timestamps may change. It repeats analysis with current mode,
buffer and journey estimates and applies the same conflict safety checks as
generation. It does not rerun ranking: a still-safe proposal can remain valid
even when another move would now rank first.

Existing legs are marked stale, including old-neighbour legs affected by a
relocation. Supplied proposal legs are never copied into plan data. Recompute
runtime analysis separately; the function makes no network or database calls.

The client reducer now uses this helper for `apply-suggestion` and again for
`accept-draft` when a suggestion is present. Both require current `ctx`. Applying
only creates/updates the draft; accepting still checks its base version. Revert
restores the user's draft from before the suggestion. A later manual edit or
deletion invalidates and removes the suggestion, preserving user edits. Only one
suggestion is active at a time. See `client/README.md` for the provider contract.
The planner consumes this contract through `usePlanAnalysis` and shows Apply/Revert
controls. A restricted browser key enables Google walking estimates; the hook
fetches missing journeys outside render and recomputes analysis as they arrive.
The engine itself remains synchronous and provider-independent. Demo simulation
is an explicit option; Google failures stay unresolved. Persistence remains
separate work.

## Actionable free-time gaps

`suggestFitsForGap(plan, freeTimeId, ctx)` returns `{ proposals, reason }` for a
current gap from `analyzePlan`. It considers existing scheduled flexible activities
outside that gap; fixed, completed, skipped, started and draft-locked stops never
move. Gap boundary events also stay put. Unscheduled activities are not included
in this first flow.

The engine verifies travel into and out of the activity, mode buffers, the full
duration, the activity window and local-day bounds. It also checks the journey
left behind when the activity moves. No new conflict or unresolved journey is
allowed, and existing conflicts may not worsen. Missing travel never becomes a
zero-minute journey.

Proposals use `strategy: 'fill-gap'`, `freeTimeId`, and `remainingMinutes`, alongside
the existing plan fingerprint and before/after snapshots. `remainingMinutes` is
the spare time across the two new legs inside the original gap, after travel and
buffers. Rank moves with at least 10 minutes remaining first, then least additional
total walking, smallest time shift and stable ID. This is a preference; a verified
exact fit is still valid. Return at most three; the compact UI shows the first.

`gapRoutePairs(plan, freeTimeId, ctx)` supplies just the candidate incoming,
outgoing and old-neighbour journeys. The client requests them when a gap is
tapped; rendering and suggestion calculation remain pure. Cached journeys are
reused, including on repeated taps. Empty/ineligible gaps request nothing.

`applyProposal` revalidates gap moves at preview and again at acceptance using
current time and estimates. It does not trust supplied journey or spare-time data.
Cancel restores the draft from before preview; confirmation includes any manual
edits already in that draft, with the count and details shown explicitly.
