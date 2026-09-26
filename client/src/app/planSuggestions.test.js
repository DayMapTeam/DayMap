import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePlan } from '../../../shared/planning/analyze.js'
import { applyProposal, suggestFix } from '../../../shared/planning/proposals.js'
import { createPlanState, planReducer } from './planReducer.js'

const epoch = Date.parse('2026-09-26T00:00:00Z')
const at = (minutes) => new Date(epoch + minutes * 60000).toISOString()
const stop = (id, start, end, kind = 'flexible') => ({
  id, title: id, status: 'planned', location: { placeId: id },
  timing: { kind, durationMinutes: end - start, scheduledStartAt: at(start), scheduledEndAt: at(end),
    earliestStartAt: at(0), latestEndAt: at(1440) },
})
const initial = () => createPlanState({
  id: 'day', version: 1, date: '2026-09-26', timezone: 'UTC',
  stops: [stop('a', 60, 90, 'fixed'), stop('b', 100, 130), stop('c', 180, 210)],
  legs: [{ id: 'leg:a:b', fromStopId: 'a', toStopId: 'b', mode: 'walk', status: 'ready', travelSeconds: 600 }],
})
const context = () => ({ now: epoch, modeFor: () => 'walk', buffers: { walk: 5 },
  travel: () => ({ status: 'ready', travelSeconds: 600, provider: 'demo' }) })
const proposalFor = (state) => {
  const plan = state.draft?.plan ?? state.plan
  const ctx = { ...context(), lockedStopIds: state.draft?.editedStopIds ?? [] }
  const result = suggestFix(plan, analyzePlan(plan, ctx).conflicts[0].id, ctx)
  assert.equal(result.status, 'proposal')
  return result.proposal
}
const apply = (state) => planReducer(state, { type: 'apply-suggestion', proposal: proposalFor(state), ctx: context() })
const edit = (state, id, title) => {
  const s = (state.draft?.plan ?? state.plan).stops.find((s) => s.id === id)
  return planReducer(state, { type: 'edit-stop-draft', stopId: id, edit: {
    title, scheduledStartAt: s.timing.scheduledStartAt, scheduledEndAt: s.timing.scheduledEndAt,
  } })
}

test('apply changes only the draft and revert restores a suggestion-only draft to null', () => {
  const state = initial()
  const snapshot = structuredClone(state)
  const applied = apply(state)
  assert.equal(applied.plan, state.plan)
  assert.equal(applied.draft.plan.stops[1].timing.scheduledStartAt, at(105))
  assert.equal(applied.draft.plan.legs[0].status, 'stale')
  assert.deepEqual(state, snapshot)
  assert.equal(planReducer(applied, { type: 'revert-suggestion' }).draft, null)
  assert.equal(planReducer(state, { type: 'revert-suggestion' }), state)
})

test('revert preserves the pre-existing user edits and their locks', () => {
  const state = edit(initial(), 'c', 'My edited title')
  assert.deepEqual(state.draft.editedStopIds, ['c'])
  const reverted = planReducer(apply(state), { type: 'revert-suggestion' })
  assert.deepEqual(reverted, state)
})

test('apply rejects stale fingerprints, stale base versions and missing current context', () => {
  const state = initial()
  const proposal = proposalFor(state)
  for (const changed of [edit(state, 'c', 'Changed'), { ...state, plan: { ...state.plan, version: 2 } }]) {
    assert.equal(planReducer(changed, { type: 'apply-suggestion', proposal, ctx: context() }), changed)
  }
  assert.equal(planReducer(state, { type: 'apply-suggestion', proposal }), state)
  const drafted = edit(state, 'c', 'Changed')
  const stale = { ...drafted, plan: { ...drafted.plan, version: 2 } }
  assert.equal(planReducer(stale, { type: 'apply-suggestion', proposal: proposalFor(drafted), ctx: context() }), stale)
})

test('reducer enforces user-edit locks even when the caller omits them', () => {
  const state = edit(initial(), 'b', 'User owns this edit')
  const p = state.draft.plan
  const proposal = suggestFix(p, analyzePlan(p, context()).conflicts[0].id, context()).proposal
  assert.ok(proposal)
  assert.equal(planReducer(state, { type: 'apply-suggestion', proposal, ctx: context() }), state)
})

test('only one suggestion can be active; discard preserves the accepted plan', () => {
  const state = initial()
  const applied = apply(state)
  assert.equal(planReducer(applied, { type: 'apply-suggestion', proposal: proposalFor(state), ctx: context() }), applied)
  const discarded = planReducer(applied, { type: 'discard-draft' })
  assert.equal(discarded.plan, state.plan)
  assert.equal(discarded.draft, null)
})

test('accept revalidates and increments version only after explicit acceptance', () => {
  const applied = apply(edit(initial(), 'c', 'Edited'))
  const accepted = planReducer(applied, { type: 'accept-draft', ctx: context() })
  assert.equal(accepted.plan.version, 2)
  assert.equal(accepted.draft, null)
  assert.equal(accepted.plan.stops[1].timing.scheduledStartAt, at(105))
  assert.equal(accepted.plan.stops[2].title, 'Edited')
})

test('accept fails safely after time, travel, buffers, mode or locks change', () => {
  const applied = apply(initial())
  const contexts = [undefined, { ...context(), now: epoch + 101 * 60000 },
    { ...context(), travel: () => undefined },
    { ...context(), travel: () => ({ status: 'ready', travelSeconds: 1800 }) },
    { ...context(), buffers: { walk: 20 } },
    { ...context(), modeFor: () => 'transit' },
    { ...context(), lockedStopIds: ['b'] }]
  for (const ctx of contexts) {
    const rejected = planReducer(applied, { type: 'accept-draft', ctx })
    assert.equal(rejected.plan, applied.plan)
    assert.equal(rejected.draft.suggestionInvalid, true)
    assert.ok(rejected.draft.suggestion)
  }
  const stale = { ...applied, plan: { ...applied.plan, version: 2 } }
  assert.equal(planReducer(stale, { type: 'accept-draft', ctx: context() }).draft.stale, true)
})

test('a later user edit drops the suggestion but preserves earlier user edits', () => {
  const state = edit(initial(), 'c', 'First edit')
  const edited = edit(apply(state), 'c', 'Second edit')
  assert.equal(edited.draft.suggestion, undefined)
  assert.equal(edited.draft.plan.stops[1].timing.scheduledStartAt, at(100))
  assert.equal(edited.draft.plan.stops[2].title, 'Second edit')
  assert.deepEqual(edited.draft.editedStopIds, ['c'])
  const accepted = planReducer(edited, { type: 'accept-draft' })
  assert.equal(accepted.plan.stops[1].timing.scheduledStartAt, at(100))
})

test('deletion invalidates the suggestion and retains unrelated user edits', () => {
  const applied = apply(edit(initial(), 'c', 'Keep this'))
  const removed = planReducer(applied, { type: 'remove-stop', stopId: 'b' })
  assert.equal(removed.plan.version, 2)
  assert.equal(removed.draft.suggestion, undefined)
  assert.equal(removed.draft.plan.stops.find((s) => s.id === 'c').title, 'Keep this')
  assert.ok(!removed.draft.plan.stops.some((s) => s.id === 'b'))
})

test('invalid manual edits do not discard an active suggestion', () => {
  const applied = apply(initial())
  assert.equal(edit(applied, 'c', ''), applied)
  assert.equal(edit(applied, 'a', 'Cannot edit fixed'), applied)
})

test('apply rejects tampering with duration, window, protected fields or stop identity', () => {
  const state = initial()
  const proposal = proposalFor(state)
  const mutations = [
    (p) => { p.changes[0].after.timing.scheduledEndAt = at(150) },
    (p) => { p.changes[0].after.timing.latestEndAt = at(2000) },
    (p) => { p.changes[0].after.title = 'Tampered' },
    (p) => { p.changes[0].after.status = 'completed' },
    (p) => { p.changes[0].after.id = 'a' },
    (p) => { p.changes[0].stopId = 'a' },
    (p) => { p.changes[0].before.title = 'Tampered' },
    (p) => { p.changes.push(p.changes[0]) },
    (p) => { p.changes = [null] },
  ]
  for (const mutate of mutations) {
    const bad = structuredClone(proposal)
    mutate(bad)
    assert.equal(applyProposal(state.plan, bad, context()), null)
  }
})

test('apply ignores supplied derived legs and rejects a newly unsafe proposed departure', () => {
  const state = initial()
  const proposal = proposalFor(state)
  proposal.legs = [{ provider: 'forged', travelSeconds: 0 }]
  const result = applyProposal(state.plan, proposal, context())
  assert.equal(result.legs[0].id, 'leg:a:b')
  const ctx = { ...context(), travel: (from, to, { departAt }) => ({
    status: 'ready', travelSeconds: from.id === 'b' && departAt === at(135) ? 3600 : 600,
  }) }
  assert.equal(applyProposal(state.plan, proposal, ctx), null)
})
