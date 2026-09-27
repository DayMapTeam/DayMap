import { routePairKey } from './walkingRoutes.js'

const idle = Object.freeze({ status: 'idle' })
const pending = Object.freeze({ status: 'pending' })

/**
 * The route each planned journey follows, for drawing it on the map. Each
 * journey (and, for public transport, departure) is requested once. Only the
 * path, distance, time and vehicle are kept, in memory for this page only.
 *
 * @param {(request: { from: object, to: object, mode: string, departAt: string }) => Promise<object>} provider
 *   Resolves to a route from navigationRoute.js.
 */
export function createLegRouteStore(provider) {
  let snapshot = new Map()
  const listeners = new Set()
  const publish = (key, value) => {
    snapshot = new Map(snapshot)
    snapshot.set(key, Object.freeze(value))
    for (const listener of listeners) listener()
  }
  const keyOf = ({ from, to, mode, departAt }) => routePairKey(from, to, { mode, departAt })
  return {
    /** `from` and `to` are stops with a { lat, lng } location. */
    request(request) {
      const key = keyOf(request)
      if (!key || snapshot.has(key)) return
      publish(key, pending)
      const { from, to, mode, departAt } = request
      provider({ from: from.location, to: to.location, mode, departAt }).then(
        (route) => publish(key, {
          status: 'ready',
          path: route.path,
          distanceMeters: route.distanceMeters,
          seconds: route.seconds,
          vehicle: route.steps.find((step) => step.kind === 'ride')?.ride?.vehicle ?? null,
        }),
        () => publish(key, { status: 'error' }),
      )
    },
    lookup(request, results = snapshot) {
      const key = keyOf(request)
      return key ? results.get(key) ?? idle : idle
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
  }
}
