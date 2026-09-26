import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTimeline, sortStopsForDisplay } from './timeline.js'
import { demoPlan } from '../fixtures/demoPlan.js'

test('timeline sorts without changing plan order, times or nested data', () => {
  const plan = structuredClone(demoPlan)
  plan.stops.reverse()
  const before = structuredClone(plan)
  const timeline = buildTimeline(plan)
  assert.deepEqual(timeline.map((stop) => stop.id), demoPlan.stops.map((stop) => stop.id))
  assert.deepEqual(plan, before)
  assert.equal(timeline[0], plan.stops[3])
})

test('timeline excludes skipped, all-day, unscheduled and invalid intervals; retains completed', () => {
  const base = demoPlan.stops[0]
  const withTiming = (id, timing) => ({ ...base, id, timing: { ...base.timing, ...timing } })
  const stops = [
    { ...base, id: 'completed', status: 'completed' },
    { ...base, id: 'skipped', status: 'skipped' },
    withTiming('all-day', { kind: 'all-day' }),
    withTiming('unscheduled', { scheduledStartAt: null, scheduledEndAt: null }),
    withTiming('invalid', { scheduledStartAt: 'invalid' }),
    withTiming('zero', { scheduledEndAt: base.timing.scheduledStartAt }),
    withTiming('reversed', { scheduledEndAt: '2026-09-25T23:00:00Z' }),
  ]
  assert.deepEqual(buildTimeline({ stops }).map((stop) => stop.id), ['completed'])
  const displayed = sortStopsForDisplay(stops)
  assert.equal(displayed.length, stops.length)
  assert.equal(displayed[0].id, 'all-day')
  assert.deepEqual(displayed.slice(1, 3).map((stop) => stop.id), ['completed', 'skipped'])
})

test('equal starts sort by end, then preserve input order for ties', () => {
  const base = demoPlan.stops[0]
  const stop = (id, end) => ({ ...base, id, timing: { ...base.timing, scheduledEndAt: end } })
  const stops = [stop('long', '2026-09-26T01:00:00Z'), stop('b', '2026-09-26T00:00:00Z'), stop('a', '2026-09-26T00:00:00Z')]
  assert.deepEqual(buildTimeline({ stops }).map((item) => item.id), ['b', 'a', 'long'])
})
