const TRAVEL_MODES = { walk: 'WALKING', transit: 'TRANSIT', drive: 'DRIVING' }

export function routeLocation(location) {
  if (typeof location?.placeId === 'string' && location.placeId.trim()) return `places/${location.placeId.trim().replace(/^places\//, '')}`
  if (Number.isFinite(location?.lat) && Math.abs(location.lat) <= 90
    && Number.isFinite(location?.lng) && Math.abs(location.lng) <= 180) return { lat: location.lat, lng: location.lng }
  return null
}

const isoOrNull = (value) => (Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null)

/**
 * The cache key for one journey. Walking and driving depend only on the two
 * places. Public transport also depends on the exact departure time, which
 * the engine verifies (ARCHITECTURE §9). Null when it can't be requested.
 */
export function routePairKey(from, to, { mode = 'walk', departAt = null } = {}) {
  const origin = routeLocation(from.location)
  const destination = routeLocation(to.location)
  if (!origin || !destination || !TRAVEL_MODES[mode]) return null
  if (mode !== 'transit') return JSON.stringify([mode, origin, destination])
  const departure = isoOrNull(departAt)
  return departure ? JSON.stringify([mode, origin, destination, departure]) : null
}

export function walkingPairKey(from, to) {
  return routePairKey(from, to)
}

/** Injectable loader keeps provider objects and credentials out of engine/tests. */
export function createRoutesProvider(loadLibrary) {
  return async (from, destinations, { mode = 'walk', departAt = null } = {}) => {
    const { RouteMatrix } = await loadLibrary('routes')
    const departure = mode === 'transit' ? isoOrNull(departAt) : null
    const { matrix } = await RouteMatrix.computeRouteMatrix({
      origins: [routeLocation(from.location)], destinations: destinations.map((to) => routeLocation(to.location)),
      travelMode: TRAVEL_MODES[mode], fields: ['durationMillis', 'distanceMeters', 'condition'],
      ...(departure ? { departureTime: new Date(departure) } : {}),
    })
    return destinations.map((_, index) => {
      const item = matrix?.rows?.[0]?.items?.[index]
      if (item?.condition === 'ROUTE_NOT_FOUND') return { status: 'unavailable', reason: 'no-route' }
      if (item?.error || item?.condition !== 'ROUTE_EXISTS'
        || !Number.isFinite(item.durationMillis) || item.durationMillis < 0) {
        return { status: 'unavailable', reason: 'invalid-route-response' }
      }
      return { status: 'ready', provider: 'google', mode, travelSeconds: item.durationMillis / 1000,
        distanceMeters: item.distanceMeters, timeDependent: mode === 'transit', ...(departure ? { departAt: departure } : {}) }
    })
  }
}

export const createWalkingRoutesProvider = createRoutesProvider

export function routeErrorReason(error) {
  const message = String(error?.code ?? '') + ' ' + String(error?.message ?? '')
  if (/403|401|denied|not.authorized|api.key|billing|referer/i.test(message)) return 'routes-access-denied'
  if (/429|quota|resource.exhausted/i.test(message)) return 'routes-quota'
  if (/timeout/i.test(message)) return 'routes-timeout'
  return 'routes-unavailable'
}
