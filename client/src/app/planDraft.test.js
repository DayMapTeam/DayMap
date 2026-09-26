import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { validateStopEdit } from './planEdits.js'
import { createPlanState, planReducer } from './planReducer.js'

const library = demoPlan.stops.find((stop) => stop.id === 'stop-library')
const lecture = demoPlan.stops.find((stop) => stop.id === 'stop-university')

// Library study is flexible between 10:00am and 12:00pm (Adelaide); moved 30 minutes later.
const laterLibrary = {
  title: 'Library study',
  scheduledStartAt: '2026-09-26T01:30:00Z',
  scheduledEndAt: '2026-09-26T02:30:00Z',
}

function edit(state, stopId, change) {
  return planReducer(state, { type: 'edit-stop-draft', stopId, edit: change })
}

test('an edit creates a draft and leaves the accepted plan untouched', () => {
  const initial = createPlanState(demoPlan)
  const snapshot = structuredClone(initial.plan)
  const drafted = edit(initial, library.id, laterLibrary)
  assert.deepEqual(drafted.plan, snapshot)
  assert.equal(drafted.draft.baseVersion, demoPlan.version)
  const draftLibrary = drafted.draft.plan.stops.find((stop) => stop.id === library.id)
  assert.equal(draftLibrary.timing.scheduledStartAt, laterLibrary.scheduledStartAt)
  assert.equal(draftLibrary.timing.durationMinutes, 60)
})

test('accepting replaces the plan and bumps its version; discarding keeps it', () => {
  const drafted = edit(createPlanState(demoPlan), library.id, laterLibrary)
  const accepted = planReducer(drafted, { type: 'accept-draft' })
  assert.equal(accepted.draft, null)
  assert.equal(accepted.plan.version, demoPlan.version + 1)
  assert.equal(accepted.plan.stops[1].timing.scheduledStartAt, laterLibrary.scheduledStartAt)
  const discarded = planReducer(drafted, { type: 'discard-draft' })
  assert.equal(discarded.draft, null)
  assert.equal(discarded.plan, drafted.plan)
})

test('a draft built on an older version cannot be accepted', () => {
  const drafted = edit(createPlanState(demoPlan), library.id, laterLibrary)
  const newer = { ...drafted, plan: { ...drafted.plan, version: demoPlan.version + 1 } }
  const rejected = planReducer(newer, { type: 'accept-draft' })
  assert.equal(rejected.plan, newer.plan)
  assert.equal(rejected.draft.stale, true)
})

test('fixed stops and invalid edits never reach the draft', () => {
  const initial = createPlanState(demoPlan)
  const moveLecture = { title: lecture.title, scheduledStartAt: '2026-09-26T00:00:00Z', scheduledEndAt: '2026-09-26T01:00:00Z' }
  assert.equal(edit(initial, lecture.id, moveLecture), initial)
  assert.equal(edit(initial, library.id, { ...laterLibrary, scheduledEndAt: laterLibrary.scheduledStartAt }), initial)
  assert.equal(edit(initial, library.id, { ...laterLibrary, title: '  ' }), initial)
  assert.equal(edit(initial, 'missing-stop', laterLibrary), initial)
})

test('validation explains why an edit is rejected', () => {
  assert.equal(validateStopEdit(lecture, laterLibrary), 'not-editable')
  assert.equal(validateStopEdit(library, { ...laterLibrary, title: '' }), 'missing-title')
  assert.equal(validateStopEdit(library, { ...laterLibrary, scheduledEndAt: '2026-09-26T01:00:00Z' }), 'end-before-start')
  // 12:30pm is after the 12:00pm end of the flexible window.
  assert.equal(validateStopEdit(library, { ...laterLibrary, scheduledEndAt: '2026-09-26T03:00:00Z' }), 'outside-window')
  assert.equal(validateStopEdit(library, laterLibrary), null)
})

test('editing back to the accepted values clears the draft', () => {
  const drafted = edit(createPlanState(demoPlan), library.id, laterLibrary)
  const reverted = edit(drafted, library.id, {
    title: library.title,
    scheduledStartAt: library.timing.scheduledStartAt,
    scheduledEndAt: library.timing.scheduledEndAt,
  })
  assert.equal(reverted.draft, null)
})

test('timing edits mark the stop legs stale', () => {
  const withLeg = structuredClone(demoPlan)
  withLeg.legs = [{ id: 'leg-1', fromStopId: lecture.id, toStopId: library.id, status: 'ready' }]
  const drafted = edit(createPlanState(withLeg), library.id, laterLibrary)
  assert.equal(drafted.draft.plan.legs[0].status, 'stale')
  assert.equal(drafted.plan.legs[0].status, 'ready')
})

test('deleting a flexible stop removes it from the accepted plan and bumps the version', () => {
  const initial = planReducer(createPlanState(demoPlan), { type: 'select-stop', stopId: library.id })
  const removed = planReducer(initial, { type: 'remove-stop', stopId: library.id })
  assert.ok(!removed.plan.stops.some((stop) => stop.id === library.id))
  assert.equal(removed.plan.stops.length, demoPlan.stops.length - 1)
  assert.equal(removed.plan.version, demoPlan.version + 1)
  assert.equal(removed.selectedStopId, null)
})

test('fixed and unknown stops cannot be deleted', () => {
  const initial = createPlanState(demoPlan)
  assert.equal(planReducer(initial, { type: 'remove-stop', stopId: lecture.id }), initial)
  assert.equal(planReducer(initial, { type: 'remove-stop', stopId: 'missing-stop' }), initial)
})

test('deleting keeps a pending draft usable, minus the deleted stop', () => {
  const market = demoPlan.stops.find((stop) => stop.id === 'stop-market')
  const laterMarket = { title: market.title, scheduledStartAt: '2026-09-26T02:45:00Z', scheduledEndAt: '2026-09-26T03:30:00Z' }
  const drafted = edit(createPlanState(demoPlan), market.id, laterMarket)
  const removed = planReducer(drafted, { type: 'remove-stop', stopId: library.id })
  assert.equal(removed.draft.baseVersion, removed.plan.version)
  assert.ok(!removed.draft.plan.stops.some((stop) => stop.id === library.id))
  const accepted = planReducer(removed, { type: 'accept-draft' })
  assert.equal(accepted.draft, null)
  assert.equal(accepted.plan.stops.find((stop) => stop.id === market.id).timing.scheduledStartAt, laterMarket.scheduledStartAt)
  // Deleting the only edited stop leaves nothing to accept.
  assert.equal(planReducer(drafted, { type: 'remove-stop', stopId: market.id }).draft, null)
})
