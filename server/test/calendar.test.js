import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { createCalendarService } from '../src/calendar/service.js'
import { createTokenCipher } from '../src/calendar/tokenCipher.js'

const scope = 'https://www.googleapis.com/auth/calendar.events.readonly'
const key = randomBytes(32).toString('base64')
const env = {
  DATABASE_URL: 'postgresql://test.invalid/daymap',
  GOOGLE_OAUTH_CLIENT_ID: 'daymap-test.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3001/api/calendar/callback',
  TOKEN_ENCRYPTION_KEY: key,
}

function fakeDb() {
  const states = new Map()
  const credentials = new Map()
  return {
    states, credentials,
    async query(sql, params) {
      if (sql.startsWith('delete from private.calendar_oauth_states where user_id')) {
        for (const [digest, state] of states) {
          if (state.user_id === params[0] || (sql.includes('expires_at') && state.expires_at < new Date())) {
            states.delete(digest)
          }
        }
        return { rows: [] }
      }
      if (sql.startsWith('insert into private.calendar_oauth_states')) {
        states.set(params[0], { user_id: params[1], expires_at: params[2] })
        return { rows: [] }
      }
      if (sql.startsWith('delete from private.calendar_oauth_states')) {
        const row = states.get(params[0])
        states.delete(params[0])
        return { rows: row && row.expires_at > new Date() ? [row] : [] }
      }
      if (sql.startsWith('insert into private.calendar_credentials')) {
        credentials.set(params[0], { refresh_token_ciphertext: params[1], scopes: params[2] })
        return { rows: [] }
      }
      if (sql.startsWith('select 1 from private.calendar_credentials')) {
        return { rows: credentials.has(params[0]) ? [{ '?column?': 1 }] : [] }
      }
      if (sql.startsWith('select refresh_token_ciphertext from private.calendar_credentials')) {
        const row = credentials.get(params[0])
        return { rows: row ? [row] : [] }
      }
      if (sql.startsWith('delete from private.calendar_credentials')) {
        const row = credentials.get(params[0])
        credentials.delete(params[0])
        return { rows: row ? [row] : [] }
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
}

test('Calendar connection binds one-time state to the signed-in user and encrypts tokens', async () => {
  const db = fakeDb()
  const calls = []
  const service = createCalendarService({
    env, db,
    fetchImpl: async (url, options) => {
      const body = new URLSearchParams(options.body)
      calls.push({ url, body })
      if (body.get('grant_type') === 'refresh_token') {
        return new Response(JSON.stringify({ access_token: 'short-lived-access-token' }), { status: 200 })
      }
      return new Response(JSON.stringify({ refresh_token: 'private-refresh-token', scope }), { status: 200 })
    },
  })
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const url = new URL(await service.begin(userId))
  assert.equal(url.origin, 'https://accounts.google.com')
  assert.equal(url.searchParams.get('scope'), scope)
  assert.equal(url.searchParams.get('access_type'), 'offline')
  assert.equal(url.searchParams.get('prompt'), 'consent')
  const state = url.searchParams.get('state')
  const digest = createHash('sha256').update(state).digest('hex')
  assert.equal(db.states.get(digest).user_id, userId)
  assert.equal(await service.callback({ state, code: 'one-time-code' }), 'connected')
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token')
  assert.equal(calls[0].body.get('grant_type'), 'authorization_code')
  assert.equal((await service.status(userId)).connected, true)
  const stored = db.credentials.get(userId).refresh_token_ciphertext
  assert.ok(!stored.includes('private-refresh-token'))
  assert.equal(createTokenCipher(key).decrypt(stored), 'private-refresh-token')
  assert.equal(await service.getAccessToken(userId), 'short-lived-access-token')
  assert.equal(calls[1].body.get('refresh_token'), 'private-refresh-token')
  await assert.rejects(service.callback({ state, code: 'replay' }), { code: 'INVALID_OAUTH_STATE' })
})

test('revoked refresh token requires reconnection and removes the unusable credential', async () => {
  const db = fakeDb()
  const service = createCalendarService({
    env, db,
    fetchImpl: async (url, options) => {
      if (new URLSearchParams(options.body).get('grant_type') === 'refresh_token') {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
      }
      return new Response(JSON.stringify({ refresh_token: 'refresh', scope }), { status: 200 })
    },
  })
  const user = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const state = new URL(await service.begin(user)).searchParams.get('state')
  await service.callback({ state, code: 'code' })
  await assert.rejects(service.getAccessToken(user), { code: 'CALENDAR_RECONNECT_REQUIRED' })
  assert.equal((await service.status(user)).connected, false)
})

test('denial consumes state; missing refresh token never replaces a connection', async () => {
  const db = fakeDb()
  const service = createCalendarService({
    env, db,
    fetchImpl: async () => new Response(JSON.stringify({ scope, access_token: 'access-only' }), { status: 200 }),
  })
  const user = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const deniedState = new URL(await service.begin(user)).searchParams.get('state')
  assert.equal(await service.callback({ state: deniedState, error: 'access_denied' }), 'denied')
  await assert.rejects(service.callback({ state: deniedState, code: 'replay' }), { code: 'INVALID_OAUTH_STATE' })
  const state = new URL(await service.begin(user)).searchParams.get('state')
  await assert.rejects(service.callback({ state, code: 'code' }), { code: 'CALENDAR_RECONNECT_REQUIRED' })
  assert.equal((await service.status(user)).connected, false)
})

test('disconnect deletes local credentials and attempts Google revocation', async () => {
  const db = fakeDb()
  const urls = []
  const service = createCalendarService({
    env, db,
    fetchImpl: async url => {
      urls.push(url)
      return url.endsWith('/token')
        ? new Response(JSON.stringify({ refresh_token: 'refresh', scope }), { status: 200 })
        : new Response('', { status: 200 })
    },
  })
  const user = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const state = new URL(await service.begin(user)).searchParams.get('state')
  await service.callback({ state, code: 'code' })
  assert.deepEqual(await service.disconnect(user), { disconnected: true, revoked: true })
  assert.equal((await service.status(user)).connected, false)
  assert.equal(urls[1], 'https://oauth2.googleapis.com/revoke')
})

test('disconnect cancels a pending connection state', async () => {
  const service = createCalendarService({ env, db: fakeDb() })
  const user = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const state = new URL(await service.begin(user)).searchParams.get('state')
  assert.deepEqual(await service.disconnect(user), { disconnected: true, revoked: false })
  await assert.rejects(service.callback({ state, code: 'late-code' }), { code: 'INVALID_OAUTH_STATE' })
})

test('token ciphertext is authenticated and configuration is complete', () => {
  const cipher = createTokenCipher(key)
  const value = cipher.encrypt('secret')
  assert.equal(cipher.decrypt(value), 'secret')
  assert.throws(() => cipher.decrypt(value.slice(0, -2) + 'aa'))
  assert.equal(createCalendarService({ env: {}, db: fakeDb() }), null)
  assert.throws(() => createCalendarService({ env: { GOOGLE_OAUTH_CLIENT_ID: 'partial' }, db: fakeDb() }))
})

test('Calendar routes require a verified session and callback never returns tokens', async t => {
  const calls = []
  const calendar = {
    async begin(userId) { calls.push(userId); return 'https://accounts.google.com/test' },
    async status() { return { connected: true } },
    async disconnect() { return { disconnected: true, revoked: true } },
    async callback() { return 'connected' },
  }
  const supabase = { async request(path, token) {
    if (path !== '/auth/v1/user' || token !== 'alice') throw new Error('unexpected auth request')
    return { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'authenticated' }
  } }
  const server = createApp({ supabase, calendar, clientOrigin: 'http://localhost:5173' })
    .listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/api/calendar`
  const unauthenticated = await fetch(`${base}/connect`, { method: 'POST' })
  assert.equal(unauthenticated.status, 401)
  const connected = await fetch(`${base}/connect`, {
    method: 'POST', headers: { Authorization: 'Bearer alice' },
  })
  assert.equal(connected.status, 200)
  assert.equal((await connected.json()).url, 'https://accounts.google.com/test')
  assert.deepEqual(calls, ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])
  const callback = await fetch(`${base}/callback?state=valid&code=one-time`, { redirect: 'manual' })
  assert.equal(callback.status, 303)
  assert.equal(callback.headers.get('location'), 'http://localhost:5173/?calendar=connected')
  assert.equal(callback.headers.get('cache-control'), 'no-store')
})
