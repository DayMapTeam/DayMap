import assert from 'node:assert/strict'
import test from 'node:test'
import { createLegRouteStore } from './legRouteStore.js'

const from = { id: 'a', location: { lat: -34.92, lng: 138.6 } }
const to = { id: 'b', location: { lat: -34.93, lng: 138.59 } }
const route = {
  path: [from.location, to.location], distanceMeters: 1200, seconds: 900,
  steps: [{ kind: 'walk' }, { kind: 'ride', ride: { vehicle: 'Bus' } }],
}

test('each journey and departure is requested once and keeps only what the map draws', async () => {
  const calls = []
  const store = createLegRouteStore(async (request) => { calls.push(request); return route })
  const request = { from, to, mode: 'transit', departAt: '2026-09-26T01:00:00Z' }
  store.request(request)
  store.request(request)
  assert.equal(store.lookup(request).status, 'pending')
  await new Promise((resolve) => setTimeout(resolve))
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { from: from.location, to: to.location, mode: 'transit', departAt: '2026-09-26T01:00:00Z' })
  assert.deepEqual({ ...store.lookup(request) }, { status: 'ready', path: route.path, distanceMeters: 1200, seconds: 900, vehicle: 'Bus' })
  // Another departure is another journey.
  assert.equal(store.lookup({ ...request, departAt: '2026-09-26T02:00:00Z' }).status, 'idle')
})

test('a failed route is remembered as an error, not drawn', async () => {
  const store = createLegRouteStore(async () => { throw new Error('No route found') })
  const request = { from, to, mode: 'walk', departAt: null }
  store.request(request)
  await new Promise((resolve) => setTimeout(resolve))
  assert.equal(store.lookup(request).status, 'error')
})
