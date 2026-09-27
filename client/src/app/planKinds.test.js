import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { moveBounds, movedStopEdit, withStopKind } from './planEdits.js'
import { createPlanState, planReducer } from './planReducer.js'

const [lecture, library] = demoPlan.stops

test('fixed → flexible keeps the planned times with no window', () => {
  const next = withStopKind(lecture, 'flexible')
  assert.equal(next.timing.kind, 'flexible')
  assert.equal(next.timing.scheduledStartAt, lecture.timing.scheduledStartAt)
  assert.equal(next.timing.scheduledEndAt, lecture.timing.scheduledEndAt)
  assert.equal(next.timing.fixedStartAt, null)
  assert.equal(next.timing.earliestStartAt, null)
  assert.equal(next.timing.latestEndAt, null)
})

test('flexible → fixed pins the planned times', () => {
  const next = withStopKind(library, 'fixed')
  assert.equal(next.timing.fixedStartAt, library.timing.scheduledStartAt)
  assert.equal(next.timing.fixedEndAt, library.timing.scheduledEndAt)
  assert.equal(next.timing.earliestStartAt, null)
})

test('all-day, finished, unscheduled and unchanged stops cannot change kind', () => {
  const allDay = { ...library, timing: { ...library.timing, kind: 'all-day', scheduledStartAt: null, scheduledEndAt: null, durationMinutes: null } }
  assert.equal(withStopKind(allDay, 'fixed'), null)
  assert.equal(withStopKind({ ...library, status: 'completed' }, 'fixed'), null)
  assert.equal(withStopKind({ ...library, timing: { ...library.timing, scheduledStartAt: null, scheduledEndAt: null } }, 'fixed'), null)
  assert.equal(withStopKind(library, 'flexible'), null)
  assert.equal(withStopKind(library, 'all-day'), null)
})

test('the reducer changes the accepted plan, but not while a draft is pending', () => {
  const state = createPlanState(demoPlan)
  const next = planReducer(state, { type: 'set-stop-kind', stopId: lecture.id, kind: 'flexible' })
  assert.equal(next.plan.version, state.plan.version + 1)
  assert.equal(next.plan.stops[0].timing.kind, 'flexible')
  assert.equal(planReducer(next, { type: 'set-stop-kind', stopId: lecture.id, kind: 'flexible' }), next)

  const drafted = planReducer(state, { type: 'edit-stop-draft', stopId: library.id, edit: {
    title: 'Library', scheduledStartAt: library.timing.scheduledStartAt, scheduledEndAt: library.timing.scheduledEndAt,
  } })
  assert.ok(drafted.draft)
  assert.equal(planReducer(drafted, { type: 'set-stop-kind', stopId: lecture.id, kind: 'flexible' }), drafted)
})

test('a chosen way of travelling applies to the plan and a draft, and null means automatic', () => {
  const state = createPlanState(demoPlan)
  const next = planReducer(state, { type: 'set-stop-travel-mode', stopId: library.id, mode: 'drive' })
  assert.equal(next.plan.stops[1].travelMode, 'drive')
  assert.equal(next.plan.version, state.plan.version + 1)
  assert.equal(planReducer(next, { type: 'set-stop-travel-mode', stopId: library.id, mode: 'drive' }), next)
  const auto = planReducer(next, { type: 'set-stop-travel-mode', stopId: library.id, mode: null })
  assert.equal(auto.plan.stops[1].travelMode, null)
  assert.equal(planReducer(state, { type: 'set-stop-travel-mode', stopId: library.id, mode: 'boat' }), state, 'unknown modes mean automatic')
})

test('when to leave applies to the plan and a draft; anything else means early', () => {
  const state = createPlanState(demoPlan)
  const late = planReducer(state, { type: 'set-stop-leave-timing', stopId: library.id, timing: 'late' })
  assert.equal(late.plan.stops[1].leaveTiming, 'late')
  assert.equal(late.plan.version, state.plan.version + 1)
  assert.equal(planReducer(late, { type: 'set-stop-leave-timing', stopId: library.id, timing: 'late' }), late)
  const early = planReducer(late, { type: 'set-stop-leave-timing', stopId: library.id, timing: 'soon' })
  assert.equal(early.plan.stops[1].leaveTiming, 'early')
  assert.equal(planReducer(state, { type: 'set-stop-leave-timing', stopId: library.id, timing: 'early' }), state)
})

test('moving a stop keeps its length and stays inside a flexible window', () => {
  const at = (iso) => Date.parse(iso)
  // Library study, 60 min, may run 10:00–12:00 local (00:30–02:30Z).
  assert.deepEqual(moveBounds(library, demoPlan), { earliest: at('2026-09-26T00:30:00Z'), latest: at('2026-09-26T01:30:00Z') })
  assert.deepEqual(movedStopEdit(library, at('2026-09-26T01:15:00Z'), demoPlan), {
    title: library.title, scheduledStartAt: '2026-09-26T01:15:00.000Z', scheduledEndAt: '2026-09-26T02:15:00.000Z',
  })
  assert.equal(movedStopEdit(library, at('2026-09-26T01:35:00Z'), demoPlan), null, 'past the window')
  assert.equal(movedStopEdit(library, at(library.timing.scheduledStartAt), demoPlan), null, 'unchanged')
  // A fixed stop has no window, only the plan's day.
  const { earliest } = moveBounds(lecture, demoPlan)
  assert.equal(earliest, at('2026-09-25T14:30:00Z'))
  assert.equal(moveBounds({ ...library, status: 'completed' }, demoPlan), null)
})

test('where the day starts and ends is set, saved and cleared like any accepted change', async () => {
  const { toSavedPlan } = await import('./planPersistence.js')
  const home = { label: 'Home', placeId: 'places/home', lat: -34.95, lng: 138.6 }
  const state = createPlanState(demoPlan)
  const both = planReducer(state, { type: 'set-day-place', which: 'both', location: home })
  assert.deepEqual([both.plan.startPlace.label, both.plan.endPlace.label], ['Home', 'Home'])
  assert.equal(both.plan.version, state.plan.version + 1)
  assert.equal(planReducer(both, { type: 'set-day-place', which: 'both', location: home }), both)
  assert.equal(toSavedPlan(both.plan).endPlace.placeId, null, 'place IDs are not saved')
  const cleared = planReducer(both, { type: 'set-day-place', which: 'start', location: null })
  assert.equal(cleared.plan.startPlace, null)
  assert.equal(cleared.plan.endPlace.label, 'Home')
  assert.equal(toSavedPlan(demoPlan).startPlace, null)
})
