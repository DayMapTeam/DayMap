import { routeErrorReason, walkingPairKey } from './walkingRoutes.js'

const missing = Object.freeze({ status: 'unavailable', reason: 'missing-location' })
const pending = Object.freeze({ status: 'pending' })

/** Active-session results only: no localStorage, database, geometry or API keys. */
export function createWalkingRouteStore(provider, { timeoutMs = 15000 } = {}) {
  let snapshot = new Map()
  const listeners = new Set()
  const queue = []
  const knownPairs = new Map()
  let running = 0
  const publish = (updates) => {
    snapshot = new Map(snapshot)
    for (const [key, value] of updates) snapshot.set(key, Object.freeze(value))
    for (const listener of listeners) listener()
  }
  async function call(from, destinations) {
    let timer
    try {
      return await Promise.race([
        provider(from, destinations),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Routes timeout')), timeoutMs) }),
      ])
    } finally { clearTimeout(timer) }
  }
  async function execute(batch) {
    const { from, pairs } = batch
    let result
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await call(from, pairs.map((pair) => pair.to))
        break
      } catch (error) {
        const reason = routeErrorReason(error)
        // Auth, quota and a hung transport need an explicit retry. Only one
        // transient transport failure is retried automatically.
        if (attempt === 0 && reason === 'routes-unavailable') continue
        result = pairs.map(() => ({ status: 'unavailable', reason }))
        break
      }
    }
    publish(pairs.map((pair, i) => [pair.key, result?.[i] ?? { status: 'unavailable', reason: 'invalid-route-response' }]))
  }
  function pump() {
    while (running < 2 && queue.length) {
      const batch = queue.shift()
      running++
      execute(batch).finally(() => { running--; pump() })
    }
  }
  function request(pairs, { retry = false } = {}) {
    const groups = new Map()
    const updates = []
    const seen = new Set()
    for (const { from, to } of pairs) {
      const key = walkingPairKey(from, to)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const old = snapshot.get(key)
      if (old && !(retry && old.status === 'unavailable')) continue
      const origin = JSON.parse(key)[1]
      const originKey = JSON.stringify(origin)
      if (!groups.has(originKey)) groups.set(originKey, { from: structuredClone(from), pairs: [] })
      groups.get(originKey).pairs.push({ key, to: structuredClone(to) })
      knownPairs.set(key, { from: structuredClone(from), to: structuredClone(to) })
      updates.push([key, pending])
    }
    if (!updates.length) return
    // 1 origin × at most 25 destinations is safely below matrix/waypoint limits.
    for (const { from, pairs: group } of groups.values()) {
      for (let i = 0; i < group.length; i += 25) queue.push({ from, pairs: group.slice(i, i + 25) })
    }
    publish(updates)
    pump()
  }
  return {
    request,
    retryFailures() { request([...knownPairs.values()], { retry: true }) },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot,
    lookup(from, to, results = snapshot) {
      const key = walkingPairKey(from, to)
      return key ? results.get(key) ?? pending : missing
    },
  }
}
