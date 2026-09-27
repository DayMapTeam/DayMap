import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiClient } from './api.js'

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

test('requests carry the session token and plans come back unwrapped', async () => {
  const calls = []
  const api = createApiClient({
    baseUrl: 'https://api.test', getToken: async () => 'token-1',
    fetchImpl: async (url, init) => { calls.push({ url, init }); return json(200, { plans: [{ id: 'p' }] }) },
  })
  assert.deepEqual(await api.getDayPlan('2026-09-27', 'Australia/Adelaide'), { id: 'p' })
  assert.equal(calls[0].url, 'https://api.test/api/plans?date=2026-09-27&timezone=Australia%2FAdelaide')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-1')
})

test('saves send the base version as the plan version', async () => {
  let sent
  const api = createApiClient({
    getToken: async () => 't', fetchImpl: async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return json(200, {}) },
  })
  await api.savePlan({ id: 'abc', version: 9, stops: [] }, 4)
  assert.equal(sent.url, '/api/plans/abc')
  assert.deepEqual(sent.body, { baseVersion: 4, plan: { id: 'abc', version: 4, stops: [] } })
})

test('errors keep the server code; network failures and missing sessions are distinct', async () => {
  const conflict = createApiClient({
    getToken: async () => 't',
    fetchImpl: async () => json(409, { error: { code: 'VERSION_CONFLICT', message: 'Reload', retryable: false } }),
  })
  await assert.rejects(conflict.getDayPlan('2026-09-27', 'UTC'), { code: 'VERSION_CONFLICT', status: 409, retryable: false })

  const offline = createApiClient({ getToken: async () => 't', fetchImpl: async () => { throw new TypeError('fetch failed') } })
  await assert.rejects(offline.getDayPlan('2026-09-27', 'UTC'), { code: 'NETWORK_UNAVAILABLE', retryable: true })

  let called = false
  const signedOut = createApiClient({ getToken: async () => null, fetchImpl: async () => { called = true } })
  await assert.rejects(signedOut.getDayPlan('2026-09-27', 'UTC'), { code: 'INVALID_SESSION' })
  assert.equal(called, false, 'no request without a session')
})

test('Calendar import asks to restore removed events only when told to', async () => {
  const bodies = []
  const api = createApiClient({
    getToken: async () => 't', fetchImpl: async (url, init) => { bodies.push(JSON.parse(init.body)); return json(200, {}) },
  })
  await api.importCalendarDay('2026-09-27', 'UTC')
  await api.importCalendarDay('2026-09-27', 'UTC', { restoreRemoved: true })
  await api.importCalendarDay('2026-09-27', 'UTC', { restoreRemoved: 'yes' })
  const event = { sourceCalendarId: 'primary', sourceEventId: 'gym', title: 'Gym' }
  await api.importCalendarDay('2026-09-27', 'UTC', { restoreEvents: [event] })
  await api.importCalendarDay('2026-09-27', 'UTC', { restoreEvents: event })
  assert.deepEqual(bodies, [
    { date: '2026-09-27', timezone: 'UTC' },
    { date: '2026-09-27', timezone: 'UTC', restoreRemoved: true },
    { date: '2026-09-27', timezone: 'UTC' },
    { date: '2026-09-27', timezone: 'UTC', restoreEvents: [{ sourceCalendarId: 'primary', sourceEventId: 'gym' }] },
    { date: '2026-09-27', timezone: 'UTC' },
  ])
})
