import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import {
  createPlanSaver, emptyLivePlan, localDate, readDemoPlan, toSavedPlan, writeDemoPlan,
} from './planPersistence.js'

const PLAN_ID = '11111111-1111-4111-8111-111111111111'
const STOP_ID = '22222222-2222-4222-8222-222222222222'

function liveStop(overrides = {}) {
  return {
    id: STOP_ID, title: 'Groceries', source: 'manual', sourceEventId: null, sourceCalendarId: null,
    location: { label: 'Coles', placeId: 'places/abc', lat: -34.92, lng: 138.6 },
    timing: {
      kind: 'flexible', durationMinutes: 30, fixedStartAt: null, fixedEndAt: null,
      earliestStartAt: null, latestEndAt: null,
      scheduledStartAt: '2026-09-27T06:00:00Z', scheduledEndAt: '2026-09-27T06:30:00Z',
    },
    status: 'planned',
    ...overrides,
  }
}

const base = () => emptyLivePlan({ id: PLAN_ID, date: '2026-09-27', timezone: 'Australia/Adelaide' })
const withStops = (plan, stops) => ({ ...plan, stops })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test('localDate uses the timezone, not UTC', () => {
  const instant = new Date('2026-09-26T15:00:00Z')
  assert.equal(localDate(instant, 'Australia/Adelaide'), '2026-09-27')
  assert.equal(localDate(instant, 'America/New_York'), '2026-09-26')
})

test('saved plans drop place IDs, journeys and unknown fields but keep coordinates', () => {
  const plan = { ...withStops(base(), [{ ...liveStop(), extra: 'ui-only' }]), legs: [{ id: 'leg' }] }
  const saved = toSavedPlan(plan)
  assert.deepEqual(saved.legs, [])
  assert.deepEqual(saved.stops[0].location, { label: 'Coles', placeId: null, lat: -34.92, lng: 138.6 })
  assert.equal('extra' in saved.stops[0], false)
  assert.equal(plan.stops[0].location.placeId, 'places/abc', 'the input is not mutated')
})

test('unlocated stops get a location question; located ones mark it answered', () => {
  const unlocated = liveStop({ location: null })
  const saved = toSavedPlan(withStops(base(), [unlocated]))
  assert.equal(saved.questions.length, 1)
  assert.deepEqual({ ...saved.questions[0], prompt: undefined },
    { id: `location:${STOP_ID}`, stopId: STOP_ID, field: 'location', prompt: undefined, status: 'unanswered' })

  const located = toSavedPlan({ ...withStops(base(), [liveStop()]), questions: saved.questions })
  assert.equal(located.questions[0].status, 'answered')
  const removed = toSavedPlan({ ...base(), questions: saved.questions })
  assert.deepEqual(removed.questions, [], 'questions for deleted stops are dropped')
})

test('the saver sends nothing for an unchanged plan and saves against the server version', async () => {
  const calls = []
  const saver = createPlanSaver({
    plan: base(), version: 0,
    save: async (plan, baseVersion) => { calls.push({ plan, baseVersion }); return { ...plan, version: baseVersion + 1 } },
  })
  saver.sync({ ...base(), version: 3 })
  await flush()
  assert.equal(calls.length, 0, 'a local version bump alone is not a change')

  saver.sync({ ...withStops(base(), [liveStop()]), version: 4 })
  await flush()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].baseVersion, 0)
  assert.equal(saver.version, 1)
  assert.equal(saver.getStatus().state, 'saved')
})

test('edits made during a save are sent once, after it, with the new version', async () => {
  const calls = []
  let release
  const saver = createPlanSaver({
    plan: base(), version: 2,
    save: (plan, baseVersion) => {
      calls.push(baseVersion)
      return new Promise((resolve) => { release = () => resolve({ ...plan, version: baseVersion + 1 }) })
    },
  })
  saver.sync(withStops(base(), [liveStop({ title: 'One' })]))
  saver.sync(withStops(base(), [liveStop({ title: 'Two' })]))
  saver.sync(withStops(base(), [liveStop({ title: 'Three' })]))
  assert.equal(saver.getStatus().state, 'saving')
  release()
  await flush()
  release()
  await flush()
  assert.deepEqual(calls, [2, 3], 'one request in flight; only the latest edit follows')
  assert.equal(saver.getStatus().state, 'saved')
})

test('a version conflict stops saving until the person chooses', async () => {
  const calls = []
  let fail = true
  const saver = createPlanSaver({
    plan: base(), version: 1,
    save: async (plan, baseVersion) => {
      calls.push(baseVersion)
      if (fail) throw Object.assign(new Error('changed'), { code: 'VERSION_CONFLICT' })
      return { ...plan, version: baseVersion + 1 }
    },
  })
  const mine = withStops(base(), [liveStop()])
  saver.sync(mine)
  await flush()
  assert.equal(saver.getStatus().state, 'conflict')
  saver.sync(withStops(base(), [liveStop({ title: 'Later edit' })]))
  await flush()
  assert.equal(calls.length, 1, 'nothing is sent while the conflict is open')

  fail = false
  saver.reset({ plan: mine, version: 5, dirty: true })
  await flush()
  assert.deepEqual(calls, [1, 5], 'keep mine saves over the latest server version')
  assert.equal(saver.getStatus().state, 'saved')
})

test('adopting the server copy after a conflict sends nothing', async () => {
  let calls = 0
  const saver = createPlanSaver({
    plan: base(), version: 1,
    save: async () => { calls++; throw Object.assign(new Error('changed'), { code: 'VERSION_CONFLICT' }) },
  })
  saver.sync(withStops(base(), [liveStop()]))
  await flush()
  const server = { ...withStops(base(), [liveStop({ title: 'From phone' })]), version: 4 }
  saver.reset({ plan: server, version: 4, dirty: false })
  await flush()
  assert.equal(calls, 1)
  assert.equal(saver.getStatus().state, 'saved')
})

test('a failed save waits for retry, and a disposed saver ignores late replies', async () => {
  let attempt = 0
  const saver = createPlanSaver({
    plan: base(), version: 0,
    save: async (plan, baseVersion) => {
      attempt++
      if (attempt === 1) throw Object.assign(new Error('offline'), { code: 'NETWORK_UNAVAILABLE' })
      return { ...plan, version: baseVersion + 1 }
    },
  })
  saver.sync(withStops(base(), [liveStop()]))
  await flush()
  assert.equal(saver.getStatus().state, 'error')
  saver.retry()
  await flush()
  assert.equal(saver.getStatus().state, 'saved')
  assert.equal(saver.version, 1)

  let resolveLate
  const late = createPlanSaver({
    plan: base(), version: 0,
    save: () => new Promise((resolve) => { resolveLate = resolve }),
  })
  late.sync(withStops(base(), [liveStop()]))
  late.dispose()
  resolveLate({ version: 1 })
  await flush()
  assert.equal(late.version, 0)
})

test('the demo session copy is read back only when it is the same demo day', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  assert.equal(readDemoPlan(storage, demoPlan), demoPlan)
  const edited = { ...demoPlan, version: 2, stops: demoPlan.stops.slice(1) }
  writeDemoPlan(storage, edited)
  assert.deepEqual(readDemoPlan(storage, demoPlan), edited)
  writeDemoPlan(storage, { ...edited, id: 'another-day' })
  assert.equal(readDemoPlan(storage, demoPlan), demoPlan)
  store.set('daymap:demo-plan', '{not json')
  assert.equal(readDemoPlan(storage, demoPlan), demoPlan)
  writeDemoPlan(storage, null)
  assert.equal(readDemoPlan(storage, demoPlan), demoPlan)
  assert.equal(readDemoPlan(undefined, demoPlan), demoPlan)
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(readDemoPlan(blocked, demoPlan), demoPlan)
  assert.doesNotThrow(() => writeDemoPlan(blocked, edited))
})

test('a new day starts where the day before ended', async () => {
  const { carryOverPlaces, previousDate } = await import('./planPersistence.js')
  assert.equal(previousDate('2026-10-01'), '2026-09-30')
  assert.equal(previousDate('2027-01-01'), '2026-12-31')
  const home = { label: 'Home', placeId: null, lat: -34.95, lng: 138.6 }
  const hotel = { label: 'Hotel', placeId: null, lat: -34.98, lng: 138.51 }
  assert.deepEqual(carryOverPlaces({ startPlace: home, endPlace: hotel }), { startPlace: hotel, endPlace: null })
  assert.deepEqual(carryOverPlaces({ startPlace: home, endPlace: home }), { startPlace: home, endPlace: home })
  assert.deepEqual(carryOverPlaces(null), { startPlace: null, endPlace: null })
})

test('saved plans keep Calendar edits and removed events, and omit them when empty', () => {
  const calendarStop = liveStop({ source: 'google-calendar', sourceEventId: 'e1', sourceCalendarId: 'primary', localEdits: ['title', 'time'] })
  const removedEvents = [{ sourceCalendarId: 'primary', sourceEventId: 'e2', title: 'Standup', extra: 'ui-only' }]
  const saved = toSavedPlan({ ...withStops(base(), [calendarStop]), removedEvents })
  assert.deepEqual(saved.stops[0].localEdits, ['title', 'time'])
  assert.deepEqual(saved.removedEvents, [{ sourceCalendarId: 'primary', sourceEventId: 'e2', title: 'Standup' }])

  const empty = toSavedPlan({ ...withStops(base(), [{ ...calendarStop, localEdits: [] }, liveStop({ id: 'x', localEdits: ['title'] })]), removedEvents: [] })
  assert.equal('localEdits' in empty.stops[0], false)
  assert.equal('localEdits' in empty.stops[1], false, 'only Calendar stops carry localEdits')
  assert.equal('removedEvents' in empty, false)
})
