import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { createPlanState, planReducer } from './planReducer.js'

test('selection and clearing preserve the accepted plan', () => {
  const initial = createPlanState(demoPlan)
  const snapshot = structuredClone(initial.plan)
  const first = planReducer(initial, { type: 'select-stop', stopId: demoPlan.stops[0].id })
  const second = planReducer(first, { type: 'select-stop', stopId: demoPlan.stops[1].id })
  const cleared = planReducer(second, { type: 'clear-selection' })
  assert.equal(initial.selectedStopId, null)
  assert.equal(first.selectedStopId, demoPlan.stops[0].id)
  assert.equal(second.selectedStopId, demoPlan.stops[1].id)
  assert.equal(cleared.selectedStopId, null)
  for (const state of [first, second, cleared]) {
    assert.equal(state.plan, initial.plan)
    assert.deepEqual(state.plan, snapshot)
  }
})

test('unknown IDs cannot replace a valid selection', () => {
  const selected = planReducer(createPlanState(demoPlan), {
    type: 'select-stop', stopId: demoPlan.stops[0].id,
  })
  assert.equal(planReducer(selected, { type: 'select-stop', stopId: 'missing-stop' }), selected)
  assert.equal(planReducer(selected, { type: 'select-stop', stopId: selected.selectedStopId }), selected)
})

test('provider instances do not share mutable nested fixture data', () => {
  const first = createPlanState(demoPlan)
  const second = createPlanState(demoPlan)
  first.plan.stops[0].location.label = 'Changed in one instance'
  assert.deepEqual(second.plan, demoPlan)
  assert.notEqual(first.plan.stops[0].location.label, demoPlan.stops[0].location.label)
})

test('fixture has unique IDs, valid coordinates and consistent UTC visit times', () => {
  assert.equal(demoPlan.dataMode, 'demo')
  assert.equal(demoPlan.stops.length, 4)
  assert.equal(new Set(demoPlan.stops.map((stop) => stop.id)).size, 4)
  assert.deepEqual(demoPlan.legs, [])
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: demoPlan.timezone })
  for (const { location, timing } of demoPlan.stops) {
    assert.ok(location.lat >= -90 && location.lat <= 90)
    assert.ok(location.lng >= -180 && location.lng <= 180)
    const start = Date.parse(timing.scheduledStartAt)
    const end = Date.parse(timing.scheduledEndAt)
    assert.ok(timing.scheduledStartAt.endsWith('Z'))
    assert.ok(timing.scheduledEndAt.endsWith('Z'))
    assert.equal(localDate.format(start), demoPlan.date)
    assert.equal(localDate.format(end), demoPlan.date)
    assert.equal((end - start) / 60000, timing.durationMinutes)
    if (timing.kind === 'fixed') {
      assert.equal(timing.scheduledStartAt, timing.fixedStartAt)
      assert.equal(timing.scheduledEndAt, timing.fixedEndAt)
    } else {
      assert.ok(start >= Date.parse(timing.earliestStartAt))
      assert.ok(end <= Date.parse(timing.latestEndAt))
    }
  }
})
