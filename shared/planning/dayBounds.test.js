import assert from 'node:assert/strict'
import test from 'node:test'
import { planDayBounds } from './dayBounds.js'

test('Adelaide day boundaries use local midnight', () => {
  const { start, end } = planDayBounds('2026-09-26', 'Australia/Adelaide')
  assert.equal(new Date(start).toISOString(), '2026-09-25T14:30:00.000Z')
  assert.equal(new Date(end).toISOString(), '2026-09-26T14:30:00.000Z')
})

test('day boundaries include 23-hour and 25-hour daylight-saving days', () => {
  for (const [date, hours] of [['2026-10-04', 23], ['2026-04-05', 25]]) {
    const { start, end } = planDayBounds(date, 'Australia/Adelaide')
    assert.equal((end - start) / 3600000, hours)
  }
})

test('invalid dates and missing or invalid timezones fail explicitly', () => {
  for (const date of ['2026-02-30', 'bad', '2026-9-26']) {
    assert.throws(() => planDayBounds(date, 'Australia/Adelaide'))
  }
  for (const zone of [undefined, '', 'bad/zone']) {
    assert.throws(() => planDayBounds('2026-09-26', zone))
  }
  assert.throws(() => planDayBounds('2011-12-30', 'Pacific/Apia'))
})
