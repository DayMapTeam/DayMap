import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePlan } from './analyze.js'

const epoch = Date.parse('2026-09-26T00:00:00Z')
const at = (minutes) => new Date(epoch + minutes * 60000).toISOString()
const stop = (id, start, end) => ({
  id, status: 'planned', location: { placeId: id },
  timing: { kind: 'flexible', scheduledStartAt: at(start), scheduledEndAt: at(end) },
})
const plan = { stops: [stop('a', 0, 30), stop('b', 60, 90)] }
const context = (minutes = 20) => ({
  now: epoch, modeFor: () => 'walk', buffers: { walk: 5, transit: 5, drive: 10 },
  travel: () => ({ status: 'ready', travelSeconds: minutes * 60, provider: 'demo' }),
})

test('late separates journey lateness from total shortfall including buffer', () => {
  const result = analyzePlan(plan, context(35))
  assert.equal(result.conflicts[0].code, 'late')
  assert.equal(result.conflicts[0].lateMinutes, 5)
  assert.equal(result.conflicts[0].minutes, 10)
  assert.equal(result.legs[0].spareSeconds, -600)
  assert.equal(result.legs[0].arriveAt, at(65))
  assert.deepEqual(result.freeTime, [])
})

test('buffer shortfall is a warning, exact fit is neither warning nor free time', () => {
  const tight = analyzePlan(plan, context(28))
  assert.equal(tight.conflicts[0].code, 'tight')
  assert.equal(tight.conflicts[0].severity, 'warning')
  assert.equal(tight.conflicts[0].minutes, 3)
  assert.equal(tight.conflicts[0].lateMinutes, 0)
  const exact = analyzePlan(plan, context(25))
  assert.deepEqual(exact.conflicts, [])
  assert.deepEqual(exact.freeTime, [])
})

test('free time is after travel and buffer, at the destination', () => {
  const result = analyzePlan(plan, context(10))
  assert.deepEqual(result.freeTime, [{
    id: 'free:a:b', fromStopId: 'a', toStopId: 'b', locationStopId: 'b', placement: 'after-travel',
    startAt: at(45), endAt: at(60), minutes: 15, provider: 'demo',
  }])
  assert.equal(analyzePlan(plan, context(11)).freeTime.length, 0)
  assert.equal(result.summary.freeMinutes, 15)
})

test('leaving just in time puts the free time before travel, at the origin', () => {
  const late = structuredClone(plan)
  late.stops[1].leaveTiming = 'late'
  const result = analyzePlan(late, context(10))
  assert.equal(result.legs[0].departAt, at(45))
  assert.equal(result.legs[0].arriveAt, at(55))
  assert.equal(result.legs[0].spareSeconds, 0)
  assert.deepEqual(result.freeTime, [{
    id: 'free:a:b', fromStopId: 'a', toStopId: 'b', locationStopId: 'a', placement: 'before-travel',
    startAt: at(30), endAt: at(45), minutes: 15, provider: 'demo',
  }])
  // The departure lands on a five-minute mark; the rest stays as slack.
  const odd = analyzePlan(late, context(8))
  assert.equal(odd.legs[0].departAt, at(45))
  assert.equal(odd.freeTime[0].minutes, 15)
  // Nothing spare: no conflict is hidden, and the journey leaves when `a` ends.
  const tight = analyzePlan(late, context(28))
  assert.equal(tight.conflicts[0].code, 'tight')
  assert.equal(tight.legs[0].departAt, at(30))
})

test('leaving just in time rechecks public transport at the later departure', () => {
  const late = structuredClone(plan)
  late.stops[1].leaveTiming = 'late'
  // Services are slower later: 10 min at 30, 20 min at 45, 15 min at 35.
  const minutes = { [at(30)]: 10, [at(45)]: 20, [at(35)]: 15 }
  const ctx = { ...context(), modeFor: () => 'transit',
    travel: (from, to, { departAt }) => departAt in minutes
      ? { status: 'ready', travelSeconds: minutes[departAt] * 60, provider: 'google', timeDependent: true, departAt }
      : { status: 'pending' } }
  const result = analyzePlan(late, ctx)
  assert.equal(result.legs[0].departAt, at(35))
  assert.equal(result.legs[0].travelSeconds, 900)
  assert.equal(result.freeTime[0].endAt, at(35))
  // A later departure not yet looked up is requested, and meanwhile the journey leaves early.
  delete minutes[at(35)]
  const waiting = analyzePlan(late, ctx)
  assert.equal(waiting.legs[0].departAt, at(30))
  assert.deepEqual(waiting.pending, [{ fromStopId: 'a', toStopId: 'b', mode: 'transit', departAt: at(35) }])
})

test('missing location and unavailable routes never become zero-time journeys', () => {
  let calls = 0
  const ctx = { ...context(), travel: () => { calls++; return { status: 'unavailable', reason: 'no-route' } } }
  const missing = structuredClone(plan)
  missing.stops[0].location = null
  const result = analyzePlan(missing, ctx)
  assert.equal(calls, 0)
  assert.equal(result.unresolved[0].code, 'missing-location')
  const unavailable = analyzePlan(plan, ctx)
  assert.equal(unavailable.unresolved[0].code, 'no-route')
  assert.equal(unavailable.legs[0].travelSeconds, null)
  assert.deepEqual(unavailable.conflicts, [])
  assert.deepEqual(unavailable.freeTime, [])
  assert.deepEqual(unavailable.pending, [])
})

test('pending and stale estimates request verification; invalid estimates remain unresolved', () => {
  for (const estimate of [undefined, { status: 'pending' }, { status: 'stale' }]) {
    const result = analyzePlan(plan, { ...context(), travel: () => estimate })
    assert.equal(result.pending.length, 1)
    assert.equal(result.pending[0].departAt, at(30))
    assert.equal(result.legs[0].status, 'stale')
    assert.deepEqual(result.conflicts, [])
  }
  for (const duration of [-1, NaN, Infinity]) {
    const result = analyzePlan(plan, { ...context(), travel: () => ({ status: 'ready', travelSeconds: duration }) })
    assert.equal(result.unresolved[0].code, 'invalid-estimate')
  }
})

test('same place ID has no travel/buffer; nearby coordinates alone do not', () => {
  const same = structuredClone(plan)
  same.stops[1].location.placeId = 'a'
  const ctx = { now: epoch, travel: () => { throw new Error('Must not request same-place travel') } }
  const result = analyzePlan(same, ctx)
  assert.equal(result.legs[0].travelSeconds, 0)
  assert.equal(result.legs[0].bufferSeconds, 0)
  const nearby = structuredClone(plan)
  nearby.stops.forEach((s) => { s.location = { lat: -34.9, lng: 138.6 } })
  assert.equal(analyzePlan(nearby, context(10)).legs[0].travelSeconds, 600)
})

test('transit and traffic-dependent estimates must match exact proposed departure', () => {
  for (const mode of ['transit', 'drive']) {
    const ctx = {
      ...context(), modeFor: () => mode,
      travel: () => ({ status: 'ready', travelSeconds: 600, timeDependent: true, departAt: at(29) }),
    }
    assert.equal(analyzePlan(plan, ctx).unresolved[0].code, 'departure-unverified')
    ctx.travel = () => ({ status: 'ready', travelSeconds: 600, timeDependent: true, departAt: at(30) })
    assert.equal(analyzePlan(plan, ctx).legs[0].status, 'ready')
  }
})

test('overlap groups do not imply a physical route through the latest-ending stop', () => {
  const ambiguous = { stops: [stop('a', 0, 60), stop('b', 10, 20), stop('c', 90, 100), stop('d', 140, 150)] }
  const requested = []
  const ctx = { ...context(10), travel: (a, b) => { requested.push([a.id, b.id]); return { status: 'ready', travelSeconds: 600 } } }
  const result = analyzePlan(ambiguous, ctx)
  assert.deepEqual(requested, [['c', 'd']])
  assert.equal(result.conflicts[0].code, 'overlap')
  assert.ok(result.unresolved.some((item) => item.code === 'ambiguous-journey'))
  assert.equal(result.freeTime.length, 1)
})

test('past journeys are quiet; missing actual progress cannot create future free time', () => {
  assert.equal(analyzePlan(plan, { ...context(), now: epoch + 90 * 60000 }).legs.length, 0)
  const current = analyzePlan(plan, { ...context(), now: epoch + 45 * 60000 })
  assert.equal(current.unresolved[0].code, 'progress-unknown')
  assert.deepEqual(current.freeTime, [])
})

test('deterministic analysis leaves plan and supplied estimates unchanged', () => {
  const before = structuredClone(plan)
  const ctx = context(10)
  assert.deepEqual(analyzePlan(plan, ctx), analyzePlan(plan, ctx))
  assert.deepEqual(plan, before)
  assert.equal(analyzePlan(plan, { ...ctx, modeFor: () => null }).unresolved[0].code, 'missing-mode')
  assert.equal(analyzePlan(plan, { ...ctx, buffers: {} }).unresolved[0].code, 'missing-buffer')
})
