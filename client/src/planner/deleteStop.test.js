import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { sortStopsForDisplay } from '../../../shared/planning/timeline.js'
import { deleteFocusSelectors, deleteMessage } from './deleteStop.js'

const escape = (value) => value
const ordered = sortStopsForDisplay(demoPlan.stops)
const row = (stop) => `[data-stop-id="${stop.id}"] .event-row`

test('the delete dialog says a Calendar event is only removed from DayMap', () => {
  const manual = demoPlan.stops[0]
  const calendar = { ...manual, source: 'google-calendar' }
  assert.match(deleteMessage(manual), /removed from your day\. You can undo/)
  assert.match(deleteMessage(calendar), /removed from DayMap only\. Your Google Calendar won’t change/)
  assert.match(deleteMessage(calendar), /bring it back from the bottom of the planner/)
})

test('after deleting, focus goes to the next stop, then the one before, then +', () => {
  const [first, second] = ordered
  const last = ordered.at(-1)
  assert.equal(deleteFocusSelectors(demoPlan.stops, second.id, escape),
    `[data-delete-stop="${second.id}"] || ${row(ordered[2])} || ${row(first)} || .planner-add`)
  assert.equal(deleteFocusSelectors(demoPlan.stops, last.id, escape),
    `[data-delete-stop="${last.id}"] || ${row(ordered.at(-2))} || .planner-add`)
  assert.equal(deleteFocusSelectors([first], first.id, escape), `[data-delete-stop="${first.id}"] || .planner-add`)
  assert.equal(deleteFocusSelectors(demoPlan.stops, 'gone', escape), '[data-delete-stop="gone"] || .planner-add')
})
