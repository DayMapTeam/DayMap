import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeOverlaps } from './overlaps.js'

const base = Date.parse('2026-09-26T00:00:00Z')
const time = (minutes) => new Date(base + minutes * 60000).toISOString()
const stop = (id, start, end, kind = 'flexible', status = 'planned') => ({
  id, status, location: null,
  timing: { kind, scheduledStartAt: time(start), scheduledEndAt: time(end) },
})
const analyze = (stops, minutes = -1) => analyzeOverlaps({ stops }, { now: base + minutes * 60000 })

test('nested and simultaneous overlaps all appear; touching endpoints do not', () => {
  const stops = [stop('outer', 0, 120), stop('inner', 10, 20), stop('later', 30, 40), stop('same', 30, 40), stop('touch', 120, 130)]
  const result = analyze(stops)
  assert.equal(result.conflicts.length, 4)
  assert.ok(result.conflicts.every((conflict) => conflict.minutes === 10))
  assert.ok(result.conflicts.every((conflict) => !conflict.stopIds.includes('touch')))
})

test('fixed overlaps require a user decision; missing locations do not hide time conflicts', () => {
  const result = analyze([stop('a', 0, 30, 'fixed'), stop('b', 15, 45, 'fixed')])
  assert.equal(result.conflicts[0].needsDecision, true)
  assert.equal(result.conflicts[0].minutes, 15)
  assert.equal(result.conflicts[0].severity, 'error')
  assert.equal(analyze([stop('a', 0, 30, 'fixed'), stop('b', 15, 45)]).conflicts[0].needsDecision, false)
})

test('past overlap is quiet even while its containing event continues', () => {
  const stops = [stop('outer', 0, 120), stop('inner', 10, 20)]
  assert.equal(analyze(stops, 19).conflicts.length, 1)
  assert.equal(analyze(stops, 20).conflicts.length, 0)
  assert.equal(analyze([stop('a', 0, 120, 'flexible', 'completed'), stop('b', 10, 20)]).conflicts.length, 0)
  assert.equal(analyze([stop('a', 0, 120, 'flexible', 'skipped'), stop('b', 10, 20)]).conflicts.length, 0)
})

test('analysis is deterministic, immutable, and IDs survive time reordering', () => {
  const stops = [stop('a', 0, 30), stop('b', 15, 45)]
  const before = structuredClone(stops)
  const result = analyze(stops)
  assert.deepEqual(analyze(stops), result)
  assert.deepEqual(stops, before)
  const reordered = analyze([stop('a', 20, 50), stop('b', 15, 45)])
  assert.equal(result.conflicts[0].id, reordered.conflicts[0].id)
  assert.notEqual(result.conflicts[0].factsKey, reordered.conflicts[0].factsKey)
})

test('invalid schedules are unresolved, while unscheduled and all-day items stay out of overlap analysis', () => {
  const invalid = stop('invalid', 20, 10)
  const unscheduled = { ...stop('unscheduled', 0, 30), timing: { kind: 'flexible', scheduledStartAt: null, scheduledEndAt: null } }
  const result = analyze([invalid, unscheduled, stop('all-day', 0, 30, 'all-day')])
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.unresolved, [{ id: 'invalid-time:invalid', code: 'invalid-time', stopIds: ['invalid'] }])
  assert.throws(() => analyzeOverlaps({ stops: [] }, { now: new Date('invalid') }), TypeError)
  assert.throws(() => analyze([stop('a', 0, 10), stop('a', 20, 30)]), TypeError)
})

test('sweep matches an independent pairwise overlap check on a dense schedule', () => {
  const stops = Array.from({ length: 40 }, (_, i) => stop(`stop-${i}`, (i * 17) % 80, (i * 17) % 80 + (i * 7) % 35 + 1))
  const expected = []
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const a = stops[i].timing
      const b = stops[j].timing
      if (Math.max(Date.parse(a.scheduledStartAt), Date.parse(b.scheduledStartAt))
        < Math.min(Date.parse(a.scheduledEndAt), Date.parse(b.scheduledEndAt))) {
        expected.push([stops[i].id, stops[j].id].sort().join('|'))
      }
    }
  }
  assert.deepEqual(analyze(stops).conflicts.map((conflict) => conflict.stopIds.join('|')).sort(), expected.sort())
})
