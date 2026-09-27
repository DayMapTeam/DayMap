import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRouteLegs, legLabel, legStates, routeRequest } from './routeLegs.js'

const at = (time) => Date.parse(`2026-09-26T${time}:00Z`)
const timed = (id, depart, arrive) => ({ id, departMs: at(depart), arriveMs: at(arrive) })

test('the journey under way is current, the one after it next, and those travelled done', () => {
  const legs = [timed('a', '00:00', '00:10'), timed('b', '01:00', '01:20'), timed('c', '02:00', '02:10'), timed('d', '03:00', '03:10')]
  assert.deepEqual([...legStates(legs, at('01:05'))], [['a', 'done'], ['b', 'current'], ['c', 'next'], ['d', 'later']])
})

test('between journeys, the next one to leave is current', () => {
  const legs = [timed('a', '00:00', '00:10'), timed('b', '01:00', '01:20'), timed('c', '02:00', '02:10')]
  assert.deepEqual([...legStates(legs, at('00:30'))], [['a', 'done'], ['b', 'current'], ['c', 'next']])
})

test('after the last journey everything is done', () => {
  const legs = [timed('a', '00:00', '00:10'), timed('b', '01:00', '01:20')]
  assert.deepEqual([...legStates(legs, at('05:00'))], [['a', 'done'], ['b', 'done']])
})

test('chip text is the way of travelling and the time, rounded up to a minute', () => {
  assert.equal(legLabel('walk', 590), 'Walk · 10 min')
  assert.equal(legLabel('drive', 20), 'Drive · 1 min')
  assert.equal(legLabel('transit', 22 * 60, 'Bus'), 'Bus · 22 min')
  assert.equal(legLabel('transit', 75 * 60), 'Transit · 1 hr 15 min')
})

test('an unknown time is left out of the chip, never shown as zero', () => {
  assert.equal(legLabel('walk', null), 'Walk')
})

const stop = (id, location, start, end) => ({
  id, location, timing: { kind: 'fixed', scheduledStartAt: `2026-09-26T${start}:00Z`, scheduledEndAt: `2026-09-26T${end}:00Z` },
})
const stops = [
  stop('home', { lat: -34.92, lng: 138.6 }, '00:00', '00:30'),
  stop('library', { lat: -34.9204, lng: 138.6029 }, '01:00', '02:00'),
  stop('market', { lat: -34.9297, lng: 138.5981 }, '02:30', '03:00'),
  stop('nowhere', null, '04:00', '05:00'),
]
const leg = (from, to, depart, extra = {}) => ({
  id: `leg:${from}:${to}`, fromStopId: from, toStopId: to, mode: 'walk',
  departAt: `2026-09-26T${depart}:00Z`, arriveAt: null, status: 'unavailable', travelSeconds: null, ...extra,
})

test('a journey without a pinned end or a way of travelling is not requested', () => {
  assert.equal(routeRequest(leg('market', 'nowhere', '03:00'), stops), null)
  assert.equal(routeRequest(leg('home', 'library', '00:30', { mode: null }), stops), null)
  assert.equal(routeRequest(leg('home', 'library', '00:30', { provider: 'same-place' }), stops), null)
  assert.equal(routeRequest(leg('home', 'library', '00:30'), stops).to.id, 'library')
})

test('only journeys whose route arrived are drawn, never as a straight line', () => {
  const legs = [
    leg('home', 'library', '00:30', { status: 'ready', travelSeconds: 600, arriveAt: '2026-09-26T00:40:00Z' }),
    leg('library', 'market', '02:00', { mode: 'transit' }),
  ]
  const path = [{ lat: -34.92, lng: 138.6 }, { lat: -34.9204, lng: 138.6029 }]
  const lookup = (request) => (request.to.id === 'library'
    ? { status: 'ready', path, distanceMeters: 800, seconds: 700, vehicle: null }
    : { status: 'pending' })
  const drawn = buildRouteLegs(legs, stops, at('00:35'), lookup)
  assert.deepEqual(drawn, [{
    id: 'leg:home:library', mode: 'walk', state: 'current', path, distanceMeters: 800, label: 'Walk · 10 min',
  }])
})

test('a journey already under way takes its time from the route', () => {
  const legs = [leg('library', 'market', '02:00', { mode: 'transit' })]
  const lookup = () => ({ status: 'ready', path: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }], distanceMeters: 1100, seconds: 1320, vehicle: 'Bus' })
  const [drawn] = buildRouteLegs(legs, stops, at('02:10'), lookup)
  assert.equal(drawn.state, 'current')
  assert.equal(drawn.label, 'Bus · 22 min')
})
