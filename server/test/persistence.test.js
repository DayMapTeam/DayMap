import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { createSupabase } from '../src/repositories/supabase.js'
import { validateSave } from '../src/routes/validatePlan.js'
import { demoPlan } from '../../shared/fixtures/demoPlan.js'

const id = '11111111-1111-4111-8111-111111111111'
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const draft = (version = 0) => ({ ...structuredClone(demoPlan), id, version })

// HTTP boundary fake: verifies the real repository forwards user tokens and filters.
// Database RLS is independently exercised by supabase/tests/isolation.sql.
async function fixture(t) {
  const rows = new Map()
  const calls = []
  let unavailable = false
  const supabase = createSupabase({ url: 'https://test.supabase.co', key: 'sb_publishable_test',
    fetchImpl: async (url, options) => {
      const token = options.headers.Authorization.slice(7)
      const userId = { alice, bob }[token]
      const parsed = new URL(url)
      calls.push({ url: parsed, options })
      if (unavailable) throw new Error('private upstream detail')
      if (!userId) return Response.json({ message: 'bad token' }, { status: 401 })
      if (parsed.pathname === '/auth/v1/user') return Response.json({ id: userId, role: 'authenticated' })
      assert.equal(options.headers.apikey, 'sb_publishable_test')
      const body = options.body && JSON.parse(options.body)
      if (options.method === 'POST') {
        assert.equal(body.user_id, userId)
        if (rows.has(body.id)) return Response.json({}, { status: 409 })
        rows.set(body.id, body)
        return Response.json([body])
      }
      assert.equal(parsed.searchParams.get('user_id'), `eq.${userId}`)
      const matched = [...rows.values()].filter(row => row.user_id === userId
        && ['id', 'date', 'timezone', 'version'].every(key => !parsed.searchParams.has(key)
          || parsed.searchParams.get(key) === `eq.${row[key]}`))
      if (options.method === 'PATCH') {
        for (const row of matched) rows.set(row.id, body)
        return Response.json(matched.length ? [body] : [])
      }
      return Response.json(matched)
    },
  })
  const server = createApp({ supabase }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const request = (path, token = 'alice', body) => fetch(`http://127.0.0.1:${server.address().port}/api/plans${path}`, {
    method: body ? 'PUT' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
  })
  return { request, rows, calls, fail: () => { unavailable = true } }
}
const query = '?date=2026-09-26&timezone=Australia%2FAdelaide'

test('Alice saves/reloads; Bob cannot read or overwrite her plan', async t => {
  const { request } = await fixture(t)
  const created = await request(`/${id}`, 'alice', { baseVersion: 0, plan: draft() })
  assert.equal(created.status, 201)
  const saved = await created.json()
  assert.equal(saved.version, 1)
  assert.equal(created.headers.get('cache-control'), 'no-store')
  assert.deepEqual((await (await request(query)).json()).plans, [saved])
  assert.deepEqual((await (await request(query, 'bob')).json()).plans, [])
  assert.equal((await request(`/${id}`, 'bob', { baseVersion: 1, plan: saved })).status, 404)
  assert.deepEqual((await (await request(query)).json()).plans, [saved])
})

test('exactly one competing save succeeds; stale retry returns 409', async t => {
  const { request } = await fixture(t)
  await request(`/${id}`, 'alice', { baseVersion: 0, plan: draft() })
  const save = () => request(`/${id}`, 'alice', { baseVersion: 1, plan: draft(1) })
  const responses = await Promise.all([save(), save()])
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409])
  assert.equal((await save()).status, 409)
  assert.equal((await (await request(query)).json()).plans[0].version, 2)
})

test('missing, malformed and invalid sessions fail before data access', async t => {
  const { request, calls } = await fixture(t)
  for (const token of ['', 'bad token', 'expired']) assert.equal((await request(query, token)).status, 401)
  assert.equal(calls.filter(c => c.url.pathname.startsWith('/rest/')).length, 0)
})

test('invalid inputs and forged ownership do not reach persistence', async t => {
  const { request, rows } = await fixture(t)
  for (const body of [
    { baseVersion: -1, plan: draft() },
    { baseVersion: 0, plan: draft(), userId: bob },
    { baseVersion: 0, plan: { ...draft(), timezone: 'invalid/timezone' } },
    { baseVersion: 0, plan: { ...draft(), date: '2026-02-30' } },
    { baseVersion: 0, plan: { ...draft(), version: 99 } },
  ]) assert.equal((await request(`/${id}`, 'alice', body)).status, 400)
  assert.equal(rows.size, 0)
  assert.equal((await request('?date=2026-02-30&timezone=Australia/Adelaide')).status, 400)
})

test('provider failure preserves accepted records and hides upstream details', async t => {
  const { request, rows, fail } = await fixture(t)
  await request(`/${id}`, 'alice', { baseVersion: 0, plan: draft() })
  fail()
  const response = await request(`/${id}`, 'alice', { baseVersion: 1, plan: draft(1) })
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.error.retryable, true)
  assert.equal(JSON.stringify(body).includes('private'), false)
  assert.equal(rows.get(id).version, 1)
})

test('validation protects fixed, all-day and unresolved stops', () => {
  const validate = plan => validateSave(id, { baseVersion: 0, plan })
  assert.doesNotThrow(() => validate(draft()))
  const fixed = draft()
  fixed.stops[0].timing.scheduledStartAt = '2026-09-26T00:00:00Z'
  assert.throws(() => validate(fixed), /Fixed commitments/)
  const missing = draft()
  missing.stops[0].location = null
  assert.throws(() => validate(missing), /location question/)
  missing.questions = [{ stopId: missing.stops[0].id, field: 'location', prompt: 'Where is this?', status: 'unanswered' }]
  assert.doesNotThrow(() => validate(missing))
  const allDay = draft()
  allDay.stops[0].timing.kind = 'all-day'
  assert.throws(() => validate(allDay))
  const duplicate = draft()
  duplicate.stops.push(duplicate.stops[0])
  assert.throws(() => validate(duplicate), /unique/)
})

test('Supabase configuration stays optional for demo but rejects partial/unsafe settings', () => {
  assert.equal(createSupabase({ url: '', key: '' }), null)
  assert.throws(() => createSupabase({ url: 'https://test.supabase.co', key: '' }))
  assert.throws(() => createSupabase({ url: 'http://remote.example', key: 'test' }))
  assert.throws(() => createSupabase({ url: 'https://test.supabase.co', key: 'sb_secret_test' }))
})
