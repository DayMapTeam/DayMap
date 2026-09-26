import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRoute } from '../services/navigationRoute.js'
import { NAV_RULES, initialNavigation, navigationMode, navigationReducer, routeProgress } from './navigation.js'
import { distanceMeters, offsetPoint } from './tripRules.js'

// An L-shaped walk: 300 m north, then 200 m east.
const start = { lat: -34.93, lng: 138.6 }
const corner = offsetPoint(start, 0, 300)
const end = offsetPoint(corner, 90, 200)
const route = {
  mode: 'walk',
  path: [start, corner, end],
  steps: [
    { kind: 'walk', instruction: 'Head north on King William St', maneuver: 'DEPART', distanceMeters: 300, seconds: 240, path: [start, corner], ride: null },
    { kind: 'walk', instruction: 'Turn right onto North Tce', maneuver: 'TURN_RIGHT', distanceMeters: 200, seconds: 160, path: [corner, end], ride: null },
  ],
  distanceMeters: 500,
  seconds: 400,
}

test('progress finds the current step, the next turn and what remains', () => {
  const p = routeProgress(route, offsetPoint(start, 0, 100))
  assert.equal(p.stepIndex, 0)
  assert.ok(Math.abs(p.toStepEndMeters - 200) < 2)
  assert.ok(Math.abs(p.remainingMeters - 400) < 2)
  assert.ok(Math.abs(p.remainingSeconds - (240 * 2 / 3 + 160)) < 2)
  assert.ok(p.offRouteMeters < 1)
  assert.ok(Math.abs(distanceMeters(p.ahead, offsetPoint(start, 0, 140))) < 2, 'the camera looks 40 m ahead')

  const after = routeProgress(route, offsetPoint(corner, 90, 50))
  assert.equal(after.stepIndex, 1)
  assert.ok(Math.abs(after.toStepEndMeters - 150) < 2)
  assert.ok(routeProgress(route, offsetPoint(offsetPoint(start, 0, 100), 270, 80)).offRouteMeters > 75)
  assert.equal(routeProgress(route, null), null)
})

test('a trip starts loading a route from where you are, or waits for a position', () => {
  const target = { id: 'lecture', location: end }
  const loading = navigationReducer(initialNavigation, { type: 'target', target, from: start, mode: 'walk', at: 0 })
  assert.equal(loading.status, 'loading')
  assert.deepEqual(loading.request, { from: start, to: end, mode: 'walk' })
  const ready = navigationReducer(loading, { type: 'routed', requestId: loading.requestId, route, at: 1000 })
  assert.equal(ready.status, 'ready')
  assert.equal(navigationReducer(ready, { type: 'routed', requestId: 99, route: null, at: 0 }), ready, 'late answers are ignored')

  const waiting = navigationReducer(initialNavigation, { type: 'target', target, from: null, mode: 'walk', at: 0 })
  assert.equal(waiting.status, 'no-origin')
  const found = navigationReducer(waiting, { type: 'reading', reading: { ...start, accuracy: 10 }, at: 5 })
  assert.equal(found.status, 'loading')
  assert.equal(navigationReducer(ready, { type: 'target', target: null }), initialNavigation)
})

test('three readings off the route recalculate from there, at most every 20 seconds', () => {
  const target = { id: 'lecture', location: end }
  let state = navigationReducer(initialNavigation, { type: 'target', target, from: start, mode: 'walk', at: 0 })
  state = navigationReducer(state, { type: 'routed', requestId: state.requestId, route, at: 0 })
  const off = { ...offsetPoint(offsetPoint(start, 0, 100), 270, 150), accuracy: 10 }
  const id = state.requestId
  state = navigationReducer(state, { type: 'reading', reading: off, at: 5000 })
  state = navigationReducer(state, { type: 'reading', reading: off, at: 6000 })
  state = navigationReducer(state, { type: 'reading', reading: off, at: 7000 })
  assert.equal(state.requestId, id, 'too soon after the last route')
  state = navigationReducer(state, { type: 'reading', reading: off, at: NAV_RULES.rerouteAfterMs + 1 })
  assert.equal(state.requestId, id + 1)
  assert.deepEqual(state.request.from, off)
  assert.equal(state.status, 'ready', 'the old route stays on screen while the new one loads')

  const back = navigationReducer(state, { type: 'reading', reading: { ...offsetPoint(start, 0, 50), accuracy: 10 }, at: 30000 })
  assert.equal(back.offCount, 0)
})

test('the mode from here: chosen, short walk, or the planned journey', () => {
  const near = { id: 'x', location: offsetPoint(start, 0, 800), travelMode: null }
  const far = { id: 'y', location: offsetPoint(start, 0, 6000), travelMode: null }
  assert.equal(navigationMode({ ...far, travelMode: 'drive' }, 'walk', start), 'drive')
  assert.equal(navigationMode(near, 'transit', start), 'walk')
  assert.equal(navigationMode(far, 'walk', start), 'transit', 'a planned walk that is now far goes by public transport')
  assert.equal(navigationMode(far, 'drive', start), 'drive')
})

test('Google routes become steps with instructions, paths and rides', () => {
  const ll = (lat, lng) => ({ lat, lng })
  const normalized = normalizeRoute({
    durationMillis: 1200000n, distanceMeters: 5000, path: [ll(-34.93, 138.6), ll(-34.92, 138.6), ll(-34.98, 138.51)],
    legs: [{ steps: [
      { travelMode: 'WALKING', instructions: 'Head north', maneuver: 'DEPART', distanceMeters: 100, staticDurationMillis: 80000n, path: [ll(-34.93, 138.6), ll(-34.92, 138.6)] },
      { travelMode: 'TRANSIT', instructions: '', distanceMeters: 4900, staticDurationMillis: 1100000n, path: [ll(-34.92, 138.6), ll(-34.98, 138.51)],
        transitDetails: { headsign: 'Glenelg', transitLine: { shortName: 'GLNELG', vehicle: { name: 'Tram' }, color: '#db0032' },
          departureStop: { name: 'Pirie St' }, arrivalStop: { name: 'Jetty Rd' }, departureTime: new Date('2026-09-26T04:00:00Z'), stopCount: 18 } },
      { travelMode: 'WALKING', instructions: 'Arrive', path: [] },
    ] }],
  }, 'transit')
  assert.equal(normalized.seconds, 1200)
  assert.deepEqual(normalized.steps.map((s) => s.kind), ['walk', 'ride'], 'steps without a path are dropped')
  assert.equal(normalized.steps[1].instruction, 'Tram GLNELG towards Glenelg')
  assert.equal(normalized.steps[1].ride.fromStop, 'Pirie St')
})
