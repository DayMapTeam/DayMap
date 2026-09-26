import assert from 'node:assert/strict'
import { once } from 'node:events'
import { before, after, test } from 'node:test'
import { createApp } from '../src/app.js'
import { demoPlan } from '../../shared/fixtures/demoPlan.js'

const clientOrigin = 'https://daymap.example'
let server
let baseUrl
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(5000) })
before(async () => {
  server = createApp({ clientOrigin }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
})

test('health is public and contains only status', async () => {
  const response = await request(`${baseUrl}/api/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('demo endpoint returns the shared fixture without credentials', async () => {
  const response = await request(`${baseUrl}/api/demo-plan`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), demoPlan)
})

test('CORS grants access only to the exact configured origin', async () => {
  for (const origin of [clientOrigin, 'https://daymap.example.evil.test', 'http://daymap.example', `${clientOrigin}:444`, 'null']) {
    const response = await request(`${baseUrl}/api/health`, { headers: { Origin: origin } })
    assert.equal(response.headers.get('access-control-allow-origin'), origin === clientOrigin ? clientOrigin : null)
    assert.equal(response.status, 200) // CORS is browser policy, not authentication.
    assert.match(response.headers.get('vary'), /Origin/)
  }
})

test('allowed preflight succeeds and disallowed preflight grants no origin', async () => {
  for (const origin of [clientOrigin, 'https://other.example']) {
    const response = await request(`${baseUrl}/api/demo-plan`, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
    })
    assert.equal(response.headers.get('access-control-allow-origin'), origin === clientOrigin ? clientOrigin : null)
    if (origin === clientOrigin) assert.equal(response.status, 204)
  }
})

test('unknown endpoints return the documented JSON error shape', async () => {
  const response = await request(`${baseUrl}/api/missing`)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), {
    error: { code: 'NOT_FOUND', message: 'Endpoint not found', retryable: false },
  })
})

test('JSON parsing accepts valid bodies and reports malformed bodies safely', async () => {
  for (const [body, status, code] of [['{}', 404, 'NOT_FOUND'], ['{"secret":', 400, 'INVALID_JSON']]) {
    const response = await request(`${baseUrl}/api/missing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: clientOrigin }, body,
    })
    assert.equal(response.status, status)
    assert.equal(response.headers.get('access-control-allow-origin'), clientOrigin)
    const result = await response.json()
    assert.equal(result.error.code, code)
    assert.equal(result.error.retryable, false)
    assert.equal(JSON.stringify(result).includes('secret'), false)
  }
})

test('oversized JSON returns a structured 413', async () => {
  const response = await request(`${baseUrl}/api/missing`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'a'.repeat(110000) }),
  })
  assert.equal(response.status, 413)
  assert.equal((await response.json()).error.code, 'PAYLOAD_TOO_LARGE')
})

test('invalid CORS configuration fails instead of permitting a wildcard', () => {
  for (const clientOrigin of ['*', 'null', '', 'https://example.com/path', 'https://example.com/', 'ftp://example.com']) {
    assert.throws(() => createApp({ clientOrigin }))
  }
})
