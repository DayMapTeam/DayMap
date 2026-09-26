import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../fixtures/demoPlan.js'
import { planFingerprint } from './fingerprint.js'

function fixture() {
  const plan = structuredClone(demoPlan)
  plan.legs = [{
    id: 'leg-1', fromStopId: plan.stops[0].id, toStopId: plan.stops[1].id,
    mode: 'walk', modeSource: 'you', status: 'ready',
    travelSeconds: 300, provider: 'demo',
  }]
  return plan
}

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]))
  }
  return value
}

test('fingerprint is deterministic across JSON round trips and nested object-key order', () => {
  const plan = fixture()
  const expected = planFingerprint(plan)
  assert.equal(planFingerprint(plan), expected)
  assert.equal(planFingerprint(JSON.parse(JSON.stringify(plan))), expected)
  assert.equal(planFingerprint(reverseKeys(plan)), expected)
})

test('fingerprinting does not change the input plan or its nested fields', () => {
  const plan = fixture()
  const before = structuredClone(plan)
  planFingerprint(plan)
  assert.deepEqual(plan, before)
})

const changes = {
  'plan identity': (p) => { p.id = 'another-plan' },
  'plan version': (p) => { p.version++ },
  'plan date': (p) => { p.date = '2026-09-27' },
  timezone: (p) => { p.timezone = 'Australia/Perth' },
  'stop identity': (p) => { p.stops[1].id = 'replacement-stop' },
  'stop status': (p) => { p.stops[1].status = 'completed' },
  'fixed/flexible kind': (p) => { p.stops[1].timing.kind = 'fixed' },
  duration: (p) => { p.stops[1].timing.durationMinutes = 45 },
  'scheduled start': (p) => { p.stops[1].timing.scheduledStartAt = '2026-09-26T01:15:00Z' },
  'scheduled end': (p) => { p.stops[1].timing.scheduledEndAt = '2026-09-26T02:15:00Z' },
  'fixed commitment time': (p) => { p.stops[0].timing.fixedEndAt = '2026-09-26T01:00:00Z' },
  'window start': (p) => { p.stops[1].timing.earliestStartAt = '2026-09-26T01:00:00Z' },
  'window end': (p) => { p.stops[1].timing.latestEndAt = '2026-09-26T03:00:00Z' },
  coordinates: (p) => { p.stops[1].location.lat += 0.01 },
  'place identity': (p) => { p.stops[1].location.placeId = 'confirmed-place' },
  'missing location': (p) => { p.stops[1].location = null },
  'added stop': (p) => { p.stops.push({ ...structuredClone(p.stops[1]), id: 'new-stop' }) },
  'removed stop': (p) => { p.stops.pop() },
  'stop order': (p) => { p.stops.reverse() },
  'leg mode': (p) => { p.legs[0].mode = 'transit' },
  'mode ownership': (p) => { p.legs[0].modeSource = 'preset' },
  'journey origin': (p) => { p.legs[0].fromStopId = p.stops[2].id },
  'journey destination': (p) => { p.legs[0].toStopId = p.stops[3].id },
}

for (const [name, change] of Object.entries(changes)) {
  test(`changing ${name} invalidates a proposal's plan fingerprint`, () => {
    const plan = fixture()
    const original = planFingerprint(plan)
    change(plan)
    assert.notEqual(planFingerprint(plan), original)
  })
}

test('derived journey data is excluded and must be revalidated separately', () => {
  const plan = fixture()
  const original = planFingerprint(plan)
  Object.assign(plan.legs[0], {
    travelSeconds: 1800, status: 'stale', provider: 'google',
    fetchedAt: '2026-09-26T00:00:00Z', arriveAt: '2026-09-26T01:00:00Z',
  })
  plan.conflicts = [{ id: 'derived-conflict' }]
  assert.equal(planFingerprint(plan), original)
})

test('missing and empty legs both represent no mode choices', () => {
  const plan = fixture()
  plan.legs = []
  const empty = planFingerprint(plan)
  delete plan.legs
  assert.equal(planFingerprint(plan), empty)
})
