import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { createCalendarService } from '../src/calendar/service.js'
import { createTokenCipher } from '../src/calendar/tokenCipher.js'
import { ApiError } from '../src/middleware/apiError.js'

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
      if (sql.startsWith('delete from private.calendar_oauth_states where expires_at')) {
        for (const [digest, state] of states) if (state.expires_at <= new Date()) states.delete(digest)
        return { rows: [] }
      }
      if (sql.startsWith('select private.begin_calendar_connection')) {
        for (const [digest, state] of states) {
          if (state.user_id === params[0]) states.delete(digest)
        }
        states.set(params[1], { user_id: params[0], expires_at: params[2], claimed_at: null })
        return { rows: [] }
      }
      if (sql.startsWith('update private.calendar_oauth_states')) {
        const row = states.get(params[0])
        if (!row || row.claimed_at || row.expires_at <= new Date()) return { rows: [] }
        row.claimed_at = new Date()
        return { rows: [row] }
      }
      if (sql.startsWith('select private.finish_calendar_connection')) {
        const state = states.get(params[1])
        if (!state || state.user_id !== params[0] || !state.claimed_at || state.expires_at <= new Date()) return { rows: [{ connected: false }] }
        states.delete(params[1])
        credentials.set(params[0], { refresh_token_ciphertext: params[2], scopes: params[3] })
        return { rows: [{ connected: true }] }
      }
      if (sql.startsWith('select 1 from private.calendar_credentials')) {
        const row = credentials.get(params[0])
        return { rows: row && (params.length === 1 || row.refresh_token_ciphertext === params[1]) ? [{ '?column?': 1 }] : [] }
      }
      if (sql.startsWith('select refresh_token_ciphertext from private.calendar_credentials')) {
        const row = credentials.get(params[0])
        return { rows: row ? [row] : [] }
      }
      if (sql.startsWith('delete from private.calendar_credentials')) {
        const row = credentials.get(params[0])
        if (!row || row.refresh_token_ciphertext !== params[1]) return { rows: [] }
        credentials.delete(params[0])
        return { rows: [row] }
      }
      if (sql.startsWith('select private.disconnect_calendar')) {
        for (const [digest, state] of states) if (state.user_id === params[0]) states.delete(digest)
        const row = credentials.get(params[0])
        credentials.delete(params[0])
        return { rows: [{ refresh_token_ciphertext: row?.refresh_token_ciphertext ?? null }] }
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

const userId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const tokenResponse = (refresh = 'refresh') => new Response(JSON.stringify({ refresh_token: refresh, scope }))
const beginState = async service => new URL(await service.begin(userId)).searchParams.get('state')

test('disconnect on another server cancels an exchange already waiting for Google', async () => {
  const db = fakeDb()
  const started = deferred()
  const response = deferred()
  const service = createCalendarService({ env, db, fetchImpl: async () => {
    started.resolve()
    return response.promise
  } })
  const otherServer = createCalendarService({ env, db })
  const state = await beginState(service)
  const callback = service.callback({ state, code: 'code' })
  const rejected = assert.rejects(callback, { status: 409, code: 'CALENDAR_CONNECTION_CANCELLED' })
  await started.promise
  await otherServer.disconnect(userId)
  response.resolve(tokenResponse())
  await rejected
  assert.equal((await otherServer.status(userId)).connected, false)
  assert.equal(db.states.size, 0)
})

test('a replacement connection wins over an older in-flight exchange', async () => {
  const db = fakeDb()
  const started = deferred()
  const response = deferred()
  const oldServer = createCalendarService({ env, db, fetchImpl: async () => {
    started.resolve()
    return response.promise
  } })
  const newServer = createCalendarService({ env, db, fetchImpl: async () => tokenResponse('new-token') })
  const oldState = await beginState(oldServer)
  const callback = oldServer.callback({ state: oldState, code: 'old-code' })
  const rejected = assert.rejects(callback, { code: 'CALENDAR_CONNECTION_CANCELLED' })
  await started.promise
  const newState = await beginState(newServer)
  await newServer.callback({ state: newState, code: 'new-code' })
  response.resolve(tokenResponse('old-token'))
  await rejected
  assert.equal(createTokenCipher(key).decrypt(db.credentials.get(userId).refresh_token_ciphertext), 'new-token')
})

test('claimed state cannot be replayed while its first exchange is in flight', async () => {
  const db = fakeDb()
  const started = deferred()
  const response = deferred()
  let exchanges = 0
  const service = createCalendarService({ env, db, fetchImpl: async () => {
    exchanges++
    started.resolve()
    return response.promise
  } })
  const state = await beginState(service)
  const callback = service.callback({ state, code: 'code' })
  await started.promise
  await assert.rejects(service.callback({ state, code: 'replay' }), { code: 'INVALID_OAUTH_STATE' })
  response.resolve(tokenResponse())
  assert.equal(await callback, 'connected')
  assert.equal(exchanges, 1)
})

test('an attempt expiring during the exchange cannot save its token', async () => {
  const db = fakeDb()
  const service = createCalendarService({ env, db, fetchImpl: async () => {
    for (const state of db.states.values()) state.expires_at = new Date(0)
    return tokenResponse()
  } })
  const state = await beginState(service)
  await assert.rejects(service.callback({ state, code: 'code' }), { code: 'CALENDAR_CONNECTION_CANCELLED' })
  assert.equal((await service.status(userId)).connected, false)
})

for (const outcome of ['invalid_grant', 'success']) {
  test(`late refresh ${outcome} cannot replace or delete a newer connection`, async () => {
    const db = fakeDb()
    const started = deferred()
    const response = deferred()
    const service = createCalendarService({ env, db, fetchImpl: async (_url, options) => {
      if (new URLSearchParams(options.body).get('grant_type') === 'refresh_token') {
        started.resolve()
        return response.promise
      }
      return tokenResponse()
    } })
    const initialState = await beginState(service)
    await service.callback({ state: initialState, code: 'code' })
    const refresh = service.getAccessToken(userId)
    const rejected = assert.rejects(refresh, { code: 'CALENDAR_RECONNECT_REQUIRED' })
    await started.promise
    const newServer = createCalendarService({ env, db, fetchImpl: async () => tokenResponse('new-token') })
    const newState = await beginState(newServer)
    await newServer.callback({ state: newState, code: 'new-code' })
    response.resolve(outcome === 'success'
      ? new Response(JSON.stringify({ access_token: 'old-grant-access' }))
      : new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
    await rejected
    assert.equal(createTokenCipher(key).decrypt(db.credentials.get(userId).refresh_token_ciphertext), 'new-token')
  })
}

test('successful refresh arriving after disconnect cannot return an access token', async () => {
  const db = fakeDb()
  const started = deferred()
  const response = deferred()
  const service = createCalendarService({ env, db, fetchImpl: async (_url, options) => {
    if (new URLSearchParams(options.body).get('grant_type') === 'refresh_token') {
      started.resolve()
      return response.promise
    }
    return tokenResponse()
  } })
  const state = await beginState(service)
  await service.callback({ state, code: 'code' })
  const refresh = service.getAccessToken(userId)
  const rejected = assert.rejects(refresh, { code: 'CALENDAR_RECONNECT_REQUIRED' })
  await started.promise
  await service.disconnect(userId)
  response.resolve(new Response(JSON.stringify({ access_token: 'late-access' })))
  await rejected
  assert.equal((await service.status(userId)).connected, false)
})

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

test('listDayEvents refreshes on the server and sends the access token only to Google Calendar', async () => {
  const db = fakeDb()
  const calls = []
  const service = createCalendarService({ env, db, fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).startsWith('https://www.googleapis.com/calendar/')) {
      return new Response(JSON.stringify({ items: [{ id: 'event-1' }] }))
    }
    return new URLSearchParams(options.body).get('grant_type') === 'refresh_token'
      ? new Response(JSON.stringify({ access_token: 'short-lived' }))
      : tokenResponse()
  } })
  const state = await beginState(service)
  await service.callback({ state, code: 'code' })
  const events = await service.listDayEvents(userId, { timeMin: 0, timeMax: 86400000 })
  assert.deepEqual(events, [{ id: 'event-1' }])
  const calendarCall = calls.at(-1)
  assert.match(calendarCall.url, /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events\?/)
  assert.equal(calendarCall.options.headers.Authorization, 'Bearer short-lived')
  assert.ok(!calendarCall.url.includes('short-lived'))
})

test('every callback outcome returns to the app, never a JSON page', async t => {
  const outcomes = [
    ['denied', () => 'denied'],
    ['expired', () => { throw new ApiError(400, 'INVALID_OAUTH_STATE', 'expired') }],
    ['no offline access', () => { throw new ApiError(400, 'CALENDAR_RECONNECT_REQUIRED', 'no refresh token') }],
    ['unexpected', () => { throw Object.assign(new Error('relation does not exist'), { code: '42P01' }) }],
  ]
  let next
  const calendar = { async callback() { return next() } }
  const server = createApp({ supabase: null, calendar, clientOrigin: 'http://localhost:5173' }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const errors = []
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')))
  const url = `http://127.0.0.1:${server.address().port}/api/calendar/callback?state=s&code=c`
  const locations = []
  for (const [, outcome] of outcomes) {
    next = outcome
    const response = await fetch(url, { redirect: 'manual' })
    assert.equal(response.status, 303)
    locations.push(response.headers.get('location'))
  }
  assert.deepEqual(locations, [
    'http://localhost:5173/?calendar=denied',
    'http://localhost:5173/?calendar=error&reason=INVALID_OAUTH_STATE',
    'http://localhost:5173/?calendar=error&reason=CALENDAR_RECONNECT_REQUIRED',
    'http://localhost:5173/?calendar=error&reason=CALENDAR_CONNECTION_FAILED',
  ])
  assert.equal(errors.length, 1, 'only the unexpected failure is logged')

  const unconfigured = createApp({ supabase: null, calendar: null, clientOrigin: 'http://localhost:5173' }).listen(0, '127.0.0.1')
  await once(unconfigured, 'listening')
  t.after(() => new Promise(resolve => unconfigured.close(resolve)))
  const response = await fetch(`http://127.0.0.1:${unconfigured.address().port}/api/calendar/callback?state=s`, { redirect: 'manual' })
  assert.equal(response.headers.get('location'), 'http://localhost:5173/?calendar=error&reason=CALENDAR_NOT_CONFIGURED')
})
