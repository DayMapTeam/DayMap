import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as pause } from 'node:timers/promises'
import { createPlaceSearchController } from './placeSearchController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup(provider, delay = 0) {
  const states = []
  const selections = []
  const controller = createPlaceSearchController({
    provider: { reset() {}, ...provider },
    onState: (state) => states.push(state),
    onSelect: (place) => selections.push(place),
    delay,
  })
  return { controller, states, selections }
}

test('rapid typing only requests the final query', async () => {
  const queries = []
  const { controller } = setup({ suggest: async (query) => { queries.push(query); return [] } }, 10)
  controller.search('lib')
  controller.search('library')
  await pause(30)
  assert.deepEqual(queries, ['library'])
  controller.dispose()
})

test('out-of-order suggestions cannot replace the latest results', async () => {
  const first = deferred()
  const second = deferred()
  const { controller, states } = setup({ suggest: (q) => q === 'first' ? first.promise : second.promise })
  controller.search('first')
  await pause(5)
  controller.search('second')
  await pause(5)
  second.resolve([{ id: 'new' }])
  await pause(0)
  first.resolve([{ id: 'old' }])
  await pause(0)
  assert.deepEqual(states.at(-1).results, [{ id: 'new' }])
  controller.dispose()
})

test('clearing during place resolution prevents a late preview pin', async () => {
  const detail = deferred()
  const { controller, states, selections } = setup({ resolve: () => detail.promise })
  const resolving = controller.select({ id: 'library' })
  controller.search('')
  detail.resolve({ lat: -34.92, lng: 138.6 })
  await resolving
  assert.deepEqual(selections, [null])
  assert.equal(states.at(-1).status, 'idle')
  controller.dispose()
})

test('provider errors become visible and unmount suppresses late updates', async () => {
  const request = deferred()
  const { controller, states } = setup({ suggest: () => request.promise })
  controller.search('library')
  await pause(5)
  request.reject(new Error('provider unavailable'))
  await pause(0)
  assert.equal(states.at(-1).status, 'error')
  controller.dispose()

  const late = deferred()
  const next = setup({ resolve: () => late.promise })
  const pending = next.controller.select({ id: 'library' })
  next.controller.dispose()
  late.resolve({ lat: 1, lng: 2 })
  await pending
  assert.deepEqual(next.selections, [])
})
