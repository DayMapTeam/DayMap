import assert from 'node:assert/strict'
import test from 'node:test'
import { focusKeysAfterRestore, removedEventKey, removedEventsSummary } from './removedEvents.js'

test('removed events are counted in plain words', () => {
  assert.equal(removedEventsSummary(1), '1 removed Calendar event')
  assert.equal(removedEventsSummary(3), '3 removed Calendar events')
})

test('each removed event has its own key, even with the same event ID in two calendars', () => {
  const a = removedEventKey({ sourceCalendarId: 'work', sourceEventId: 'e1' })
  const b = removedEventKey({ sourceCalendarId: 'home', sourceEventId: 'e1' })
  assert.notEqual(a, b)
  assert.equal(a, removedEventKey({ sourceCalendarId: 'work', sourceEventId: 'e1', title: 'Other title' }))
})

test('after bringing one back, focus moves to the next event, else the one before', () => {
  assert.deepEqual(focusKeysAfterRestore(['a', 'b', 'c'], 'b'), ['c', 'a'])
  assert.deepEqual(focusKeysAfterRestore(['a', 'b', 'c'], 'c'), ['b'])
  assert.deepEqual(focusKeysAfterRestore(['a'], 'a'), [])
  assert.deepEqual(focusKeysAfterRestore(['a'], 'x'), [])
})
