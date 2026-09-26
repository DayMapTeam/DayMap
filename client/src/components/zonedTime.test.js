import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTimeRange, toTimeInputValue } from './formatTime.js'
import { zonedTimeToDate, zonedTimeToTimestamp } from './zonedTime.js'

const ADELAIDE = 'Australia/Adelaide'

test('converts Adelaide standard time (UTC+9:30) to UTC', () => {
  assert.equal(zonedTimeToDate('2026-09-26', '09:50', ADELAIDE).toISOString(), '2026-09-26T00:20:00.000Z')
})

test('converts Adelaide daylight time (UTC+10:30) to UTC', () => {
  assert.equal(zonedTimeToDate('2026-01-15', '09:00', ADELAIDE).toISOString(), '2026-01-14T22:30:00.000Z')
})

test('uses the offset after the daylight-saving change on the change day', () => {
  // Daylight saving starts at 2:00am on Sunday 4 October 2026.
  assert.equal(zonedTimeToDate('2026-10-04', '12:00', ADELAIDE).toISOString(), '2026-10-04T01:30:00.000Z')
})

test('time inputs round-trip through contract timestamps', () => {
  const timestamp = zonedTimeToTimestamp('2026-09-26', '10:30', ADELAIDE)
  assert.equal(timestamp, '2026-09-26T01:00:00Z')
  assert.equal(toTimeInputValue(timestamp, ADELAIDE), '10:30')
})

test('time ranges show the period once unless they cross noon', () => {
  assert.equal(formatTimeRange('2026-09-25T23:30:00Z', '2026-09-26T00:30:00Z', ADELAIDE), '9:00 – 10:00am')
  assert.equal(formatTimeRange('2026-09-26T02:00:00Z', '2026-09-26T02:45:00Z', ADELAIDE), '11:30am – 12:15pm')
})
