import assert from 'node:assert/strict'
import test from 'node:test'
import { createTransitStore, transitKey } from './transitStore.js'

const a = { lat: -34.92, lng: 138.6 }
const b = { lat: -34.98, lng: 138.51 }
const at = '2026-09-26T04:00:00Z'
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('each journey and departure is requested once and shared', async () => {
  let calls = 0
  const store = createTransitStore(async () => { calls++; return [{ id: 'tram' }] })
  store.request(a, b, at)
  store.request(a, b, at)
  assert.equal(store.lookup(a, b, at).status, 'pending')
  await tick()
  assert.equal(calls, 1)
  assert.deepEqual(store.lookup(a, b, at), { status: 'ready', options: [{ id: 'tram' }] })
  assert.equal(store.lookup(a, b, '2026-09-26T05:00:00Z').status, 'idle', 'another departure is another journey')
})

test('failures are reported, and bad input never requests', async () => {
  let calls = 0
  const store = createTransitStore(async () => { calls++; throw new Error('403') })
  store.request(a, b, at)
  await tick()
  assert.equal(store.lookup(a, b, at).status, 'error')
  store.request(a, null, at)
  store.request(a, b, 'not a time')
  assert.equal(calls, 1)
  assert.equal(transitKey(a, b, null), null)
})

const ride = (name) => ({ kind: 'ride', vehicle: 'Bus', name })
const service = (id, lines, arriveAt) => ({ id, arriveAt, steps: [{ kind: 'walk', minutes: 3 }, ...lines.map(ride)] })

test('a picked service is remembered for the journey, and only if listed', async () => {
  const store = createTransitStore(async () => [service('tram', ['T1'], '2026-09-26T04:20:00Z'), service('bus', ['M44'], '2026-09-26T04:35:00Z')])
  store.choose(a, b, at, 'bus')
  assert.equal(store.lookup(a, b, at).status, 'idle', 'nothing to pick before services arrive')
  store.request(a, b, at)
  await tick()
  store.choose(a, b, at, 'train')
  assert.equal(store.lookup(a, b, at).chosenId, undefined)
  store.choose(a, b, at, 'bus')
  assert.equal(store.lookup(a, b, at).chosenId, 'bus')
  assert.equal(store.lookup(b, a, at).chosenId, undefined, 'the return journey is its own choice')
})
