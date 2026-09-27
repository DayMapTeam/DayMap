import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { loadMapsLibrary, mapsApiKey } from '../services/googleMaps.js'
import { createLegRouteStore } from '../services/legRouteStore.js'
import { createNavigationRouteProvider } from '../services/navigationRoute.js'
import { buildRouteLegs, routeRequest } from './routeLegs.js'

const googleLegRoutes = createNavigationRouteProvider(loadMapsLibrary)

/**
 * The shown plan's journeys for the map: each one's route (requested once,
 * at its own departure), its state at `now` and its travel chip text.
 *
 * @param {ReturnType<import('./usePlanAnalysis.js').usePlanAnalysis>} planning
 * @param {Date} now
 * @returns {{ id: string, mode: string, state: string, path: object[], distanceMeters: number, label: string }[]}
 */
export function useRouteLegs(planning, now) {
  const [store] = useState(() => createLegRouteStore(googleLegRoutes))
  const results = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { analysis: { legs }, shown: { stops }, provider } = planning
  // Simulated travel stays simulated: no Google routes drawn over it.
  const enabled = Boolean(mapsApiKey) && provider === 'google'

  useEffect(() => {
    if (!enabled) return
    for (const leg of legs) {
      const request = routeRequest(leg, stops)
      if (request) store.request(request)
    }
  }, [enabled, store, legs, stops])

  return useMemo(() => (enabled ? buildRouteLegs(legs, stops, now, (request) => store.lookup(request, results)) : []),
    [enabled, store, results, legs, stops, now])
}
