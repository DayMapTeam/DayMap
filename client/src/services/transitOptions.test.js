import assert from 'node:assert/strict'
import test from 'node:test'
import { createTransitOptionsProvider, normalizeTransitRoutes } from './transitOptions.js'

const walk = (seconds) => ({ travelMode: 'WALKING', staticDurationMillis: seconds * 1000 })
const ride = (shortName, departure, arrival, extra = {}) => ({
  travelMode: 'TRANSIT', staticDurationMillis: (Date.parse(arrival) - Date.parse(departure)),
  transitDetails: {
    headsign: 'Glenelg', stopCount: 21, departureTime: new Date(departure), arrivalTime: new Date(arrival),
    departureStop: { name: 'Stop 1 King William St' }, arrivalStop: { name: 'Jetty Rd' },
    transitLine: { name: 'Glenelg to Royal Adelaide Hospital', shortName, color: '#db0032', textColor: '#ffffff', vehicle: { name: 'Tram' } },
    ...extra,
  },
})
const route = (minutes, steps) => ({ durationMillis: BigInt(minutes * 60000), legs: [{ steps }] })

test('rides keep line, stops and times; consecutive walking merges into minutes', () => {
  const [option] = normalizeTransitRoutes([route(51, [walk(68), walk(187), walk(432),
    ride('GLNELG', '2026-09-26T22:36:26Z', '2026-09-26T23:12:00Z'), walk(96)])])
  assert.equal(option.minutes, 51)
  assert.equal(option.walkMinutes, 12 + 2)
  assert.equal(option.leaveAt, '2026-09-26T22:24:26.000Z', 'leave in time to walk to the stop')
  assert.equal(option.arriveAt, '2026-09-26T23:12:00.000Z')
  assert.deepEqual(option.steps.map((step) => step.kind), ['walk', 'ride', 'walk'])
  const tram = option.steps[1]
  assert.deepEqual({ vehicle: tram.vehicle, name: tram.name, color: tram.color, fromStop: tram.fromStop, stopCount: tram.stopCount },
    { vehicle: 'Tram', name: 'GLNELG', color: '#db0032', fromStop: 'Stop 1 King William St', stopCount: 21 })
})

test('duplicates and walking-only routes are dropped, earliest arrival first, unsafe colours removed', () => {
  const tram = route(51, [walk(600), ride('GLNELG', '2026-09-26T22:36:00Z', '2026-09-26T23:12:00Z')])
  const bus = route(47, [walk(500), ride('H20', '2026-09-26T22:45:00Z', '2026-09-26T23:18:00Z',
    { transitLine: { shortName: 'H20', color: 'red;background:url(x)', vehicle: { name: 'Bus' } } })])
  const options = normalizeTransitRoutes([bus, tram, tram, route(160, [walk(9600)])])
  assert.deepEqual(options.map((option) => option.steps.find((s) => s.kind === 'ride').name), ['GLNELG', 'H20'])
  assert.equal(options[1].steps[1].color, null)
  assert.deepEqual(normalizeTransitRoutes(undefined), [])
})

test('the provider asks for transit alternatives at the departure time with plain coordinates', async () => {
  let request
  const provider = createTransitOptionsProvider(async (name) => {
    assert.equal(name, 'routes')
    return { Route: { async computeRoutes(input) { request = input; return { routes: [] } } } }
  })
  await provider({ from: { lat: -34.92, lng: 138.6, placeId: 'x' }, to: { lat: -34.98, lng: 138.51 }, departAt: '2026-09-26T22:30:00Z' })
  assert.equal(request.travelMode, 'TRANSIT')
  assert.equal(request.computeAlternativeRoutes, true)
  assert.deepEqual(request.origin, { lat: -34.92, lng: 138.6 })
  assert.equal(request.departureTime.toISOString(), '2026-09-26T22:30:00.000Z')
})
