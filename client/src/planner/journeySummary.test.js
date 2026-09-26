import assert from 'node:assert/strict'
import test from 'node:test'
import { journeySummary, pickService } from './journeySummary.js'

const tz = 'Australia/Adelaide'
const leg = (mode, extra = {}) => ({ status: 'ready', provider: 'google', mode, departAt: '2026-09-26T04:00:00.000Z', ...extra })
const service = {
  leaveAt: '2026-09-26T04:05:00.000Z',
  steps: [
    { kind: 'walk', minutes: 3 },
    { kind: 'ride', name: '721', vehicle: 'Bus', color: '#0a84ff', textColor: '#ffffff' },
    { kind: 'ride', name: 'H20', vehicle: 'Bus', color: null, textColor: null },
    { kind: 'walk', minutes: 4 },
  ],
}

test('walking and driving show one icon and when to leave', () => {
  const walk = journeySummary(leg('walk'), null, tz)
  assert.deepEqual(walk.steps, [{ kind: 'walk' }])
  assert.equal(walk.leave, 'Leave 1:30pm')
  assert.equal(walk.label, 'Walk. Leave 1:30pm')
  assert.equal(journeySummary(leg('drive'), null, tz).label, 'Drive. Leave 1:30pm')
})

test('public transport shows walk, each ride and walk, leaving in time to reach the stop', () => {
  const summary = journeySummary(leg('transit'), service, tz)
  assert.deepEqual(summary.steps.map((step) => step.kind), ['walk', 'ride', 'ride', 'walk'])
  assert.equal(summary.steps[1].name, '721')
  assert.equal(summary.leave, 'Leave 1:35pm')
  assert.equal(summary.label, 'Walk, bus 721, bus H20, walk. Leave 1:35pm')
})

test('without a known service, transit falls back to its icon and the planned departure', () => {
  const summary = journeySummary(leg('transit'), null, tz)
  assert.deepEqual(summary.steps, [{ kind: 'transit' }])
  assert.equal(summary.leave, 'Leave 1:30pm')
})

test('no summary without a verified estimate or for the same place', () => {
  assert.equal(journeySummary({ status: 'stale' }, null, tz), null)
  assert.equal(journeySummary(undefined, null, tz), null)
  assert.equal(journeySummary(leg('walk', { provider: 'same-place' }), null, tz), null)
})

test('the summary prefers fewer changes unless that arrives over 10 minutes later', () => {
  const at = (arriveAt, count) => ({ arriveAt, steps: Array.from({ length: count }, () => ({ kind: 'ride' })) })
  const threeRides = at('2026-09-26T04:38:00Z', 3)
  const tram = at('2026-09-26T04:45:00Z', 1)
  const slowBus = at('2026-09-26T04:51:00Z', 1)
  assert.equal(pickService({ status: 'ready', options: [threeRides, tram] }), tram)
  assert.equal(pickService({ status: 'ready', options: [threeRides, slowBus] }), threeRides)
  assert.equal(pickService({ status: 'pending', options: [] }), null)
  assert.equal(pickService({ status: 'ready', options: [] }), null)
})
