import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { analyzePlan } from '../../../shared/planning/analyze.js'
import { suggestFix } from '../../../shared/planning/proposals.js'
import { createPlanState, planReducer } from '../app/planReducer.js'
import { createPlanningContext, demoWalkingEstimate } from './planningContext.js'

const now = new Date('2026-09-26T00:20:00Z') // 9:50 Adelaide demo time

test('demo travel is deterministic, labelled and never silently used for live plans', () => {
  const [from, to] = demoPlan.stops
  const estimate = demoWalkingEstimate(from, to)
  assert.equal(estimate.provider, 'demo')
  assert.ok(estimate.travelSeconds > 0)
  assert.deepEqual(estimate, demoWalkingEstimate(from, to))
  assert.equal(createPlanningContext({ dataMode: 'live' }, now).travel(from, to).status, 'unavailable')
  assert.equal(demoWalkingEstimate({ location: null }, to).status, 'unavailable')
  assert.equal(demoWalkingEstimate({ location: { lat: 91, lng: 0 } }, to).status, 'unavailable')
})

test('demo lunch edit produces a break suggestion, reversible before acceptance', () => {
  const initial = createPlanState(demoPlan)
  const edited = planReducer(initial, { type: 'edit-stop-draft', stopId: 'stop-market', edit: {
    title: 'Lunch at the market', scheduledStartAt: '2026-09-26T02:45:00Z', scheduledEndAt: '2026-09-26T03:30:00Z',
  } })
  const ctx = createPlanningContext(edited.draft.plan, now, edited.draft.editedStopIds)
  const analysis = analyzePlan(edited.draft.plan, ctx)
  const conflict = analysis.conflicts.find((c) => c.code === 'late')
  assert.ok(conflict)
  const { proposal } = suggestFix(edited.draft.plan, conflict.id, ctx)
  assert.equal(proposal.changes[0].stopId, 'stop-square')
  assert.equal(proposal.changes[0].after.timing.scheduledStartAt, '2026-09-26T03:40:00.000Z')
  const applied = planReducer(edited, { type: 'apply-suggestion', proposal, ctx })
  assert.equal(analyzePlan(applied.draft.plan, ctx).conflicts.length, 0)
  assert.deepEqual(planReducer(applied, { type: 'revert-suggestion' }), edited)
  assert.deepEqual(planReducer(applied, { type: 'discard-draft' }).plan, demoPlan)
  const accepted = planReducer(applied, { type: 'accept-draft', ctx })
  assert.equal(accepted.draft, null)
  assert.equal(accepted.plan.version, demoPlan.version + 1)
  assert.equal(accepted.plan.stops.find((s) => s.id === 'stop-market').timing.scheduledStartAt, '2026-09-26T02:45:00Z')
})

test('unmodified demo shows free time without claiming real route feasibility', () => {
  const result = analyzePlan(demoPlan, createPlanningContext(demoPlan, now))
  assert.equal(result.conflicts.length, 0)
  assert.ok(result.freeTime.length > 0)
  assert.ok(result.legs.every((leg) => leg.provider === 'demo'))
})
