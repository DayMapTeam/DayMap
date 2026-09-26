import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoutesProvider, createWalkingRoutesProvider, routeLocation, routePairKey, walkingPairKey } from './walkingRoutes.js'
import { createWalkingRouteStore } from './walkingRouteStore.js'
import { chooseTravelProvider } from './planningContext.js'

const stop = (id, lat = 1) => ({ id, location: { lat, lng: 2 } })
const a = stop('a'), b = stop('b', 3), c = stop('c', 4), d = stop('d', 5)
const ready = (seconds = 120) => ({ status: 'ready', travelSeconds: seconds, provider: 'google' })
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('adapter uses WALKING, minimal fields and converts milliseconds to seconds', async () => {
  let request
  const provider = createWalkingRoutesProvider(async (library) => {
    assert.equal(library, 'routes')
    return { RouteMatrix: { async computeRouteMatrix(input) {
      request = input
      return { matrix: { rows: [{ items: [
        { condition: 'ROUTE_EXISTS', durationMillis: 125500, distanceMeters: 150 },
        { condition: 'ROUTE_NOT_FOUND' },
        { condition: 'ROUTE_EXISTS', durationMillis: NaN },
      ] }] } }
    } } }
  })
  const result = await provider(a, [b, c, d])
  assert.deepEqual(request, { origins: [{ lat: 1, lng: 2 }], destinations: [b.location, c.location, d.location],
    travelMode: 'WALKING', fields: ['durationMillis', 'distanceMeters', 'condition'] })
  assert.equal(result[0].timeDependent, false)
  assert.equal(result[0].travelSeconds, 125.5)
  assert.equal(result[0].provider, 'google')
  assert.equal(result[1].reason, 'no-route')
  assert.equal(result[2].status, 'unavailable')
})

test('keys are directional and location-based, independent of event times', () => {
  assert.notEqual(walkingPairKey(a, b), walkingPairKey(b, a))
  assert.equal(walkingPairKey(a, b), walkingPairKey({ ...a, timing: { scheduledEndAt: 'new time' } }, b))
  assert.notEqual(walkingPairKey(a, b), walkingPairKey(a, { ...b, location: c.location }))
  assert.equal(walkingPairKey(a, { location: null }), null)
  assert.equal(routeLocation({ placeId: 'abc' }), 'places/abc')
  assert.equal(routeLocation({ placeId: 'places/abc' }), 'places/abc')
})

test('initial requests group destinations, deduplicate and do not refetch for time edits', async () => {
  const calls = []
  const store = createWalkingRouteStore(async (from, destinations) => { calls.push([from, destinations]); return destinations.map(() => ready()) })
  store.request([{ from: a, to: b }, { from: a, to: c }, { from: a, to: b }])
  store.request([{ from: a, to: b }])
  assert.equal(store.lookup(a, b).status, 'pending')
  await tick()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].length, 2)
  store.request([{ from: { ...a, timing: { scheduledEndAt: 'different' } }, to: b }])
  assert.equal(calls.length, 1)
  store.request([{ from: a, to: d }])
  await tick()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1][1], [d])
})

test('late responses only fill their original location key', async () => {
  let release
  const store = createWalkingRouteStore(async () => new Promise((resolve) => { release = resolve }))
  store.request([{ from: a, to: b }])
  const edited = { ...b, location: c.location }
  release([ready(150)])
  await tick()
  assert.equal(store.lookup(a, b).travelSeconds, 150)
  assert.equal(store.lookup(a, edited).status, 'pending')
})

test('only two requests run concurrently and queued work starts after completion', async () => {
  const releases = []
  const store = createWalkingRouteStore(() => new Promise((resolve) => releases.push(resolve)))
  store.request([{ from: a, to: d }, { from: b, to: d }, { from: c, to: d }])
  assert.equal(releases.length, 2)
  releases[0]([ready()])
  await tick()
  assert.equal(releases.length, 3)
  releases[1]([ready()]); releases[2]([ready()])
  await tick()
})

test('a transient failure retries once, then remains unavailable until explicit Retry', async () => {
  let calls = 0
  let fail = true
  const store = createWalkingRouteStore(async () => { calls++; if (fail) throw new Error('Network unavailable'); return [ready()] })
  const pairs = [{ from: a, to: b }]
  store.request(pairs)
  await tick()
  assert.equal(calls, 2)
  assert.equal(store.lookup(a, b).status, 'unavailable')
  store.request(pairs)
  assert.equal(calls, 2)
  fail = false
  store.retryFailures()
  await tick()
  assert.equal(calls, 3)
  assert.equal(store.lookup(a, b).provider, 'google')
})

test('denied access is not automatically retried or replaced with simulation', async () => {
  let calls = 0
  const store = createWalkingRouteStore(async () => { calls++; throw new Error('403 PERMISSION_DENIED') })
  store.request([{ from: a, to: b }])
  await tick()
  assert.equal(calls, 1)
  assert.deepEqual(store.lookup(a, b), { status: 'unavailable', reason: 'routes-access-denied' })
})

test('timeout terminates loading and ignores a later provider response', async () => {
  let release
  const store = createWalkingRouteStore(() => new Promise((resolve) => { release = resolve }), { timeoutMs: 5 })
  store.request([{ from: a, to: b }])
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(store.lookup(a, b).reason, 'routes-timeout')
  release([ready()])
  await tick()
  assert.equal(store.lookup(a, b).reason, 'routes-timeout')
})

test('snapshots are stable until a result changes; reads are pure and missing locations do not fetch', async () => {
  let updates = 0
  let calls = 0
  const store = createWalkingRouteStore(async () => { calls++; return [ready()] })
  const unsubscribe = store.subscribe(() => updates++)
  const old = store.getSnapshot()
  assert.equal(store.getSnapshot(), old)
  assert.equal(store.lookup(a, b).status, 'pending')
  assert.equal(calls, 0)
  store.request([{ from: a, to: { location: null } }])
  assert.equal(calls, 0)
  store.request([{ from: a, to: b }])
  await tick()
  assert.equal(updates, 2)
  assert.equal(old.size, 0)
  assert.equal(store.lookup(a, b, { results: old }).status, 'pending')
  unsubscribe()
})

test('large origin groups split into bounded 25-destination requests', async () => {
  const sizes = []
  const store = createWalkingRouteStore(async (from, destinations) => { sizes.push(destinations.length); return destinations.map(() => ready()) })
  store.request(Array.from({ length: 26 }, (_, index) => ({ from: a, to: stop(String(index), index + 10) })))
  await tick()
  assert.deepEqual(sizes, [25, 1])
})

test('Google is used with an existing key; simulation is explicit and demo-only', () => {
  assert.equal(chooseTravelProvider({ dataMode: 'demo' }, undefined, true), 'google')
  assert.equal(chooseTravelProvider({ dataMode: 'demo' }, 'demo', true), 'demo')
  assert.equal(chooseTravelProvider({ dataMode: 'live' }, 'demo', false), 'google')
  assert.equal(chooseTravelProvider({ dataMode: 'demo' }, undefined, false), 'demo')
  assert.equal(chooseTravelProvider({ dataMode: 'demo' }, 'google', false), 'google')
})

test('public transport requests carry the departure time and are keyed by it; driving is not', async () => {
  const requests = []
  const provider = createRoutesProvider(async () => ({ RouteMatrix: { async computeRouteMatrix(input) {
    requests.push(input)
    return { matrix: { rows: [{ items: [{ condition: 'ROUTE_EXISTS', durationMillis: 600000 }] }] } }
  } } }))
  const departAt = '2026-09-26T03:00:00Z'
  const [transit] = await provider(a, [b], { mode: 'transit', departAt })
  assert.equal(requests[0].travelMode, 'TRANSIT')
  assert.equal(requests[0].departureTime.toISOString(), '2026-09-26T03:00:00.000Z')
  assert.deepEqual({ timeDependent: transit.timeDependent, departAt: transit.departAt, mode: transit.mode },
    { timeDependent: true, departAt: '2026-09-26T03:00:00.000Z', mode: 'transit' })
  const [drive] = await provider(a, [b], { mode: 'drive', departAt })
  assert.equal(requests[1].travelMode, 'DRIVING')
  assert.equal('departureTime' in requests[1], false)
  assert.equal(drive.timeDependent, false)

  assert.notEqual(routePairKey(a, b, { mode: 'transit', departAt }), routePairKey(a, b, { mode: 'transit', departAt: '2026-09-26T03:05:00Z' }))
  assert.equal(routePairKey(a, b, { mode: 'drive', departAt }), routePairKey(a, b, { mode: 'drive', departAt: '2026-09-26T09:00:00Z' }))
  assert.notEqual(routePairKey(a, b, { mode: 'drive' }), routePairKey(a, b))
  assert.equal(routePairKey(a, b, { mode: 'transit' }), null, 'public transport needs a departure')
  assert.equal(routePairKey(a, b, { mode: 'teleport' }), null)
})

test('the store sends one request per origin, mode and departure, and looks results up the same way', async () => {
  const calls = []
  const store = createWalkingRouteStore(async (from, destinations, options) => {
    calls.push({ destinations: destinations.length, ...options })
    return destinations.map(() => ({ ...ready(), mode: options.mode }))
  })
  const departAt = '2026-09-26T03:00:00.000Z'
  store.request([
    { from: a, to: b, mode: 'transit', departAt }, { from: a, to: c, mode: 'transit', departAt },
    { from: a, to: b }, { from: a, to: b, mode: 'drive' },
  ])
  await tick()
  assert.deepEqual(calls.map(({ mode, destinations }) => [mode, destinations]).sort(), [['drive', 1], ['transit', 2], ['walk', 1]])
  assert.equal(store.lookup(a, b, { mode: 'transit', departAt }).mode, 'transit')
  assert.equal(store.lookup(a, b, { mode: 'transit', departAt: '2026-09-26T04:00:00Z' }).status, 'pending')
  assert.equal(store.lookup(a, b).mode, 'walk')
})
