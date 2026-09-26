import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePlan } from './analyze.js'
import { planFingerprint } from './fingerprint.js'
import { suggestFix } from './proposals.js'

const epoch = Date.parse('2026-09-26T00:00:00Z')
const at = (minutes) => new Date(epoch + minutes * 60000).toISOString()
const stop = (id, start, end, kind = 'flexible', window = [0, 1440]) => ({
  id, status: 'planned', location: { placeId: id },
  timing: { kind, durationMinutes: end - start, scheduledStartAt: at(start), scheduledEndAt: at(end),
    earliestStartAt: at(window[0]), latestEndAt: at(window[1]) },
})
const plan = (stops) => ({ id: 'day', version: 1, date: '2026-09-26', timezone: 'UTC', stops, legs: [] })
const context = (minutes = 10) => ({
  now: epoch, modeFor: () => 'walk', buffers: { walk: 5 },
  travel: () => ({ status: 'ready', travelSeconds: minutes * 60, provider: 'demo' }),
})
const target = (p, ctx) => analyzePlan(p, ctx).conflicts[0].id
const fix = (p, ctx = context()) => suggestFix(p, target(p, ctx), ctx)
const changedPlan = (p, proposal) => ({ ...p, stops: p.stops.map((s) => proposal.changes.find((c) => c.stopId === s.id)?.after ?? s) })

test('slides a flexible stop to resolve travel and buffer shortfall', () => {
  const p = plan([stop('a', 60, 90, 'fixed'), stop('b', 100, 130), stop('c', 180, 210, 'fixed')])
  const { status, proposal } = fix(p)
  assert.equal(status, 'proposal')
  assert.equal(proposal.strategy, 'slide')
  assert.equal(proposal.changes[0].after.timing.scheduledStartAt, at(105))
  assert.equal(proposal.changes[0].after.timing.scheduledEndAt, at(135))
  assert.deepEqual(analyzePlan(changedPlan(p, proposal), context()).conflicts, [])
  assert.equal(proposal.baseFingerprint, planFingerprint(p))
})

test('resolves nested fixed/flexible overlap with a verified relocation', () => {
  const p = plan([stop('a', 60, 120, 'fixed'), stop('b', 75, 105, 'flexible', [60, 180])])
  const result = fix(p)
  assert.equal(result.status, 'proposal')
  assert.equal(result.proposal.changes[0].after.timing.scheduledStartAt, at(135))
  assert.deepEqual(analyzePlan(changedPlan(p, result.proposal), context()).unresolved, [])
})

test('two fixed stops require a user decision', () => {
  const p = plan([stop('a', 60, 120, 'fixed'), stop('b', 90, 150, 'fixed')])
  assert.equal(fix(p).status, 'needsDecision')
})

test('started and user-edited stops cannot be moved', () => {
  const p = plan([stop('a', 60, 120, 'fixed'), stop('b', 90, 150)])
  for (const [extra, reason] of [[{ now: epoch + 100 * 60000 }, 'started'], [{ lockedStopIds: ['b'] }, 'your-edit']]) {
    const result = fix(p, { ...context(), ...extra })
    assert.equal(result.status, 'noFit')
    assert.ok(result.blockers.some((b) => b.stopId === 'b' && b.reason === reason))
  }
  p.stops[1].status = 'completed'
  assert.equal(suggestFix(p, 'overlap:a:b', context()).status, 'noFit')
})

test('a constrained window reports no verified single-stop fix', () => {
  const p = plan([stop('a', 60, 120, 'fixed'), stop('b', 90, 150, 'flexible', [90, 150])])
  const result = fix(p)
  assert.equal(result.status, 'noFit')
  assert.ok(result.blockers.some((b) => b.reason === 'window'))
})

test('uses whole-minute fallback when no five-minute mark fits', () => {
  const p = plan([stop('a', 60, 90, 'fixed'), stop('b', 80, 110, 'flexible', [106, 136])])
  const result = fix(p)
  assert.equal(result.status, 'proposal')
  assert.equal(result.proposal.changes[0].after.timing.scheduledStartAt, at(106))
})

test('unknown routes never become a feasible suggestion', () => {
  const p = plan([stop('a', 60, 120, 'fixed'), stop('b', 90, 150)])
  const result = fix(p, { ...context(), travel: () => undefined })
  assert.equal(result.status, 'noFit')
  assert.ok(result.blockers.some((b) => b.reason === 'travel-unknown'))
})

test('outgoing transit must be verified at the moved departure', () => {
  const p = plan([stop('a', 60, 90, 'fixed'), stop('b', 80, 110, 'flexible', [90, 160]), stop('c', 200, 230, 'fixed')])
  const ctx = { ...context(), modeFor: () => 'transit', buffers: { transit: 5 },
    travel: (from) => ({ status: 'ready', travelSeconds: 600, departAt: from.id === 'a' ? at(90) : at(110) }) }
  assert.equal(fix(p, ctx).status, 'noFit')
  ctx.travel = (from, to, { departAt }) => ({ status: 'ready', travelSeconds: 600, departAt })
  assert.equal(fix(p, ctx).status, 'proposal')
})

test('missing window bounds use the local plan day', () => {
  const p = plan([stop('a', 60, 120, 'fixed'), stop('b', 90, 150)])
  p.date = '2026-09-26'
  p.timezone = 'Australia/Adelaide'
  delete p.stops[1].timing.earliestStartAt
  delete p.stops[1].timing.latestEndAt
  const result = fix(p)
  assert.equal(result.status, 'proposal')
  const after = result.proposal.changes[0].after
  assert.ok(Date.parse(after.timing.scheduledStartAt) >= epoch)
  assert.ok(Date.parse(after.timing.scheduledEndAt) <= Date.parse('2026-09-26T14:30:00Z'))
})

test('rejects malformed durations and windows', () => {
  for (const [field, value, reason] of [['durationMinutes', 15, 'invalid-duration'], ['earliestStartAt', 'bad', 'invalid-window']]) {
    const p = plan([stop('a', 60, 120, 'fixed'), stop('b', 90, 150)])
    p.stops[1].timing[field] = value
    assert.ok(fix(p).blockers.some((b) => b.reason === reason))
  }
})

test('an unchanged unrelated conflict can remain, without being hidden', () => {
  const p = plan([stop('a', 60, 90, 'fixed'), stop('b', 100, 130), stop('c', 180, 210, 'fixed'), stop('d', 215, 245, 'fixed')])
  const result = fix(p)
  assert.equal(result.status, 'proposal')
  assert.equal(result.proposal.remainingConflicts.length, 1)
  assert.equal(result.proposal.remainingConflicts[0].id, 'late:c:d')
})

test('rejects a relocation that exposes a new conflict between the old neighbours', () => {
  const p = plan([stop('a', 60, 90, 'fixed'), stop('b', 80, 110, 'flexible', [150, 240]), stop('c', 120, 150, 'fixed')])
  const ctx = { ...context(), travel: (a, b) => ({ status: 'ready', travelSeconds: a.id === 'a' && b.id === 'c' ? 3600 : 600 }) }
  assert.equal(fix(p, ctx).status, 'noFit')
})

test('proposals are deterministic, pure and preserve protected stop data', () => {
  for (let start = 75; start <= 115; start += 5) {
    const p = plan([stop('a', 60, 120, 'fixed'), stop('b', start, start + 30, 'flexible', [60, 240])])
    const original = structuredClone(p)
    const result = fix(p)
    assert.deepEqual(result, fix(p))
    assert.deepEqual(p, original)
    assert.equal(result.status, 'proposal')
    const candidate = changedPlan(p, result.proposal)
    assert.deepEqual(candidate.stops[0], p.stops[0])
    const timing = candidate.stops[1].timing
    assert.equal(Date.parse(timing.scheduledEndAt) - Date.parse(timing.scheduledStartAt), 30 * 60000)
    assert.ok(Date.parse(timing.scheduledStartAt) >= Date.parse(timing.earliestStartAt))
    assert.ok(Date.parse(timing.scheduledEndAt) <= Date.parse(timing.latestEndAt))
    assert.deepEqual(analyzePlan(candidate, context()).conflicts, [])
    assert.deepEqual(analyzePlan(candidate, context()).unresolved, [])
  }
})
