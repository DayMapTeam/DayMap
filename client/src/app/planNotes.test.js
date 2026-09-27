import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { createPlanState, planReducer } from './planReducer.js'
import { fitNewStop } from './planAdd.js'
import { toSavedPlan } from './planPersistence.js'
import { validateSave } from '../../../server/src/routes/validatePlan.js'

const now = new Date(`${demoPlan.date}T00:00:00Z`)
const note = { id: 'note-test', title: '  Remember my library card  ', location: null, kind: 'all-day' }
const add = (state, newStop = note) => planReducer(state, { type: 'add-stop', newStop,
  baseVersion: state.plan.version, now, afterStopId: null })

test('a note requires no time or travel and preserves appointments and endpoints', () => {
  const initial = createPlanState(demoPlan)
  const ctx = { travel: () => { throw new Error('Notes must not request travel') } }
  const fit = fitNewStop(initial.plan, note, { now, ctx }).options[0]
  const added = add(initial)
  assert.deepEqual(added.plan.stops.slice(0, -1), initial.plan.stops)
  assert.deepEqual(added.plan.stops, fit.plan.stops)
  assert.equal(added.plan.endPlace, initial.plan.endPlace)
  assert.equal(added.plan.stops.at(-1).title, 'Remember my library card')
  assert.equal(added.plan.stops.at(-1).timing.durationMinutes, null)
  assert.equal(added.plan.stops.at(-1).timing.scheduledStartAt, null)
  assert.equal(added.plan.questions.at(-1).status, 'deferred')
  assert.deepEqual(planReducer(added, { type: 'undo-add', stopId: note.id }).plan.stops, initial.plan.stops)
})

test('note rename/accept and delete retain valid persisted data without orphan questions', () => {
  const added = add(createPlanState(demoPlan))
  const drafted = planReducer(added, { type: 'edit-stop-draft', stopId: note.id,
    edit: { title: 'Bring a book', scheduledStartAt: null, scheduledEndAt: null } })
  assert.equal(drafted.plan.stops.at(-1).title, 'Remember my library card')
  const accepted = planReducer(drafted, { type: 'accept-draft' })
  assert.equal(accepted.plan.stops.at(-1).title, 'Bring a book')
  const saved = toSavedPlan(accepted.plan)
  saved.id = '00000000-0000-4000-8000-000000000001'
  assert.equal(saved.stops.at(-1).timing.durationMinutes, null)
  assert.doesNotThrow(() => validateSave(saved.id, { baseVersion: saved.version, plan: saved }))
  const deleted = planReducer(accepted, { type: 'remove-stop', stopId: note.id })
  assert.ok(!deleted.plan.questions.some((question) => question.stopId === note.id))
  assert.ok(!deleted.plan.stops.some((stop) => stop.id === note.id))
})

test('notes reject blank names and stale adds; imported all-day entries remain protected', () => {
  const state = createPlanState(demoPlan)
  assert.equal(add(state, { ...note, title: '  ' }), state)
  assert.equal(planReducer(state, { type: 'add-stop', newStop: note, baseVersion: -1, now }), state)
  const imported = { ...note, source: 'google-calendar', timing: { kind: 'all-day' } }
  const calendar = createPlanState({ ...demoPlan, stops: [imported] })
  assert.equal(planReducer(calendar, { type: 'remove-stop', stopId: note.id }), calendar)
})

test('Home followed by reading remains two activities without changing day endpoints', () => {
  const empty = createPlanState({ ...demoPlan, stops: [], legs: [], questions: [] })
  const activity = { id: 'home', title: 'Home', location: null, kind: 'timed',
    startAt: new Date(now.getTime() + 3600000).toISOString(), endAt: new Date(now.getTime() + 5400000).toISOString() }
  const home = add(empty, activity)
  const reading = add(home, { ...activity, id: 'reading', title: 'Read a book',
    startAt: activity.endAt, endAt: new Date(now.getTime() + 7200000).toISOString() })
  assert.deepEqual(reading.plan.stops.map((stop) => stop.title), ['Home', 'Read a book'])
  assert.equal(reading.plan.endPlace, empty.plan.endPlace)
})
