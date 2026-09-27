import assert from 'node:assert/strict'
import test from 'node:test'
import { buildJourneyLegs, legLabel, legStates } from './journeyLegs.js'

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

test('a journey without a pinned end, a way of travelling or any distance is not drawn', () => {
  const legs = [
    leg('market', 'nowhere', '03:00'),
    leg('home', 'library', '00:30', { mode: null }),
    leg('home', 'library', '00:30', { provider: 'same-place' }),
    leg('home', 'home', '00:30'),
  ]
  assert.deepEqual(buildJourneyLegs(legs, stops, at('00:00')), [])
})

test('each journey is a direct line between its two stops, labelled with the planner estimate', () => {
  const legs = [
    leg('home', 'library', '00:30', { status: 'ready', travelSeconds: 600, arriveAt: '2026-09-26T00:40:00Z' }),
    leg('library', 'market', '02:00', { mode: 'transit' }),
  ]
  const [walk, ride] = buildJourneyLegs(legs, stops, at('00:35'))
  assert.deepEqual(walk, {
    id: 'leg:home:library', state: 'current',
    path: [{ lat: -34.92, lng: 138.6 }, { lat: -34.9204, lng: 138.6029 }], label: 'Walk · 10 min',
  })
  assert.equal(ride.state, 'next')
  assert.equal(ride.label, 'Transit', 'no estimate yet: no time, never zero')
})
