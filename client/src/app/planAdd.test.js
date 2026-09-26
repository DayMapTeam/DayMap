import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { chooseOption, fitNewStop, validateNewStop } from './planAdd.js'
import { createPlanState, planReducer } from './planReducer.js'

// Demo day (Adelaide, UTC+9:30 on 26 Sep): Morning lecture 9:00–10:00 fixed,
// Library study 10:30–11:30 (window 10:00–12:00), Lunch 12:00–12:45
// (window 11:30–1:00), Afternoon break 1:00–1:30 (window 12:45–2:30).
const NOW = new Date('2026-09-26T00:20:00Z') // 9:50am, the demo clock
const lecture = 'stop-university'
const library = 'stop-library'
const market = 'stop-market'
const square = 'stop-square'

function flexible(durationMinutes, overrides = {}) {
  return { id: 'stop-new', title: 'Coffee', location: null, kind: 'flexible', durationMinutes, ...overrides }
}

function fixed(startAt, endAt) {
  return { id: 'stop-new', title: 'Call', location: null, kind: 'fixed', startAt, endAt }
}

function stopIn(plan, id) {
  return plan.stops.find((stop) => stop.id === id)
}

// The demo day with Lunch made a fixed commitment.
function withFixedLunch() {
  const plan = structuredClone(demoPlan)
  const lunch = stopIn(plan, market)
  lunch.timing = {
    ...lunch.timing,
    kind: 'fixed',
    fixedStartAt: lunch.timing.scheduledStartAt,
    fixedEndAt: lunch.timing.scheduledEndAt,
    earliestStartAt: null,
    latestEndAt: null,
  }
  return plan
}

test('a flexible stop that fits its gap moves nothing and reports the spare time', () => {
  const { options: [option] } = fitNewStop(demoPlan, flexible(20), { afterStopId: lecture, now: NOW })
  assert.equal(option.ok, true)
  assert.equal(option.startAt, '2026-09-26T00:30:00Z')
  assert.equal(option.endAt, '2026-09-26T00:50:00Z')
  assert.equal(option.spareMinutes, 10)
  assert.equal(option.nextStopId, library)
  assert.deepEqual(option.shiftedStopIds, [])
  assert.deepEqual(option.plan.stops.map((stop) => stop.id), [lecture, 'stop-new', library, market, square])
  assert.deepEqual(option.changes.map(({ stopId, type }) => [stopId, type]), [
    [lecture, 'none'], ['stop-new', 'new'], [library, 'none'], [market, 'none'], [square, 'none'],
  ])
})

test('a longer stop pushes later flexible stops back within their windows', () => {
  const { options: [option] } = fitNewStop(demoPlan, flexible(45), { afterStopId: lecture, now: NOW })
  assert.equal(option.ok, true)
  assert.deepEqual(option.shiftedStopIds, [library])
  const moved = stopIn(option.plan, library)
  assert.equal(moved.timing.scheduledStartAt, '2026-09-26T01:15:00Z')
  assert.equal(moved.timing.scheduledEndAt, '2026-09-26T02:15:00Z')
  assert.equal(option.spareMinutes, 15)
  const change = option.changes.find(({ stopId }) => stopId === library)
  assert.deepEqual(change, { stopId: library, type: 'shifted', fromStartAt: '2026-09-26T01:00:00Z' })
})

test('a stop that would push another past its window does not fit', () => {
  const { options: [option] } = fitNewStop(demoPlan, flexible(90), { afterStopId: lecture, now: NOW })
  assert.equal(option.ok, false)
  assert.deepEqual(option.reason, { code: 'outside-window', stopId: library })
  assert.equal(option.plan, null)
})

test('too long for the gap before a fixed stop reports the minutes late', () => {
  const plan = withFixedLunch()
  const { options: [option] } = fitNewStop(plan, flexible(45), { afterStopId: library, now: NOW })
  assert.equal(option.ok, false)
  assert.deepEqual(option.reason, { code: 'late', stopId: market, minutesLate: 15 })
})

test('fixed stops never move', () => {
  const plan = withFixedLunch()
  for (const newStop of [flexible(60), flexible(20), fixed('2026-09-26T02:00:00Z', '2026-09-26T02:20:00Z')]) {
    for (const option of fitNewStop(plan, newStop, { now: NOW }).options) {
      assert.ok(!option.shiftedStopIds.includes(lecture))
      assert.ok(!option.shiftedStopIds.includes(market))
    }
  }
})

test('a fixed time that overlaps a stop names it', () => {
  // 11:00–11:20am starts during Library study, which can only move later.
  const { options: [option] } = fitNewStop(demoPlan, fixed('2026-09-26T01:30:00Z', '2026-09-26T01:50:00Z'), { now: NOW })
  assert.equal(option.ok, false)
  assert.deepEqual(option.reason, { code: 'overlaps', stopId: library })
  // 9:30am overlaps the fixed lecture when checked before it starts.
  const early = fitNewStop(demoPlan, fixed('2026-09-26T00:00:00Z', '2026-09-26T00:15:00Z'), {
    now: new Date('2026-09-25T22:00:00Z'),
  })
  assert.deepEqual(early.options[0].reason, { code: 'overlaps', stopId: lecture })
})

test('a fixed time pushes flexible stops that start after it', () => {
  // 10:00–10:40am: Library study moves from 10:30 to 10:40.
  const { options: [option] } = fitNewStop(demoPlan, fixed('2026-09-26T00:30:00Z', '2026-09-26T01:10:00Z'), { now: NOW })
  assert.equal(option.ok, true)
  assert.equal(option.afterStopId, lecture)
  assert.deepEqual(option.shiftedStopIds, [library])
  const added = stopIn(option.plan, 'stop-new')
  assert.equal(added.timing.kind, 'fixed')
  assert.equal(added.timing.fixedStartAt, '2026-09-26T00:30:00Z')
  assert.equal(added.timing.durationMinutes, 40)
})

test('a time that has already passed does not fit', () => {
  const { options: [option] } = fitNewStop(demoPlan, fixed('2026-09-26T00:00:00Z', '2026-09-26T00:15:00Z'), { now: NOW })
  assert.deepEqual(option.reason, { code: 'in-past' })
})

test('a stop without a place is added with no location and unknown travel', () => {
  const { options: [option] } = fitNewStop(demoPlan, flexible(15), { afterStopId: market, now: NOW })
  const added = stopIn(option.plan, 'stop-new')
  assert.equal(added.location, null)
  assert.equal(added.source, 'manual')
  assert.equal(added.status, 'planned')
})

test('the recommended option is the soonest that moves the fewest stops', () => {
  const { options } = fitNewStop(demoPlan, flexible(20), { now: NOW })
  assert.equal(options.filter((option) => option.recommended).length, 1)
  assert.equal(options[0].recommended, true)
  assert.equal(options[0].afterStopId, lecture)
  // After Lunch, 20 minutes pushes Afternoon break back, so it ranks after every slot that moves nothing.
  assert.equal(options.at(-1).afterStopId, market)
  assert.deepEqual(options.at(-1).shiftedStopIds, [square])
})

test('invalid drafts are explained before any slot is tried', () => {
  assert.equal(validateNewStop(flexible(20, { title: '  ' })), 'missing-title')
  assert.equal(validateNewStop(flexible(20, { title: 'x'.repeat(121) })), 'title-too-long')
  assert.equal(validateNewStop(flexible(2)), 'invalid-duration')
  assert.equal(validateNewStop(fixed(null, null)), 'missing-time')
  assert.equal(validateNewStop(fixed('2026-09-26T01:00:00Z', '2026-09-26T01:00:00Z')), 'end-before-start')
  assert.deepEqual(fitNewStop(demoPlan, flexible(20, { title: '' }), { now: NOW }), { error: 'missing-title', options: [] })
})

test('fitting never changes the plan it is given', () => {
  const snapshot = structuredClone(demoPlan)
  fitNewStop(demoPlan, flexible(45), { now: NOW })
  fitNewStop(demoPlan, fixed('2026-09-26T00:30:00Z', '2026-09-26T01:10:00Z'), { now: NOW })
  assert.deepEqual(demoPlan, snapshot)
})

function add(state, newStop, afterStopId) {
  return planReducer(state, { type: 'add-stop', newStop, afterStopId, baseVersion: state.plan.version, now: NOW })
}

test('adding applies exactly the previewed plan and selects the new stop', () => {
  const initial = createPlanState(demoPlan)
  const preview = chooseOption(initial.plan, flexible(45), { afterStopId: lecture, now: NOW })
  const added = add(initial, flexible(45), lecture)
  assert.deepEqual(added.plan, { ...preview.plan, version: demoPlan.version + 1 })
  assert.equal(added.selectedStopId, 'stop-new')
})

test('adding is rejected when it no longer fits, the version is stale, or an edit is pending', () => {
  const initial = createPlanState(demoPlan)
  assert.equal(add(initial, flexible(90), lecture), initial)
  const stale = planReducer(initial, { type: 'add-stop', newStop: flexible(20), afterStopId: lecture, baseVersion: 0, now: NOW })
  assert.equal(stale, initial)
  const drafted = planReducer(initial, {
    type: 'edit-stop-draft',
    stopId: library,
    edit: { title: 'Library', scheduledStartAt: '2026-09-26T01:00:00Z', scheduledEndAt: '2026-09-26T02:00:00Z' },
  })
  assert.equal(add(drafted, flexible(20), lecture), drafted)
})

test('undo restores the day before the add, only while nothing else changed', () => {
  const initial = createPlanState(demoPlan)
  const added = add(initial, flexible(45), lecture)
  const undone = planReducer(added, { type: 'undo-add', stopId: 'stop-new' })
  assert.deepEqual(undone.plan.stops, demoPlan.stops)
  assert.equal(undone.plan.version, demoPlan.version + 2)
  assert.equal(undone.selectedStopId, null)
  const newer = { ...added, plan: { ...added.plan, version: added.plan.version + 1 } }
  assert.equal(planReducer(newer, { type: 'undo-add', stopId: 'stop-new' }), newer)
})

// A planning context whose journeys take `minutes[fromId:toId]` (default 10) on
// foot, plus the 5-minute walking buffer. Missing entries can be marked pending.
function travelContext(minutes = {}, { pending = [] } = {}) {
  return {
    modeFor: () => 'walk',
    buffers: { walk: 5 },
    travel: (from, to) => {
      const key = `${from.id}:${to.id}`
      if (pending.includes(key)) return { status: 'pending' }
      return { status: 'ready', travelSeconds: (minutes[key] ?? 10) * 60 }
    },
  }
}
const coles = { label: 'Coles', placeId: null, lat: -34.93, lng: 138.6 }

test('a new stop starts once you can get there, and later stops leave room for travel', () => {
  const ctx = travelContext({ 'stop-university:stop-new': 20, 'stop-new:stop-library': 10 })
  const { options: [option] } = fitNewStop(demoPlan, flexible(15, { location: coles }), { afterStopId: lecture, now: NOW, ctx })
  assert.equal(option.ok, true)
  // Lecture ends 10:00; 20 min walk + 5 min buffer → 10:25–10:40.
  assert.equal(option.startAt, '2026-09-26T00:55:00Z')
  assert.equal(option.endAt, '2026-09-26T01:10:00Z')
  // Library (10:30) moves to 10:40 + 15 min (10 walk + 5 buffer) = 10:55.
  assert.equal(stopIn(option.plan, library).timing.scheduledStartAt, '2026-09-26T01:25:00Z')
  // Lunch and the break shift only as far as their own journeys need.
  assert.equal(stopIn(option.plan, market).timing.scheduledStartAt, '2026-09-26T02:40:00Z')
  assert.deepEqual(option.journeys.map(({ fromStopId, toStopId, minutes, status }) => [fromStopId, toStopId, minutes, status]), [
    [lecture, 'stop-new', 25, 'ready'],
    ['stop-new', library, 15, 'ready'],
  ])
})

test('travel into a fixed stop that cannot be made is reported as late', () => {
  const plan = withFixedLunch()
  const ctx = travelContext({ 'stop-new:stop-market': 40 })
  const { options: [option] } = fitNewStop(plan, flexible(20, { location: coles }), { afterStopId: library, now: NOW, ctx })
  // Library ends 11:30; new stop 11:45–12:05 after 15 min; 45 min to lunch at 12:00.
  assert.equal(option.ok, false)
  assert.equal(option.reason.code, 'late')
  assert.equal(option.reason.stopId, market)
  assert.equal(option.reason.minutesLate, 50)
})

test('unknown travel counts as zero but is reported, and no place means no journey', () => {
  const ctx = travelContext({}, { pending: ['stop-university:stop-new'] })
  const { options: [option] } = fitNewStop(demoPlan, flexible(20, { location: coles }), { afterStopId: lecture, now: NOW, ctx })
  assert.equal(option.startAt, '2026-09-26T00:30:00Z', 'straight after the lecture while the journey loads')
  assert.equal(option.journeys[0].status, 'pending')
  assert.equal(option.journeys[0].departAt, '2026-09-26T00:30:00.000Z')

  const { options: [placeless] } = fitNewStop(demoPlan, flexible(20), { afterStopId: lecture, now: NOW, ctx: travelContext() })
  assert.deepEqual(placeless.journeys.map((leg) => leg.status), ['no-place', 'no-place'])
  assert.equal(placeless.startAt, '2026-09-26T00:30:00Z')
})

test('a fixed new stop keeps its time and says how late the journey there would make you', () => {
  const ctx = travelContext({ 'stop-university:stop-new': 30 })
  const { options: [option] } = fitNewStop(demoPlan, { ...fixed('2026-09-26T00:40:00Z', '2026-09-26T00:55:00Z'), location: coles }, { now: NOW, ctx })
  assert.equal(option.ok, true)
  assert.equal(option.startAt, '2026-09-26T00:40:00Z')
  assert.equal(option.lateArrivalMinutes, 25, 'lecture ends 10:00, 35 min to get there, starts 10:10')
})

test('the reducer commits exactly the travel-aware option the preview showed', () => {
  const ctx = travelContext({ 'stop-university:stop-new': 20, 'stop-new:stop-library': 10 })
  const newStop = flexible(15, { location: coles })
  const preview = chooseOption(demoPlan, newStop, { afterStopId: lecture, now: NOW, ctx })
  const state = planReducer(createPlanState(demoPlan), { type: 'add-stop', newStop, afterStopId: lecture, baseVersion: demoPlan.version, now: NOW, ctx })
  assert.deepEqual(state.plan.stops, preview.plan.stops)
})

test('an event added with From–To times keeps them and stays flexible', () => {
  const timed = { id: 'stop-new', title: 'Ice cream', location: null, kind: 'timed', startAt: '2026-09-26T04:30:00Z', endAt: '2026-09-26T05:00:00Z' }
  const option = chooseOption(demoPlan, timed, { afterStopId: null, now: NOW })
  const added = stopIn(option.plan, 'stop-new')
  assert.equal(added.timing.kind, 'flexible')
  assert.equal(added.timing.scheduledStartAt, '2026-09-26T04:30:00Z')
  assert.equal(added.timing.fixedStartAt, null)
  assert.equal(fitNewStop(demoPlan, { ...timed, endAt: null }, { now: NOW }).error, 'missing-time')
})
