import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import {
  MIN_STOP_MINUTES, canEditStop, resizeBlock, resizedStopEdit, timesFromInputs, validateStopEdit, withLocalTimeMarks,
} from './planEdits.js'
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

test('invalid edits never reach the draft', () => {
  const initial = createPlanState(demoPlan)
  const finished = createPlanState({ ...demoPlan, stops: demoPlan.stops.map((stop) => ({ ...stop, status: 'completed' })) })
  assert.equal(edit(finished, library.id, laterLibrary), finished)
  assert.equal(edit(initial, library.id, { ...laterLibrary, scheduledEndAt: laterLibrary.scheduledStartAt }), initial)
  assert.equal(edit(initial, library.id, { ...laterLibrary, title: '  ' }), initial)
  assert.equal(edit(initial, 'missing-stop', laterLibrary), initial)
})

test('validation explains why an edit is rejected', () => {
  assert.equal(validateStopEdit({ ...library, status: 'skipped' }, laterLibrary), 'not-editable')
  assert.equal(validateStopEdit(lecture, laterLibrary), null, 'fixed stops take any times')
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

test('unknown stops cannot be deleted', () => {
  const initial = createPlanState(demoPlan)
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

// The lecture as an imported Google Calendar event (fixed, 9:00–10:00am Adelaide).
const calendarLecture = { ...lecture, source: 'google-calendar', sourceEventId: 'lecture-1', sourceCalendarId: 'primary' }
const calendarPlan = { ...demoPlan, stops: [calendarLecture, ...demoPlan.stops.slice(1)] }
const laterLecture = { title: lecture.title, scheduledStartAt: '2026-09-26T00:00:00Z', scheduledEndAt: '2026-09-26T00:45:00Z' }

test('only planned fixed or flexible stops with times can be edited', () => {
  assert.equal(canEditStop(lecture), true)
  assert.equal(canEditStop(library), true)
  assert.equal(canEditStop({ ...library, status: 'completed' }), false)
  assert.equal(canEditStop({ ...library, timing: { ...library.timing, kind: 'all-day', scheduledStartAt: null, scheduledEndAt: null } }), false)
  assert.equal(canEditStop({ ...library, timing: { ...library.timing, scheduledStartAt: null, scheduledEndAt: null } }), false)
})

test('editing a fixed stop keeps it fixed at the new times', () => {
  const drafted = edit(createPlanState(demoPlan), lecture.id, laterLecture)
  const moved = drafted.draft.plan.stops.find((stop) => stop.id === lecture.id)
  assert.equal(moved.timing.kind, 'fixed')
  assert.equal(moved.timing.scheduledStartAt, laterLecture.scheduledStartAt)
  assert.equal(moved.timing.fixedStartAt, laterLecture.scheduledStartAt)
  assert.equal(moved.timing.fixedEndAt, laterLecture.scheduledEndAt)
  assert.equal(moved.timing.durationMinutes, 45)
  assert.equal(moved.localEdits, undefined, 'manual stops record no Calendar edits')
  const accepted = planReducer(drafted, { type: 'accept-draft' })
  assert.equal(accepted.plan.stops[0].timing.fixedEndAt, laterLecture.scheduledEndAt)
})

test('a Calendar stop records which fields the person changed', () => {
  const initial = createPlanState(calendarPlan)
  const renamed = edit(initial, lecture.id, { ...laterLecture, scheduledStartAt: lecture.timing.scheduledStartAt, scheduledEndAt: lecture.timing.scheduledEndAt, title: 'Lecture (room 2)' })
  assert.deepEqual(renamed.draft.plan.stops[0].localEdits, ['title'])
  const both = edit(renamed, lecture.id, { ...laterLecture, title: 'Lecture (room 2)' })
  assert.deepEqual(both.draft.plan.stops[0].localEdits, ['title', 'time'])
  // Back to the Calendar title: only the time is still changed.
  const timeOnly = edit(both, lecture.id, laterLecture)
  assert.deepEqual(timeOnly.draft.plan.stops[0].localEdits, ['time'])

  // Markers already accepted are kept, even when a later edit returns the value.
  const accepted = planReducer(both, { type: 'accept-draft' })
  assert.deepEqual(accepted.plan.stops[0].localEdits, ['title', 'time'])
  const again = edit(accepted, lecture.id, { ...laterLecture, title: 'Lecture (room 3)' })
  assert.deepEqual(again.draft.plan.stops[0].localEdits, ['title', 'time'])
})

test('resizing moves only the end, within the limits', () => {
  assert.equal(MIN_STOP_MINUTES, 5)
  assert.deepEqual(resizedStopEdit(lecture, 15, demoPlan), {
    title: lecture.title, scheduledStartAt: lecture.timing.scheduledStartAt, scheduledEndAt: '2026-09-26T00:45:00.000Z',
  })
  assert.equal(resizedStopEdit(lecture, -55, demoPlan).scheduledEndAt, '2026-09-25T23:35:00.000Z')
  assert.equal(resizeBlock(lecture, -56, demoPlan), 'too-short')
  assert.equal(resizeBlock(lecture, 24 * 60 - 60 + 1, demoPlan), 'too-long')
  // The library's window ends at 12:00pm, 30 minutes after it does.
  assert.equal(resizeBlock(library, 30, demoPlan), null)
  assert.equal(resizeBlock(library, 31, demoPlan), 'outside-window')
  assert.equal(resizeBlock({ ...library, status: 'completed' }, 10, demoPlan), 'not-editable')
  for (const [stop, delta] of [[lecture, -56], [lecture, 1381], [library, 31], [{ ...library, status: 'completed' }, 10]]) {
    assert.equal(resizedStopEdit(stop, delta, demoPlan), null, 'null exactly when blocked')
  }
  const resized = edit(createPlanState(demoPlan), library.id, resizedStopEdit(library, 15, demoPlan))
  assert.equal(resized.draft.plan.stops[1].timing.durationMinutes, 75)
})

// Adelaide is UTC+9:30 on 26 Sep, so the plan's day ends at 2026-09-26T14:30:00Z.
const fixedAt = (startAt, endAt) => ({ ...lecture, timing: { ...lecture.timing,
  durationMinutes: (Date.parse(endAt) - Date.parse(startAt)) / 60000,
  fixedStartAt: startAt, fixedEndAt: endAt, scheduledStartAt: startAt, scheduledEndAt: endAt } })

test('resizing stops at midnight unless the stop already crosses it', () => {
  const late = fixedAt('2026-09-26T13:30:00Z', '2026-09-26T14:15:00Z') // 11:00–11:45pm
  assert.equal(resizeBlock(late, 15, demoPlan), null, 'ending at midnight is fine')
  assert.equal(resizeBlock(late, 30, demoPlan), 'past-day-end')
  assert.equal(resizedStopEdit(late, 30, demoPlan), null)
  assert.equal(resizeBlock(lecture, 14 * 60, demoPlan), null)
  assert.equal(resizeBlock(lecture, 14 * 60 + 5, demoPlan), 'past-day-end')
  const crossing = fixedAt('2026-09-26T12:30:00Z', '2026-09-26T15:30:00Z') // 10:00pm–1:00am
  assert.equal(resizeBlock(crossing, 15, demoPlan), null)
  assert.equal(resizeBlock(crossing, -15, demoPlan), null)
  assert.equal(resizeBlock(crossing, -90, demoPlan), null, 'it may shrink back before midnight')
})

const adelaide = { date: demoPlan.date, timezone: demoPlan.timezone }

test('form times keep untouched timestamps and cross midnight only for a stop that already does', () => {
  const crossing = fixedAt('2026-09-26T12:30:00Z', '2026-09-26T15:30:00Z') // 10:00pm–1:00am
  assert.deepEqual(timesFromInputs(crossing, { start: '22:00', end: '01:00' }, adelaide),
    { scheduledStartAt: '2026-09-26T12:30:00Z', scheduledEndAt: '2026-09-26T15:30:00Z' })
  assert.equal(validateStopEdit(crossing, { title: 'Renamed', ...timesFromInputs(crossing, { start: '22:00', end: '01:00' }, adelaide) }), null)
  assert.deepEqual(timesFromInputs(crossing, { start: '22:00', end: '02:00' }, adelaide),
    { scheduledStartAt: '2026-09-26T12:30:00Z', scheduledEndAt: '2026-09-26T16:30:00Z' })
  assert.deepEqual(timesFromInputs(crossing, { start: '23:30', end: '01:00' }, adelaide),
    { scheduledStartAt: '2026-09-26T14:00:00Z', scheduledEndAt: '2026-09-26T15:30:00Z' })

  // 11:00pm the day before until 1:00am on the plan's day.
  const overnight = fixedAt('2026-09-25T13:30:00Z', '2026-09-25T15:30:00Z')
  assert.deepEqual(timesFromInputs(overnight, { start: '23:00', end: '01:00' }, adelaide),
    { scheduledStartAt: '2026-09-25T13:30:00Z', scheduledEndAt: '2026-09-25T15:30:00Z' })
  assert.deepEqual(timesFromInputs(overnight, { start: '23:00', end: '02:00' }, adelaide),
    { scheduledStartAt: '2026-09-25T13:30:00Z', scheduledEndAt: '2026-09-25T16:30:00Z' })

  // Seconds survive a name-only edit, so it is not a time change.
  const seconds = fixedAt('2026-09-25T23:30:30Z', '2026-09-26T00:30:00Z')
  assert.deepEqual(timesFromInputs(seconds, { start: '09:00', end: '10:00' }, adelaide),
    { scheduledStartAt: '2026-09-25T23:30:30Z', scheduledEndAt: '2026-09-26T00:30:00Z' })

  // An end before the start of a same-day stop is a typo, not a 23-hour stop.
  const typo = timesFromInputs(lecture, { start: '09:00', end: '08:00' }, adelaide)
  assert.equal(validateStopEdit(lecture, { title: lecture.title, ...typo }), 'end-before-start')

  // Ordinary daytime changes land on the plan's date.
  assert.deepEqual(timesFromInputs(lecture, { start: '09:30', end: '11:00' }, adelaide),
    { scheduledStartAt: '2026-09-26T00:00:00Z', scheduledEndAt: '2026-09-26T01:30:00Z' })
})

test('an edit longer than a day is too long', () => {
  const edit = { title: lecture.title, scheduledStartAt: '2026-09-25T23:30:00Z', scheduledEndAt: '2026-09-26T23:31:00Z' }
  assert.equal(validateStopEdit(lecture, edit), 'too-long')
  assert.equal(validateStopEdit(lecture, { ...edit, scheduledEndAt: '2026-09-26T23:30:00Z' }), null)
})

test('any accepted change to a Calendar stop\'s times marks it, so re-import keeps them', () => {
  const moved = structuredClone(calendarPlan)
  moved.stops[0].timing.scheduledStartAt = '2026-09-26T00:00:00Z'
  moved.stops[1].timing.scheduledStartAt = '2026-09-26T01:30:00Z' // a manual stop: never marked
  const marked = withLocalTimeMarks(calendarPlan, moved)
  assert.deepEqual(marked.stops[0].localEdits, ['time'])
  assert.equal(marked.stops[1].localEdits, undefined)
  assert.equal(withLocalTimeMarks(calendarPlan, calendarPlan), calendarPlan, 'nothing moved, nothing changes')
  const titled = { ...calendarPlan, stops: [{ ...calendarLecture, localEdits: ['title'] }, ...calendarPlan.stops.slice(1)] }
  const titledMoved = { ...moved, stops: [{ ...moved.stops[0], localEdits: ['title'] }, ...moved.stops.slice(1)] }
  assert.deepEqual(withLocalTimeMarks(titled, titledMoved).stops[0].localEdits, ['title', 'time'])
  // The same instant written differently is not a move.
  const reformatted = structuredClone(calendarPlan)
  reformatted.stops[0].timing.scheduledStartAt = '2026-09-25T23:30:00.000Z'
  assert.equal(withLocalTimeMarks(calendarPlan, reformatted), reformatted)
})

test('fixed stops can be deleted, taking their questions and conflicts with them', () => {
  const plan = structuredClone(demoPlan)
  plan.questions = [{ id: 'q1', stopId: lecture.id, field: 'location', prompt: 'Where?', status: 'unanswered' },
    { id: 'q2', stopId: library.id, field: 'location', prompt: 'Where?', status: 'unanswered' }]
  plan.conflicts = [{ id: 'c1', stopIds: [lecture.id, library.id], code: 'overlap', message: 'Overlap' }]
  const removed = planReducer(createPlanState(plan), { type: 'remove-stop', stopId: lecture.id })
  assert.ok(!removed.plan.stops.some((stop) => stop.id === lecture.id))
  assert.deepEqual(removed.plan.questions.map((question) => question.id), ['q2'])
  assert.deepEqual(removed.plan.conflicts, [])
  assert.equal(removed.plan.removedEvents, undefined, 'manual stops are not remembered')
  assert.deepEqual(removed.lastRemove, { stopId: lecture.id, title: lecture.title, previousPlan: plan, version: plan.version + 1, draftStop: null })
})

test('a removed Calendar stop is remembered once, so re-import leaves it out', () => {
  const removed = planReducer(createPlanState(calendarPlan), { type: 'remove-stop', stopId: lecture.id })
  const event = { sourceCalendarId: 'primary', sourceEventId: 'lecture-1', title: lecture.title }
  assert.deepEqual(removed.plan.removedEvents, [event])
  // Removing the same event again (after undo) does not duplicate it.
  const again = planReducer({ ...removed, plan: { ...calendarPlan, removedEvents: [event], version: 9 } },
    { type: 'remove-stop', stopId: lecture.id })
  assert.deepEqual(again.plan.removedEvents, [event])
  // The oldest are dropped past 500.
  const many = Array.from({ length: 500 }, (_, index) => ({ sourceCalendarId: 'primary', sourceEventId: `old-${index}`, title: 'Old' }))
  const capped = planReducer(createPlanState({ ...calendarPlan, removedEvents: many }), { type: 'remove-stop', stopId: lecture.id })
  assert.equal(capped.plan.removedEvents.length, 500)
  assert.equal(capped.plan.removedEvents[0].sourceEventId, 'old-1')
  assert.deepEqual(capped.plan.removedEvents.at(-1), event)
})

test('undo puts a removed stop back while nothing else changed', () => {
  const selected = planReducer(createPlanState(calendarPlan), { type: 'select-stop', stopId: lecture.id })
  const removed = planReducer(selected, { type: 'remove-stop', stopId: lecture.id })
  assert.equal(removed.selectedStopId, null)
  const undone = planReducer(removed, { type: 'undo-remove', stopId: lecture.id })
  assert.deepEqual(undone.plan.stops, calendarPlan.stops)
  assert.equal(undone.plan.removedEvents, undefined)
  assert.equal(undone.plan.version, removed.plan.version + 1)
  assert.equal(undone.lastRemove, null)
  assert.equal(planReducer(undone, { type: 'undo-remove', stopId: lecture.id }), undone, 'undo works once')
  assert.equal(planReducer(removed, { type: 'undo-remove', stopId: library.id }), removed, 'only the removed stop')

  // Any later accepted change makes the removal final.
  const changed = planReducer(removed, { type: 'set-stop-travel-mode', stopId: library.id, mode: 'drive' })
  assert.equal(planReducer(changed, { type: 'undo-remove', stopId: lecture.id }), changed)
  // Loading another day forgets it.
  assert.equal(planReducer(removed, { type: 'load-plan', plan: demoPlan }).lastRemove, null)
})

test('undo gives a pending draft the stop back too', () => {
  const market = demoPlan.stops.find((stop) => stop.id === 'stop-market')
  const laterMarket = { title: market.title, scheduledStartAt: '2026-09-26T02:45:00Z', scheduledEndAt: '2026-09-26T03:30:00Z' }
  const drafted = edit(createPlanState(demoPlan), market.id, laterMarket)
  const removed = planReducer(drafted, { type: 'remove-stop', stopId: library.id })
  const undone = planReducer(removed, { type: 'undo-remove', stopId: library.id })
  assert.deepEqual(undone.draft.plan.stops.map((stop) => stop.id), demoPlan.stops.map((stop) => stop.id))
  assert.equal(undone.draft.baseVersion, undone.plan.version)
  const accepted = planReducer(undone, { type: 'accept-draft' })
  assert.equal(accepted.plan.stops.find((stop) => stop.id === market.id).timing.scheduledStartAt, laterMarket.scheduledStartAt)
})

test('undo gives back the removed stop\'s pending edits, and only those', () => {
  const market = demoPlan.stops.find((stop) => stop.id === 'stop-market')
  const laterMarket = { title: market.title, scheduledStartAt: '2026-09-26T02:45:00Z', scheduledEndAt: '2026-09-26T03:30:00Z' }
  const drafted = edit(edit(createPlanState(demoPlan), market.id, laterMarket), library.id, laterLibrary)
  const removed = planReducer(drafted, { type: 'remove-stop', stopId: library.id })
  assert.deepEqual(removed.draft.editedStopIds, [market.id])
  const undone = planReducer(removed, { type: 'undo-remove', stopId: library.id })
  assert.deepEqual(undone.draft.editedStopIds, [market.id, library.id])
  const draftLibrary = undone.draft.plan.stops.find((stop) => stop.id === library.id)
  assert.equal(draftLibrary.timing.scheduledStartAt, laterLibrary.scheduledStartAt, 'the draft keeps its version of the stop')
  assert.equal(undone.plan.stops.find((stop) => stop.id === library.id).timing.scheduledStartAt, library.timing.scheduledStartAt)

  // A stop the draft never touched comes back unedited and unlocked.
  const other = planReducer(edit(createPlanState(demoPlan), market.id, laterMarket), { type: 'remove-stop', stopId: library.id })
  const otherUndone = planReducer(other, { type: 'undo-remove', stopId: library.id })
  assert.deepEqual(otherUndone.draft.editedStopIds, [market.id])

  // Removing the only edited stop empties the draft; undo brings the edit back.
  const only = planReducer(edit(createPlanState(demoPlan), library.id, laterLibrary), { type: 'remove-stop', stopId: library.id })
  assert.equal(only.draft, null)
  const onlyUndone = planReducer(only, { type: 'undo-remove', stopId: library.id })
  assert.deepEqual(onlyUndone.draft.editedStopIds, [library.id])
  assert.equal(onlyUndone.draft.baseVersion, onlyUndone.plan.version)
  const accepted = planReducer(onlyUndone, { type: 'accept-draft' })
  assert.equal(accepted.plan.stops.find((stop) => stop.id === library.id).timing.scheduledStartAt, laterLibrary.scheduledStartAt)
})
