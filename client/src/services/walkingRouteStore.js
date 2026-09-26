import { routeErrorReason, routePairKey } from './walkingRoutes.js'

const missing = Object.freeze({ status: 'unavailable', reason: 'missing-location' })
const pending = Object.freeze({ status: 'pending' })

/**
 * Active-session results only: no localStorage, database, geometry or API keys.
 * Pairs are `{ from, to, mode?, departAt? }`; mode defaults to walking and
 * public transport needs the departure time.
 */
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
  async function call(from, destinations, options) {
    let timer
    try {
      return await Promise.race([
        provider(from, destinations, options),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Routes timeout')), timeoutMs) }),
      ])
    } finally { clearTimeout(timer) }
  }
  async function execute(batch) {
    const { from, options, pairs } = batch
    let result
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await call(from, pairs.map((pair) => pair.to), options)
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
    for (const { from, to, mode = 'walk', departAt = null } of pairs) {
      const key = routePairKey(from, to, { mode, departAt })
      if (!key || seen.has(key)) continue
      seen.add(key)
      const old = snapshot.get(key)
      if (old && !(retry && old.status === 'unavailable')) continue
      // One request per origin, mode and (for public transport) departure.
      const [, origin, , departure = null] = JSON.parse(key)
      const groupKey = JSON.stringify([mode, origin, departure])
      if (!groups.has(groupKey)) groups.set(groupKey, { from: structuredClone(from), options: { mode, departAt: departure }, pairs: [] })
      groups.get(groupKey).pairs.push({ key, to: structuredClone(to) })
      knownPairs.set(key, { from: structuredClone(from), to: structuredClone(to), mode, departAt: departure })
      updates.push([key, pending])
    }
    if (!updates.length) return
    // 1 origin × at most 25 destinations is safely below matrix/waypoint limits.
    for (const { from, options, pairs: group } of groups.values()) {
      for (let i = 0; i < group.length; i += 25) queue.push({ from, options, pairs: group.slice(i, i + 25) })
    }
    publish(updates)
    pump()
  }
  return {
    request,
    retryFailures() { request([...knownPairs.values()], { retry: true }) },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot,
    lookup(from, to, { mode = 'walk', departAt = null, results = snapshot } = {}) {
      const key = routePairKey(from, to, { mode, departAt })
      return key ? results.get(key) ?? pending : missing
    },
  }
}
