import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import {
  RULES, bearingDegrees, compassLabel, directionsUrl, distanceMeters, initialTrip, nextStopFor,
  offsetPoint, tripReducer, walkingSecondsEstimate,
} from './tripRules.js'

const at = (time) => Date.parse(time)
// Demo clock 09:50 Adelaide; the lecture ends 10:00, the library starts 10:30.
const NOW = at('2026-09-26T00:20:00Z')
const LATER = at('2026-09-26T00:50:00Z')
const stop = (id) => demoPlan.stops.find((candidate) => candidate.id === id)
const university = stop('stop-university').location
const library = stop('stop-library').location

function reading(point, accuracy = 10) {
  return { lat: point.lat, lng: point.lng, accuracy }
}

function feed(state, points, { plan = demoPlan, now = NOW, accuracy } = {}) {
  return points.reduce((current, point) => tripReducer(current,
    { type: 'reading', reading: reading(point, accuracy), plan, now }), state)
}

// A point `meters` from `from`, heading away from the library so it never nears the next stop.
const away = (from, meters) => offsetPoint(from, 180, meters)

test('distance and bearing match known values', () => {
  assert.ok(Math.abs(distanceMeters(university, library) - 302) < 10)
  assert.equal(distanceMeters(library, library), 0)
  assert.equal(compassLabel(bearingDegrees(university, library)), 'west')
  const moved = offsetPoint(university, 90, 250)
  assert.ok(Math.abs(distanceMeters(university, moved) - 250) < 0.5)
  assert.equal(compassLabel(bearingDegrees(university, moved)), 'east')
  assert.equal(walkingSecondsEstimate(130), 130)
})

test('next stop: the one after where you are, skipping ended and unlocated stops', () => {
  assert.equal(nextStopFor(demoPlan, { now: NOW }).id, 'stop-university', 'the lecture is still on')
  assert.equal(nextStopFor(demoPlan, { atStopId: 'stop-university', now: NOW }).id, 'stop-library')
  assert.equal(nextStopFor(demoPlan, { now: LATER }).id, 'stop-library')
  assert.equal(nextStopFor(demoPlan, { atStopId: 'stop-square', now: NOW }), null, 'nothing after the last stop')
  const unlocated = structuredClone(demoPlan)
  unlocated.stops.find((s) => s.id === 'stop-library').location = null
  assert.equal(nextStopFor(unlocated, { atStopId: 'stop-university', now: NOW }).id, 'stop-market')
})

test('Go navigates; two readings inside the circle arrive and remember the stop', () => {
  let state = tripReducer(initialTrip, { type: 'go', stopId: 'stop-university' })
  assert.equal(state.phase, 'navigating')
  state = feed(state, [away(university, 400), away(university, 30)])
  assert.equal(state.phase, 'navigating', 'one reading is not enough')
  state = feed(state, [away(university, 20)])
  assert.equal(state.phase, 'idle')
  assert.equal(state.atStopId, 'stop-university')
  assert.deepEqual(state.notice, { kind: 'arrived', stopId: 'stop-university', key: 1 })
})

test('a single jittery reading inside the circle does not arrive', () => {
  let state = tripReducer(initialTrip, { type: 'go', stopId: 'stop-university' })
  state = feed(state, [away(university, 30), away(university, 200), away(university, 30)])
  assert.equal(state.phase, 'navigating')
})

test('readings with very poor accuracy are ignored', () => {
  const state = tripReducer(initialTrip, { type: 'go', stopId: 'stop-university' })
  const after = feed(state, [university, university], { accuracy: RULES.ignoreAccuracyAboveMeters + 1 })
  assert.equal(after, state)
})

test('"I\'m here" arrives without a position', () => {
  const state = tripReducer(tripReducer(initialTrip, { type: 'go', stopId: 'stop-library' }), { type: 'arrive' })
  assert.equal(state.phase, 'idle')
  assert.equal(state.atStopId, 'stop-library')
})

test('leaving a stop starts a trip to the next stop after consecutive readings', () => {
  let state = { ...initialTrip, atStopId: 'stop-university' }
  state = feed(state, [away(university, 200), away(university, 220)], { now: LATER })
  assert.equal(state.phase, 'idle', 'two readings are not enough')
  state = feed(state, [away(university, 240)], { now: LATER })
  assert.equal(state.phase, 'navigating')
  assert.equal(state.targetId, 'stop-library')
  assert.equal(state.startedBy, 'auto')
  assert.equal(state.notice.kind, 'auto-started')
})

test('wandering between the circles or back again never starts a trip', () => {
  let state = { ...initialTrip, atStopId: 'stop-university' }
  state = feed(state, [away(university, 200), away(university, 120), away(university, 200), away(university, 200)],
    { now: LATER })
  assert.equal(state.phase, 'idle')
})

test('poor accuracy widens the circles so jitter is not departure', () => {
  const state = feed({ ...initialTrip, atStopId: 'stop-university' },
    [away(university, 180), away(university, 190), away(university, 185)], { now: LATER, accuracy: 60 })
  assert.equal(state.phase, 'idle')
})

test('cancelling an automatic start waits until you return and leave again', () => {
  let state = feed({ ...initialTrip, atStopId: 'stop-university' },
    [away(university, 200), away(university, 200), away(university, 200)], { now: LATER })
  state = tripReducer(state, { type: 'end' })
  assert.equal(state.phase, 'idle')
  assert.equal(state.notice, null)
  state = feed(state, [away(university, 250), away(university, 260), away(university, 270)], { now: LATER })
  assert.equal(state.phase, 'idle', 'still suppressed')
  state = feed(state, [university], { now: LATER })
  state = feed(state, [away(university, 200), away(university, 200), away(university, 200)], { now: LATER })
  assert.equal(state.phase, 'navigating')
})

test('ending a trip you started yourself does not suppress automatic starts', () => {
  const state = tripReducer(tripReducer({ ...initialTrip, atStopId: 'stop-university' },
    { type: 'go', stopId: 'stop-market' }), { type: 'end' })
  assert.equal(state.suppressed, false)
})

test('leaving well before the stop ends asks first', () => {
  const early = at('2026-09-25T23:40:00Z') // 09:10, the lecture runs until 10:00
  let state = feed({ ...initialTrip, atStopId: 'stop-university' },
    [away(university, 200), away(university, 200), away(university, 200)], { now: early })
  assert.equal(state.phase, 'idle')
  assert.deepEqual(state.ask, { toStopId: 'stop-library' })
  const accepted = tripReducer(state, { type: 'accept-ask' })
  assert.equal(accepted.phase, 'navigating')
  assert.equal(accepted.targetId, 'stop-library')
  const dismissed = tripReducer(state, { type: 'dismiss-ask' })
  assert.equal(dismissed.ask, null)
  assert.equal(dismissed.suppressed, true)
})

test('arriving at the next stop without a trip still records where you are', () => {
  const state = feed({ ...initialTrip, atStopId: 'stop-university' }, [library, library], { now: LATER })
  assert.equal(state.phase, 'idle')
  assert.equal(state.atStopId, 'stop-library')
  assert.equal(state.notice, null)
})

test('nothing starts after the last stop', () => {
  const square = stop('stop-square').location
  const state = feed({ ...initialTrip, atStopId: 'stop-square' },
    [away(square, 300), away(square, 300), away(square, 300)], { now: LATER })
  assert.equal(state.phase, 'idle')
  assert.equal(state.ask, null)
})

test('sync ends a trip whose destination was removed and forgets a removed stop', () => {
  const plan = { ...demoPlan, stops: demoPlan.stops.filter((s) => !['stop-library', 'stop-university'].includes(s.id)) }
  const navigating = tripReducer({ ...initialTrip, atStopId: 'stop-university' }, { type: 'go', stopId: 'stop-library' })
  const synced = tripReducer(navigating, { type: 'sync', plan })
  assert.equal(synced.phase, 'idle')
  assert.equal(synced.atStopId, null)
  assert.equal(tripReducer(synced, { type: 'sync', plan }), synced)
})

test('trip actions never touch the plan', () => {
  const before = structuredClone(demoPlan)
  let state = tripReducer(initialTrip, { type: 'go', stopId: 'stop-university' })
  state = feed(state, [university, university])
  feed(state, [away(university, 300), away(university, 300), away(university, 300)], { now: LATER })
  assert.deepEqual(demoPlan, before)
})

test('directions link hands off to Google Maps walking directions', () => {
  const url = new URL(directionsUrl({ lat: -34.92, lng: 138.6, placeId: 'places/ChIJ123' }))
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/dir/')
  assert.equal(url.searchParams.get('api'), '1')
  assert.equal(url.searchParams.get('destination'), '-34.92,138.6')
  assert.equal(url.searchParams.get('destination_place_id'), 'ChIJ123')
  assert.equal(url.searchParams.get('travelmode'), 'walking')
})

test('the demo morning end to end: Go, walk, arrive, leave, automatic directions, arrive', async () => {
  const { stepToward, simulatedStart } = await import('./useSimulatedWalk.js')
  const walk = (state, from, to, now) => {
    let position = from
    const seen = [state]
    for (let step = 0; step < 200 && (position.lat !== to.lat || position.lng !== to.lng); step++) {
      position = stepToward(position, to)
      seen.push(feed(seen.at(-1), [position], { now }))
    }
    // The simulator repeats the destination while it dwells there.
    seen.push(feed(seen.at(-1), [to, to], { now }))
    return { states: seen, position }
  }

  let state = tripReducer(initialTrip, { type: 'go', stopId: nextStopFor(demoPlan, { now: NOW }).id })
  let run = walk(state, simulatedStart(university), university, NOW)
  state = run.states.at(-1)
  assert.equal(state.phase, 'idle')
  assert.equal(state.atStopId, 'stop-university')
  assert.ok(run.states.some((s) => s.notice?.kind === 'arrived'))

  const next = nextStopFor(demoPlan, { atStopId: state.atStopId, now: NOW })
  assert.equal(next.id, 'stop-library')
  run = walk(state, run.position, next.location, NOW)
  assert.ok(run.states.some((s) => s.phase === 'navigating' && s.startedBy === 'auto' && s.targetId === 'stop-library'),
    'leaving the lecture started directions by itself')
  state = run.states.at(-1)
  assert.equal(state.phase, 'idle')
  assert.equal(state.atStopId, 'stop-library')
  assert.equal(state.notice?.kind, 'arrived')
})
