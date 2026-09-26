import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { calendarLocationText, placeStatus, setStopLocation } from './planLocations.js'
import { createPlanState, planReducer } from './planReducer.js'

const imported = {
  ...demoPlan,
  stops: [...demoPlan.stops, {
    ...demoPlan.stops[0], id: 'cal-1', title: 'Lecture', source: 'google-calendar',
    sourceEventId: 'e1', sourceCalendarId: 'primary', location: null,
  }],
  questions: [{ id: 'location:cal-1', stopId: 'cal-1', field: 'location', status: 'unanswered',
    prompt: 'Confirm where "Lecture" is. Calendar says: "Napier 102, North Tce".' }],
}
const napier = { label: 'Napier Building, North Terrace', placeId: 'places/x', lat: -34.9203, lng: 138.6039 }

test('the Calendar text is read back from the import question', () => {
  assert.equal(calendarLocationText(imported.questions[0]), 'Napier 102, North Tce')
  assert.equal(calendarLocationText({ prompt: 'Where is "Lecture"?' }), null)
  assert.equal(calendarLocationText(null), null)
})

test('setting a place answers the question and keeps the times', () => {
  assert.equal(placeStatus(imported, imported.stops.at(-1)), 'needed')
  const next = setStopLocation(imported, 'cal-1', napier)
  const stop = next.stops.at(-1)
  assert.deepEqual(stop.location, napier)
  assert.deepEqual(stop.timing, imported.stops.at(-1).timing)
  assert.equal(next.questions[0].status, 'answered')
  assert.equal(placeStatus(next, stop), 'set')
  assert.equal(imported.stops.at(-1).location, null, 'the input is not mutated')
  assert.equal(setStopLocation(next, 'cal-1', { ...napier }), next, 'the same place changes nothing')
  assert.equal(setStopLocation(next, 'missing', napier), next)
})

test('no place needed defers the question, creating one if needed', () => {
  const none = setStopLocation(imported, 'cal-1', null)
  assert.equal(none.questions[0].status, 'deferred')
  assert.equal(placeStatus(none, none.stops.at(-1)), 'none')
  assert.equal(setStopLocation(none, 'cal-1', null), none)

  const manual = setStopLocation(demoPlan, 'stop-library', null)
  assert.equal(manual.stops[1].location, null)
  assert.deepEqual(manual.questions.map((q) => [q.stopId, q.status]), [['stop-library', 'deferred']])
})

test('the reducer applies a place to the accepted plan and to a pending draft', () => {
  let state = createPlanState(imported)
  const library = imported.stops[1]
  state = planReducer(state, { type: 'edit-stop-draft', stopId: library.id, edit: {
    title: 'Library study (edited)', scheduledStartAt: library.timing.scheduledStartAt, scheduledEndAt: library.timing.scheduledEndAt,
  } })
  assert.ok(state.draft)
  const version = state.plan.version
  const next = planReducer(state, { type: 'set-stop-location', stopId: 'cal-1', location: napier })
  assert.equal(next.plan.version, version + 1)
  assert.deepEqual(next.plan.stops.at(-1).location, napier)
  assert.deepEqual(next.draft.plan.stops.at(-1).location, napier)
  assert.equal(next.draft.plan.stops[1].title, 'Library study (edited)', 'the draft keeps its own edit')
  assert.equal(next.draft.baseVersion, version + 1, 'the draft still applies to the new version')
  assert.equal(planReducer(next, { type: 'set-stop-location', stopId: 'cal-1', location: napier }), next)
})
