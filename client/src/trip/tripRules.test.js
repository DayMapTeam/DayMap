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

test('leaving early starts directions straight away, without asking', () => {
  const early = at('2026-09-25T23:40:00Z') // 09:10, the lecture runs until 10:00
  const state = feed({ ...initialTrip, atStopId: 'stop-university' },
    [away(university, 200), away(university, 200), away(university, 200)], { now: early })
  assert.equal(state.phase, 'navigating')
  assert.equal(state.targetId, 'stop-library')
})

test('leaving home (not a stop) starts directions to the next stop', () => {
  const home = offsetPoint(university, 200, 2000)
  let state = feed(initialTrip, [home], { now: LATER })
  assert.deepEqual(state.origin, { lat: home.lat, lng: home.lng }, 'DayMap settles where it first sees you')
  state = feed(state, [offsetPoint(home, 90, 30), offsetPoint(home, 90, 100)], { now: LATER })
  assert.equal(state.phase, 'idle', 'moving about at home is not leaving')
  state = feed(state, [offsetPoint(home, 90, 200), offsetPoint(home, 90, 260), offsetPoint(home, 90, 320)], { now: LATER })
  assert.equal(state.phase, 'navigating')
  assert.equal(state.targetId, 'stop-library', 'the lecture has ended, so the library is next')
  assert.equal(state.origin, null)
})

test('Go at the place you already are records it and starts no trip', () => {
  const byPosition = tripReducer(initialTrip, { type: 'go', stopId: 'stop-library', plan: demoPlan, reading: reading(library) })
  assert.equal(byPosition.phase, 'idle')
  assert.equal(byPosition.atStopId, 'stop-library')

  // Two stops at the same place: from the first, Go to the second changes nothing on the map.
  const plan = structuredClone(demoPlan)
  plan.stops.find((s) => s.id === 'stop-library').location = { ...university }
  const sameSpot = tripReducer({ ...initialTrip, atStopId: 'stop-university' }, { type: 'go', stopId: 'stop-library', plan, reading: null })
  assert.equal(sameSpot.phase, 'idle')
  assert.equal(sameSpot.atStopId, 'stop-library')

  const elsewhere = tripReducer(initialTrip, { type: 'go', stopId: 'stop-library', plan: demoPlan, reading: reading(university) })
  assert.equal(elsewhere.phase, 'navigating')
})

test('Go heads to an event just added into a gap', () => {
  const plan = structuredClone(demoPlan)
  const lecture = plan.stops[0]
  plan.stops.splice(1, 0, { ...structuredClone(lecture), id: 'stop-coffee', title: 'Coffee', timing: {
    ...lecture.timing, kind: 'flexible', fixedStartAt: null, fixedEndAt: null,
    scheduledStartAt: '2026-09-26T00:35:00Z', scheduledEndAt: '2026-09-26T00:55:00Z',
  }, location: { label: 'Cafe', placeId: null, lat: -34.9215, lng: 138.604 } })
  assert.equal(nextStopFor(plan, { atStopId: 'stop-university', now: LATER - 30 * 60000 }).id, 'stop-coffee')
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

test('a morning end to end: leave home, arrive, leave, automatic directions, arrive', () => {
  // Straight-line steps of about 15 m, like readings a few seconds apart on a walk.
  const walk = (state, from, to, now) => {
    const seen = [state]
    const steps = Math.ceil(distanceMeters(from, to) / 15)
    for (let step = 1; step <= steps; step++) {
      const f = step / steps
      seen.push(feed(seen.at(-1), [{ lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f }], { now }))
    }
    seen.push(feed(seen.at(-1), [to, to], { now }))
    return seen
  }
  const home = offsetPoint(university, 160, 1500)
  let run = walk(feed(initialTrip, [home], { now: NOW }), home, university, NOW)
  assert.ok(run.some((s) => s.phase === 'navigating' && s.startedBy === 'auto' && s.targetId === 'stop-university'),
    'leaving home started directions to the lecture')
  let state = run.at(-1)
  assert.equal(state.atStopId, 'stop-university')
  assert.equal(state.notice?.kind, 'arrived')

  run = walk(state, university, library, LATER)
  assert.ok(run.some((s) => s.phase === 'navigating' && s.targetId === 'stop-library'), 'leaving the lecture started directions')
  state = run.at(-1)
  assert.equal(state.phase, 'idle')
  assert.equal(state.atStopId, 'stop-library')
})
