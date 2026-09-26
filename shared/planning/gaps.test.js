import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePlan } from './analyze.js'
import { applyProposal, gapRoutePairs, suggestFitsForGap } from './proposals.js'
import { createPlanState, planReducer } from '../../client/src/app/planReducer.js'

const epoch = Date.parse('2026-09-26T00:00:00Z')
const at = (m) => new Date(epoch + m * 60000).toISOString()
const stop = (id, start, end, kind = 'fixed') => ({
  id, title: id, status: 'planned', location: { placeId: id },
  timing: { kind, durationMinutes: end - start, scheduledStartAt: at(start), scheduledEndAt: at(end),
    earliestStartAt: at(0), latestEndAt: at(1440) },
})
const plan = () => ({ id: 'gap-day', version: 1, date: '2026-09-26', timezone: 'UTC', legs: [],
  stops: [stop('a', 60, 90), stop('b', 210, 240), stop('coffee', 300, 330, 'flexible'), stop('d', 400, 430)] })
const context = () => ({ now: epoch, modeFor: () => 'walk', buffers: { walk: 5 },
  travel: () => ({ status: 'ready', provider: 'test', travelSeconds: 600 }) })
const gapId = 'free:a:b'
const fits = (p = plan(), ctx = context()) => suggestFitsForGap(p, gapId, ctx)

test('gap move accounts for both journeys and buffers, and is deterministic and immutable', () => {
  const p = plan()
  const snapshot = structuredClone(p)
  const result = fits(p)
  assert.deepEqual(fits(p), result)
  assert.deepEqual(p, snapshot)
  const [proposal] = result.proposals
  assert.equal(proposal.changes[0].after.timing.scheduledStartAt, at(105))
  assert.equal(proposal.changes[0].after.timing.scheduledEndAt, at(135))
  assert.equal(proposal.remainingMinutes, 60)
  const moved = applyProposal(p, proposal, context())
  assert.ok(moved)
  const analysis = analyzePlan(moved, context())
  assert.deepEqual(analysis.conflicts, [])
  assert.deepEqual(analysis.unresolved, [])
  for (const s of p.stops.filter((s) => s.id !== 'coffee')) assert.deepEqual(moved.stops.find((n) => n.id === s.id), s)
})

test('fixed, completed, started, locked and unscheduled activities are not offered', () => {
  for (const change of [
    (s) => { s.timing.kind = 'fixed' }, (s) => { s.status = 'completed' },
    (s) => { s.status = 'skipped' }, (s) => { s.timing.scheduledStartAt = null; s.timing.scheduledEndAt = null },
  ]) {
    const p = plan()
    change(p.stops[2])
    assert.equal(fits(p).proposals.length, 0)
  }
  assert.equal(fits(plan(), { ...context(), lockedStopIds: ['coffee'] }).proposals.length, 0)
  assert.equal(fits(plan(), { ...context(), now: Date.parse(at(310)) }).proposals.length, 0)
})

test('whole duration must fit the window; an exact fit is allowed with zero remaining minutes', () => {
  const p = plan()
  p.stops[2].timing.earliestStartAt = at(200)
  assert.equal(fits(p).proposals.length, 0)
  p.stops[2].timing.earliestStartAt = at(0)
  p.stops[2].timing.durationMinutes = 90
  p.stops[2].timing.scheduledEndAt = at(390)
  const [proposal] = fits(p).proposals
  assert.ok(proposal)
  assert.equal(proposal.remainingMinutes, 0)
  assert.equal(proposal.changes[0].after.timing.scheduledEndAt, at(195))
})

test('missing incoming, outgoing or old-neighbour travel never produces a verified move', () => {
  for (const pair of ['a:coffee', 'coffee:b', 'b:d']) {
    const ctx = { ...context(), travel: (from, to) => `${from.id}:${to.id}` === pair ? undefined : context().travel() }
    const result = fits(plan(), ctx)
    assert.equal(result.proposals.length, 0)
    assert.equal(result.reason, 'travel-unknown')
  }
})

test('moving an activity cannot expose a travel conflict in its old gap', () => {
  const ctx = { ...context(), travel: (a, b) => ({ status: 'ready', travelSeconds: a.id === 'b' && b.id === 'd' ? 200 * 60 : 600 }) }
  assert.equal(fits(plan(), ctx).proposals.length, 0)
})

test('gap requests include new journeys and the old-neighbour link only for eligible candidates', () => {
  const pairs = gapRoutePairs(plan(), gapId, context()).map(({ from, to }) => `${from.id}:${to.id}`)
  assert.deepEqual(pairs, ['a:coffee', 'coffee:b', 'b:d'])
  assert.deepEqual(gapRoutePairs(plan(), gapId, { ...context(), lockedStopIds: ['coffee'] }), [])
  assert.deepEqual(gapRoutePairs(plan(), 'stale-gap', context()), [])
})

test('a comfortable fit ranks above a slightly shorter walk that leaves no breathing room', () => {
  const p = plan()
  p.stops[2].timing.durationMinutes = 90
  p.stops[2].timing.scheduledEndAt = at(390)
  p.stops.push(stop('short', 480, 500, 'flexible'))
  const ctx = { ...context(), travel: (a, b) => ({ status: 'ready', travelSeconds: a.id === 'short' || b.id === 'short' ? 660 : 600 }) }
  const result = fits(p, ctx)
  assert.equal(result.proposals[0].changes[0].stopId, 'short')
  assert.ok(result.proposals[0].remainingMinutes >= 10)
})

test('preview, cancel and confirm keep manual edits and never save before acceptance', () => {
  let state = createPlanState(plan())
  // Use a flexible boundary to exercise existing manual edits without moving it.
  state.plan.stops[1].timing.kind = 'flexible'
  const s = state.plan.stops[1]
  state = planReducer(state, { type: 'edit-stop-draft', stopId: 'b', edit: {
    title: 'My appointment', scheduledStartAt: s.timing.scheduledStartAt, scheduledEndAt: s.timing.scheduledEndAt,
  } })
  const ctx = { ...context(), lockedStopIds: state.draft.editedStopIds }
  const proposal = fits(state.draft.plan, ctx).proposals[0]
  const preview = planReducer(state, { type: 'apply-suggestion', proposal, ctx })
  assert.equal(preview.plan, state.plan)
  assert.ok(preview.draft.suggestion)
  assert.deepEqual(planReducer(preview, { type: 'revert-suggestion' }), state)
  const saved = planReducer(preview, { type: 'accept-draft', ctx })
  assert.equal(saved.draft, null)
  assert.equal(saved.plan.version, 2)
  assert.equal(saved.plan.stops[1].title, 'My appointment')
  assert.equal(saved.plan.stops[2].timing.scheduledStartAt, at(105))
})

test('stale, tampered or no-longer-feasible gap proposals fail application and acceptance', () => {
  const p = plan()
  const proposal = fits(p).proposals[0]
  assert.equal(applyProposal({ ...p, version: 2 }, proposal, context()), null)
  for (const mutate of [
    (x) => { x.freeTimeId = 'missing' },
    (x) => { x.changes[0].after.timing.scheduledStartAt = at(250); x.changes[0].after.timing.scheduledEndAt = at(280) },
    (x) => { x.changes[0].after.timing.scheduledEndAt = at(130) },
    (x) => { x.changes[0].after.title = 'Tampered' },
  ]) {
    const bad = structuredClone(proposal)
    mutate(bad)
    assert.equal(applyProposal(p, bad, context()), null)
  }
  const preview = planReducer(createPlanState(p), { type: 'apply-suggestion', proposal, ctx: context() })
  for (const ctx of [
    { ...context(), now: Date.parse(at(110)) },
    { ...context(), lockedStopIds: ['coffee'] },
    { ...context(), travel: () => undefined },
    { ...context(), buffers: { walk: 90 } },
  ]) {
    const result = planReducer(preview, { type: 'accept-draft', ctx })
    assert.equal(result.plan, preview.plan)
    assert.equal(result.draft.suggestionInvalid, true)
  }
})
