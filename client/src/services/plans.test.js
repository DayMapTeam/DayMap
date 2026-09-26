import assert from 'node:assert/strict'
import test from 'node:test'
import { loadDemoPlan } from './plans.js'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'

test('loads the fixture through the configured API and forwards cancellation', async (t) => {
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.example/api/demo-plan')
    assert.equal(options.signal, controller.signal)
    return Response.json(demoPlan)
  })
  assert.deepEqual(await loadDemoPlan({ baseUrl: 'https://api.example/', signal: controller.signal }), demoPlan)
})

test('failed requests and invalid response bodies do not produce a plan', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 500 }))
  await assert.rejects(loadDemoPlan(), /Unable to load/)
  mock.mock.mockImplementation(async () => Response.json({}))
  await assert.rejects(loadDemoPlan(), /invalid demo plan/)
  mock.mock.mockImplementation(async () => { throw new TypeError('Network unavailable') })
  await assert.rejects(loadDemoPlan(), /Network unavailable/)
})
