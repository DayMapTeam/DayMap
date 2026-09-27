import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { analyzePlan } from '../../../shared/planning/analyze.js'
import { suggestFix } from '../../../shared/planning/proposals.js'
import { createPlanState, planReducer } from '../app/planReducer.js'
import { chooseMode, createPlanningContext, demoEstimate } from './planningContext.js'

const demoWalkingEstimate = (from, to) => demoEstimate(from, to, { mode: 'walk' })

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

test('short journeys are walked whatever the setting; long ones follow it', () => {
  const at = (lat, lng, end = '2026-09-26T01:00:00Z') => ({ location: { lat, lng }, timing: { kind: 'fixed', scheduledStartAt: '2026-09-26T00:00:00Z', scheduledEndAt: end } })
  const uni = at(-34.9206, 138.6062)
  const library = at(-34.9204, 138.6029)
  const glenelg = at(-34.9807, 138.5140) // ~11 km
  const none = () => ({ status: 'pending' })
  for (const preference of ['auto', 'drive', 'walk']) assert.equal(chooseMode(uni, library, preference, none).mode, 'walk')
  assert.equal(chooseMode(uni, glenelg, 'drive', none).mode, 'drive')
  assert.equal(chooseMode(uni, glenelg, 'walk', none).mode, 'walk')
  assert.equal(chooseMode(uni, glenelg, 'auto', none).mode, 'transit', 'transit is requested while unknown')
})

test('walk + transit uses public transport only when it saves time, and walks without a route', () => {
  const from = { location: { lat: -34.9206, lng: 138.6062 }, timing: { kind: 'fixed', scheduledStartAt: '2026-09-26T00:00:00Z', scheduledEndAt: '2026-09-26T01:00:00Z' } }
  const to = { location: { lat: -34.9807, lng: 138.5140 } }
  const lookup = (transit, walk) => (f, t, { mode, departAt }) => {
    if (mode === 'transit') assert.equal(departAt, '2026-09-26T01:00:00.000Z', 'transit is checked at the real departure')
    return mode === 'transit' ? transit : walk
  }
  const ready = (minutes) => ({ status: 'ready', travelSeconds: minutes * 60 })
  assert.equal(chooseMode(from, to, 'auto', lookup(ready(30), ready(140))).mode, 'transit')
  assert.equal(chooseMode(from, to, 'auto', lookup(ready(28), ready(31))).mode, 'walk', 'saving under 5 min: walk')
  assert.deepEqual(chooseMode(from, to, 'auto', lookup({ status: 'unavailable', reason: 'no-route' }, ready(140))),
    { mode: 'walk', source: 'no-transit' })
})

test('demo estimates cover every mode, and transit echoes its departure', () => {
  const [from, to] = [demoPlan.stops[0], demoPlan.stops[3]]
  const walk = demoEstimate(from, to, { mode: 'walk' })
  const drive = demoEstimate(from, to, { mode: 'drive' })
  const transit = demoEstimate(from, to, { mode: 'transit', departAt: '2026-09-26T01:00:00.000Z' })
  assert.ok(drive.travelSeconds < walk.travelSeconds)
  assert.equal(transit.departAt, '2026-09-26T01:00:00.000Z')
  assert.ok([walk, drive, transit].every((estimate) => estimate.provider === 'demo'))
})

test('a long demo day with the car setting drives and uses the car buffer', () => {
  const far = structuredClone(demoPlan)
  far.stops[3].location = { label: 'Glenelg (fictional)', placeId: null, lat: -34.9807, lng: 138.5140 }
  const analysis = analyzePlan(far, createPlanningContext(far, now, [], undefined, 'drive'))
  const leg = analysis.legs.find((candidate) => candidate.toStopId === far.stops[3].id)
  assert.equal(leg.mode, 'drive')
  assert.equal(leg.bufferSeconds, 600)
  const walked = analyzePlan(demoPlan, createPlanningContext(demoPlan, now, [], undefined, 'drive'))
  assert.ok(walked.legs.every((candidate) => candidate.mode === 'walk'), 'the compact demo day is walked')
})

test('a mode chosen for the journey overrides the automatic choice, even for a short hop', () => {
  const uni = { location: { lat: -34.9206, lng: 138.6062 }, timing: { kind: 'fixed', scheduledStartAt: '2026-09-26T00:00:00Z', scheduledEndAt: '2026-09-26T01:00:00Z' } }
  const library = { location: { lat: -34.9204, lng: 138.6029 }, travelMode: 'drive' }
  assert.deepEqual(chooseMode(uni, library, 'auto', () => ({ status: 'pending' })), { mode: 'drive', source: 'chosen' })
  assert.equal(chooseMode(uni, { ...library, travelMode: null }, 'auto', () => ({ status: 'pending' })).mode, 'walk')
})
