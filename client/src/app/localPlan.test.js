import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { isDemoRequested, readLocalPlan, writeLocalPlan } from './localPlan.js'
import { toSavedPlan, writeDemoPlan } from './planPersistence.js'
import { createPlanState, planReducer } from './planReducer.js'

const day = { demo: false, date: '2026-09-27', timezone: 'Australia/Adelaide' }
const memoryStorage = () => {
  const items = new Map()
  return { getItem: (key) => items.get(key), setItem: (key, value) => items.set(key, value) }
}

test('normal startup is empty even when the old automatic demo was saved', () => {
  const storage = memoryStorage()
  writeDemoPlan(storage, demoPlan)
  const plan = readLocalPlan(storage, day)
  assert.equal(plan.date, day.date)
  assert.equal(plan.timezone, day.timezone)
  assert.equal(plan.dataMode, 'live')
  assert.deepEqual(plan.stops, [])
  assert.deepEqual(plan.legs, [])
  assert.equal(isDemoRequested(''), false)
  assert.equal(isDemoRequested('?demo=0'), false)
  assert.equal(isDemoRequested('?demo=1'), true)
})

test('local events survive refresh independently of the opt-in demo', () => {
  const storage = memoryStorage()
  const initial = readLocalPlan(storage, day)
  const edited = { ...initial, version: 1, stops: [{ ...demoPlan.stops[1], id: 'my-event', title: 'My event' }] }
  writeLocalPlan(storage, edited)
  assert.deepEqual(readLocalPlan(storage, day), toSavedPlan(edited))
  assert.deepEqual(readLocalPlan(storage, { ...day, demo: true }), demoPlan)
  writeLocalPlan(storage, { ...demoPlan, stops: [] })
  assert.deepEqual(readLocalPlan(storage, { ...day, demo: true }).stops, [])
  assert.deepEqual(readLocalPlan(storage, day).stops, toSavedPlan(edited).stops)
})

test('a signed-in account plan cannot overwrite the local day on sign-out', () => {
  const storage = memoryStorage()
  const local = readLocalPlan(storage, day)
  writeLocalPlan(storage, local)
  writeLocalPlan(storage, { ...local, id: 'account-plan-id', stops: demoPlan.stops })
  assert.deepEqual(readLocalPlan(storage, day).stops, [])
})

test('a new date, bad storage or blocked storage starts empty, never with fixture pins', () => {
  const storage = memoryStorage()
  writeLocalPlan(storage, { ...readLocalPlan(storage, day), stops: demoPlan.stops })
  assert.deepEqual(readLocalPlan(storage, { ...day, date: '2026-09-28' }).stops, [])
  storage.setItem('daymap:local-plan', '{bad json')
  assert.deepEqual(readLocalPlan(storage, day).stops, [])
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.deepEqual(readLocalPlan(blocked, day).stops, [])
  assert.doesNotThrow(() => writeLocalPlan(blocked, readLocalPlan(undefined, day)))
})

test('event selection stays linked and switching days clears stale selection', () => {
  const local = { ...readLocalPlan(undefined, day), stops: demoPlan.stops }
  const selected = planReducer(createPlanState(local), { type: 'select-stop', stopId: local.stops[0].id })
  assert.equal(selected.selectedStopId, local.stops[0].id)
  const empty = planReducer(selected, { type: 'load-plan', plan: readLocalPlan(undefined, day) })
  assert.equal(empty.selectedStopId, null)
  assert.deepEqual(empty.plan.stops, [])
})
