import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { withStopKind } from './planEdits.js'
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
