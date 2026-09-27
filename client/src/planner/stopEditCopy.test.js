import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { overlapNote, resizeBlockMessage } from './stopEditCopy.js'

const fixed = demoPlan.stops.find((stop) => stop.timing.kind === 'fixed')
const flexible = demoPlan.stops.find((stop) => stop.timing.kind === 'flexible' && stop.timing.latestEndAt !== null)
const zone = demoPlan.timezone

test('length buttons say plainly why they are blocked', () => {
  assert.equal(resizeBlockMessage(null, fixed, -15, zone, 5), null)
  assert.equal(resizeBlockMessage('too-short', fixed, -15, zone, 5), 'Can’t be shorter than 5 minutes.')
  assert.equal(resizeBlockMessage('too-long', fixed, 15, zone, 5), 'Can’t be longer than 24 hours.')
  assert.equal(resizeBlockMessage('past-day-end', fixed, 15, zone, 5), 'Can’t run past the end of the day.')
  assert.match(resizeBlockMessage('outside-window', flexible, 15, zone, 5), /^Can’t be longer: it has to end by \d{1,2}:\d{2}(am|pm)\.$/)
  assert.equal(resizeBlockMessage('outside-window', fixed, 15, zone, 5), 'Can’t be longer: it has to stay inside its time window.')
  assert.equal(resizeBlockMessage('not-editable', fixed, -15, zone, 5), 'Can’t be shorter here.')
  assert.equal(resizeBlockMessage('not-editable', fixed, 15, zone, 5), 'Can’t be longer here.')
})

test('the overlap note names the other stops, and ignores other kinds of conflict', () => {
  const [a, b, c] = demoPlan.stops
  const overlap = (x, y, minutes) => ({ code: 'overlap', stopIds: [x.id, y.id], minutes })
  assert.equal(overlapNote([], a.id, demoPlan.stops), null)
  assert.equal(overlapNote([overlap(a, b, 15)], a.id, demoPlan.stops), `Overlaps ‘${b.title}’ by 15 min.`)
  assert.equal(overlapNote([overlap(a, b, 15), overlap(c, b, 5)], b.id, demoPlan.stops),
    `Overlaps ‘${a.title}’ by 15 min and ‘${c.title}’ by 5 min.`)
  assert.equal(overlapNote([{ code: 'late', stopIds: [a.id, b.id], minutes: 3 }], a.id, demoPlan.stops), null)
  assert.equal(overlapNote([overlap(a, b, 15)], c.id, demoPlan.stops), null)
})
