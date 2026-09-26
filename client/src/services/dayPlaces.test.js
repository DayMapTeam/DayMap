import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { dayBookends } from './dayPlaces.js'

const home = { label: 'Home', placeId: null, lat: -34.935, lng: 138.61 }
const ctx = (status = 'ready') => ({
  modeFor: () => 'walk', buffers: { walk: 5 },
  travel: () => (status === 'ready' ? { status, travelSeconds: 15 * 60, provider: 'demo' } : { status }),
})

test('the start place leads to the first stop with a leave-by time; the end place follows the last', () => {
  const { start, end } = dayBookends({ ...demoPlan, startPlace: home, endPlace: home }, ctx())
  assert.equal(start.stop.id, 'stop-university')
  // Lecture at 9:00 Adelaide, 15 min walk + 5 min buffer → leave 8:40.
  assert.equal(start.leg.departAt, '2026-09-25T23:10:00.000Z')
  assert.equal(start.leg.mode, 'walk')
  assert.equal(end.stop.id, 'stop-square')
  assert.equal(end.leg.departAt, '2026-09-26T04:00:00.000Z', 'leaving when the last stop ends')
})

test('missing estimates ask for a request, and no places mean no bookends', () => {
  const { start } = dayBookends({ ...demoPlan, startPlace: home }, ctx('pending'))
  assert.equal(start.leg.status, 'stale')
  assert.equal(start.request.mode, 'walk')
  assert.deepEqual(dayBookends(demoPlan, ctx()), { start: null, end: null })
  const empty = dayBookends({ ...demoPlan, stops: [], endPlace: home }, ctx())
  assert.equal(empty.end.leg, null)
})
