import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers'
import { currentRecovery, freshPosition, laterStartEdit, recoveryAdvice, recoveryOptions, recoveryTarget } from './recovery.js'
import { createRecoveryStore } from './recoveryStore.js'
import { createNavigationRouteProvider } from '../services/navigationRoute.js'
import { offsetPoint } from './tripRules.js'

const now = Date.parse('2026-09-27T00:00:00Z')
const from = { lat: -34.93, lng: 138.6, accuracy: 10, observedAt: now }
const to = offsetPoint(from, 0, 3000)
const stamp = (minutes) => new Date(now + minutes * 60000).toISOString()
const target = { id: 'library', title: 'Library', status: 'planned', source: 'manual', location: to,
  timing: { kind: 'flexible', scheduledStartAt: stamp(20), scheduledEndAt: stamp(50), earliestStartAt: null, latestEndAt: null } }
const plan = { id: 'day', version: 1, date: '2026-09-27', timezone: 'Australia/Adelaide', stops: [target] }
const ride = (board = 5, arrive = 12) => ({ seconds: 15 * 60, steps: [
  { kind: 'walk', seconds: 3 * 60 }, { kind: 'ride', ride: { departAt: stamp(board), arriveAt: stamp(arrive) } },
  { kind: 'walk', seconds: 3 * 60 },
] })
const snapshot = (results) => ({ key: 'day', status: 'ready', from, departAt: now, results })
const estimates = [{ mode: 'walk', route: { seconds: 30 * 60 } }, { mode: 'transit', route: ride() }, { mode: 'drive', route: { seconds: 5 * 60 } }]

test('late walking recommends catchable transit including buffers; cars require confirmation', () => {
  const options = recoveryOptions(snapshot(estimates), target, now, false)
  assert.deepEqual(options.map((o) => o.mode), ['transit', 'walk'])
  const advice = recoveryAdvice(options, 'walk', now)
  assert.equal(advice.kind, 'late')
  assert.equal(advice.current.lateMinutes, 15)
  assert.equal(advice.alternative.mode, 'transit')
  assert.equal(advice.alternative.lateMinutes, 0)
  assert.equal(advice.alternative.readyAt, now + 20 * 60000)
  assert.equal(recoveryOptions(snapshot(estimates), target, now, true)[0].mode, 'drive')
})

test('missed services and impossible transfers never appear as recovery options', () => {
  assert.equal(recoveryOptions(snapshot([{ mode: 'transit', route: ride(2) }]), target, now, false).length, 0)
  const transfer = ride()
  transfer.steps.push({ kind: 'ride', ride: { departAt: stamp(14), arriveAt: stamp(18) } })
  assert.equal(recoveryOptions(snapshot([{ mode: 'transit', route: transfer }]), target, now, false).length, 0)
  assert.equal(recoveryOptions(snapshot([{ mode: 'transit', route: ride() }]), target, now + 3 * 60000, false).length, 0)
})

test('no route, bad durations, and unconfirmed cars do not become instant or recommended journeys', () => {
  const options = recoveryOptions(snapshot([{ mode: 'walk', route: null }, { mode: 'transit', route: { seconds: NaN } }, estimates[2]]), target, now, false)
  assert.deepEqual(options, [])
  assert.equal(recoveryAdvice(options, 'walk', now).kind, 'unknown')
})

test('departure checks distinguish leaving soon, now, and early', () => {
  const option = (minutes) => [{ mode: 'walk', leaveAt: now + (20 - minutes) * 60000, lateMinutes: 0 }]
  assert.equal(recoveryAdvice(option(16), 'walk', now).kind, 'due')
  assert.equal(recoveryAdvice(option(12), 'walk', now).kind, 'soon')
  assert.equal(recoveryAdvice(option(5), 'walk', now).kind, 'early')
})

test('freshness rejects expired GPS, denied access, moved origins and previous plan responses', () => {
  assert.equal(freshPosition(from, 'on', now), true)
  assert.equal(freshPosition(from, 'denied', now), false)
  assert.equal(freshPosition(from, 'on', now + 31000), false)
  assert.equal(freshPosition({ ...from, accuracy: 101 }, 'on', now), false)
  const data = snapshot(estimates)
  assert.equal(currentRecovery(data, { key: 'day', from, now }), true)
  assert.equal(currentRecovery(data, { key: 'old', from, now }), false)
  assert.equal(currentRecovery(data, { key: 'day', from, now: now + 60000 }), false)
  assert.equal(currentRecovery(data, { key: 'day', from: to, now }), false)
})

test('a missing immediate location is not skipped; notes and completed stops are excluded', () => {
  const missing = { ...target, id: 'missing', location: null }
  const note = { ...target, id: 'note', timing: { kind: 'all-day' } }
  assert.equal(recoveryTarget({ ...plan, stops: [note, missing, target] }, {}, now), missing)
  assert.equal(recoveryTarget({ ...plan, stops: [{ ...missing, status: 'completed' }, target] }, {}, now), target)
})

test('later-start drafts preserve duration, fixed appointments, windows and the day boundary', () => {
  const option = { readyAt: now + 32 * 60000, lateMinutes: 12 }
  const before = structuredClone(plan)
  const edit = laterStartEdit(plan, target, option, now)
  assert.equal(edit.scheduledStartAt, stamp(35))
  assert.equal(edit.scheduledEndAt, stamp(65))
  assert.deepEqual(plan, before)
  assert.equal(laterStartEdit(plan, { ...target, timing: { ...target.timing, kind: 'fixed' } }, option, now), null)
  assert.equal(laterStartEdit(plan, { ...target, timing: { ...target.timing, latestEndAt: stamp(60) } }, option, now), null)
  assert.equal(laterStartEdit(plan, target, { ...option, readyAt: now + 23 * 3600000 }, now), null)
  assert.equal(laterStartEdit(plan, { ...target, status: 'completed' }, option, now), null)
})

const tick = () => new Promise((resolve) => setImmediate(resolve))
test('comparisons are bounded, refreshed, and ignore superseded responses', async () => {
  const calls = []
  const store = createRecoveryStore((args) => new Promise((resolve) => calls.push({ args, resolve })))
  const request = { key: 'day', from, to, now, modes: ['walk', 'transit'] }
  store.request(request)
  store.request(request)
  await tick()
  assert.equal(calls.length, 2)
  store.request({ ...request, key: 'other' })
  await tick()
  calls[0].resolve({ seconds: 1 }); calls[1].resolve({ seconds: 2 })
  await tick()
  assert.equal(store.getSnapshot().key, 'other')
  assert.equal(store.getSnapshot().status, 'loading')
  calls[2].resolve({ seconds: 100 }); calls[3].resolve(null)
  await tick()
  assert.equal(store.getSnapshot().status, 'ready')
  store.request({ ...request, key: 'other', from: to, now: now + 5000 })
  await tick()
  assert.equal(calls.length, 4, 'GPS movement does not hammer the provider')
  store.request({ ...request, key: 'other', now: now + 60000 })
  await tick()
  assert.equal(calls.length, 6)
  store.clear()
  calls[4].resolve({ seconds: 10 }); calls[5].resolve({ seconds: 10 })
  await tick()
  assert.equal(store.getSnapshot().status, 'idle')
})

test('a timeout produces unavailable options instead of a permanent spinner', async () => {
  const store = createRecoveryStore(() => new Promise(() => {}), { timeoutMs: 5 })
  store.request({ key: 'day', from, to, now, modes: ['walk'] })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(store.getSnapshot().status, 'ready')
  assert.equal(store.getSnapshot().results[0].route, null)
  store.clear()
})

test('provider uses actual transit departure and traffic-aware driving', async () => {
  const calls = []
  const provider = createNavigationRouteProvider(async () => ({ Route: { computeRoutes: async (request) => {
    calls.push(request)
    return { routes: [{ durationMillis: 600000, path: [from, to], legs: [] }] }
  } } }))
  await provider({ from, to, mode: 'transit', departAt: stamp(0) })
  await provider({ from, to, mode: 'drive', departAt: stamp(0) })
  assert.equal(calls[0].departureTime.toISOString(), stamp(0))
  assert.equal(calls[1].routingPreference, 'TRAFFIC_AWARE')
})


test('a transit leave alert follows the boarding deadline, not spare time after arrival', () => {
  const later = { ...target, timing: { ...target.timing, scheduledStartAt: stamp(60), scheduledEndAt: stamp(90) } }
  const options = recoveryOptions(snapshot(estimates), later, now, false)
  const advice = recoveryAdvice(options, 'transit', now)
  assert.equal(advice.kind, 'due', 'the bus must be reached in two minutes even though the event is an hour away')
})

test('invalid walking durations and missing transit timestamps cannot prove a connection', () => {
  const invalid = ride()
  invalid.steps[0].seconds = NaN
  assert.deepEqual(recoveryOptions(snapshot([{ mode: 'transit', route: invalid }]), target, now, false), [])
  const missing = ride()
  missing.steps[1].ride.arriveAt = null
  assert.deepEqual(recoveryOptions(snapshot([{ mode: 'transit', route: missing }]), target, now, false), [])
})

test('transit arrival uses scheduled arrival plus the final walk, including waiting', () => {
  const service = ride(8, 20)
  service.seconds = 10 * 60 // Step durations alone can omit waiting; the scheduled arrival wins.
  const [option] = recoveryOptions(snapshot([{ mode: 'transit', route: service }]), target, now, false)
  assert.equal(option.readyAt, now + 28 * 60000)
  assert.equal(option.lateMinutes, 8)
})
