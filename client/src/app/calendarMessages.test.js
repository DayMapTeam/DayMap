import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calendarErrorMessage, calendarReturnMessage, importSummaryMessage, readCalendarReturn, withoutCalendarReturn,
} from './calendarMessages.js'

test('the Calendar return is read only for known outcomes', () => {
  assert.deepEqual(readCalendarReturn('?calendar=connected'), { outcome: 'connected', reason: null })
  assert.deepEqual(readCalendarReturn('?calendar=error&reason=INVALID_OAUTH_STATE'), { outcome: 'error', reason: 'INVALID_OAUTH_STATE' })
  assert.equal(readCalendarReturn('?calendar=<script>'), null)
  assert.equal(readCalendarReturn(''), null)
})

test('the address bar loses only the Calendar parameters', () => {
  assert.equal(withoutCalendarReturn('http://localhost:5173/?calendar=error&reason=X&keep=1#top'), 'http://localhost:5173/?keep=1#top')
  assert.equal(withoutCalendarReturn('http://localhost:5173/?calendar=connected'), 'http://localhost:5173/')
})

test('every return has a message, and unknown reasons fall back safely', () => {
  assert.equal(calendarReturnMessage({ outcome: 'connected' }).tone, 'success')
  assert.equal(calendarReturnMessage({ outcome: 'denied' }).tone, 'info')
  assert.match(calendarReturnMessage({ outcome: 'error', reason: 'CALENDAR_NOT_CONFIGURED' }).text, /isn’t set up/)
  assert.match(calendarReturnMessage({ outcome: 'error', reason: 'SOMETHING_NEW' }).text, /couldn’t be connected/)
})

test('import summaries count what changed', () => {
  assert.equal(importSummaryMessage({ added: 0, updated: 0, removed: 0 }), 'Your day is up to date with Google Calendar.')
  assert.equal(importSummaryMessage({ added: 1, updated: 0, removed: 0 }), 'Calendar event imported: 1 added.')
  assert.equal(importSummaryMessage({ added: 3, updated: 1, removed: 2 }), 'Calendar events imported: 3 added, 1 updated, 2 removed.')
  assert.equal(importSummaryMessage({ added: 0, updated: 0, removed: 0, hidden: 2 }),
    'Your day is up to date with Google Calendar. 2 events you removed stay hidden.')
  assert.equal(importSummaryMessage({ added: 1, updated: 0, removed: 0, hidden: 1 }),
    'Calendar event imported: 1 added. 1 event you removed stays hidden.')
  assert.match(calendarErrorMessage({ code: 'CALENDAR_RECONNECT_REQUIRED' }), /Reconnect/)
  assert.equal(calendarErrorMessage({ code: 'X', message: 'Server says' }), 'Server says')
})
