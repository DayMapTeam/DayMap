import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { initialTrip, tripReducer } from './tripRules.js'
import { dayRunIssue, dayRunStops, nextDayLeg, pointAlongRoute, walkPairs, walkStartTime } from './walkthrough.js'

test('walkthrough pairs follow the current plan and omit unchanged locations', () => {
  const pairs = walkPairs(demoPlan)
  assert.deepEqual(pairs.map(({ from, to }) => [from.id, to.id]), [
    ['stop-university', 'stop-library'],
    ['stop-library', 'stop-market'],
    ['stop-market', 'stop-square'],
  ])
  assert.equal(walkPairs({ ...demoPlan, stops: [demoPlan.stops[0]] }).length, 0)
})

test('walkthrough follows route bends and uses the event time', () => {
  const route = { seconds: 120, steps: [{ path: [
    { lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.001 },
  ] }] }
  assert.deepEqual(pointAlongRoute(route, 0), { lat: 0, lng: 0 })
  const middle = pointAlongRoute(route, 0.5)
  assert.ok(Math.abs(middle.lat) < 0.00001)
  assert.ok(Math.abs(middle.lng - 0.001) < 0.00001)
  assert.deepEqual(pointAlongRoute(route, 1), { lat: 0.001, lng: 0.001 })
  assert.equal(walkStartTime(walkPairs(demoPlan)[0], route), Date.parse(demoPlan.stops[0].timing.scheduledEndAt))
})

test('simulated endpoint readings complete the existing trip without changing the plan', () => {
  const pair = walkPairs(demoPlan)[0]
  const start = { ...pair.from.location, accuracy: 5, simulated: true }
  const finish = { ...pair.to.location, accuracy: 5, simulated: true }
  const snapshot = JSON.stringify(demoPlan)
  let state = tripReducer(initialTrip, { type: 'reading', reading: start, plan: demoPlan, now: new Date(0) })
  state = tripReducer(state, { type: 'go', stopId: pair.to.id, plan: demoPlan, reading: start })
  state = tripReducer(state, { type: 'reading', reading: finish, plan: demoPlan, now: new Date(0) })
  assert.equal(state.phase, 'navigating')
  state = tripReducer(state, { type: 'reading', reading: finish, plan: demoPlan, now: new Date(0) })
  assert.equal(state.phase, 'idle')
  assert.equal(state.atStopId, pair.to.id)
  assert.equal(tripReducer(state, { type: 'reset' }), initialTrip)
  assert.equal(JSON.stringify(demoPlan), snapshot)
})

test('full-day run starts at the explicit day start, visits all events, and can end at home', () => {
  const home = { label: 'Home', lat: -34.914, lng: 138.6, placeId: null }
  const plan = { ...demoPlan, startPlace: home, endPlace: home }
  assert.equal(dayRunIssue(plan), null)
  const stops = dayRunStops(plan)
  assert.deepEqual(stops.map(({ id }) => id), [
    'day-start', 'stop-university', 'stop-library', 'stop-market', 'stop-square', 'day-end',
  ])
  const first = nextDayLeg(plan, stops[0], [stops[0].id])
  assert.equal(first.to.id, 'stop-university')
  assert.equal(nextDayLeg(plan, stops.at(-2), stops.slice(0, -1).map(({ id }) => id)).to.id, 'day-end')
})

test('a grocery event inserted mid-run becomes the next destination', () => {
  const home = { label: 'Home', lat: -34.914, lng: 138.6, placeId: null }
  const grocery = structuredClone(demoPlan.stops[1])
  grocery.id = 'grocery'
  grocery.title = 'Buy groceries'
  grocery.location = { label: 'Grocery store', lat: -34.924, lng: 138.601, placeId: null }
  grocery.timing.scheduledStartAt = '2026-09-26T02:10:00Z'
  grocery.timing.scheduledEndAt = '2026-09-26T02:25:00Z'
  const plan = { ...demoPlan, startPlace: home, stops: [...demoPlan.stops.slice(0, 2), grocery, ...demoPlan.stops.slice(2)] }
  const from = dayRunStops(plan).find(({ id }) => id === 'stop-library')
  const next = nextDayLeg(plan, from, ['day-start', 'stop-university', 'stop-library'])
  assert.equal(next.to.id, 'grocery')
  assert.equal(nextDayLeg(plan, next.to, [...next.completedIds, 'grocery']).to.id, 'stop-market')
})

test('full-day run requires a real start place and located timed events', () => {
  assert.match(dayRunIssue(demoPlan), /Day start/)
  const plan = { ...demoPlan, startPlace: { label: 'Home', lat: -34.914, lng: 138.6 },
    stops: [{ ...demoPlan.stops[0], location: null }] }
  assert.match(dayRunIssue(plan), /Morning lecture/)
})
