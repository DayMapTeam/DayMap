export function routeLocation(location) {
  if (typeof location?.placeId === 'string' && location.placeId.trim()) return `places/${location.placeId.trim().replace(/^places\//, '')}`
  if (Number.isFinite(location?.lat) && Math.abs(location.lat) <= 90
    && Number.isFinite(location?.lng) && Math.abs(location.lng) <= 180) return { lat: location.lat, lng: location.lng }
  return null
}

export function walkingPairKey(from, to) {
  const origin = routeLocation(from.location)
  const destination = routeLocation(to.location)
  return origin && destination ? JSON.stringify(['walk', origin, destination]) : null
}

/** Injectable loader keeps provider objects and credentials out of engine/tests. */
export function createWalkingRoutesProvider(loadLibrary) {
  return async (from, destinations) => {
    const { RouteMatrix } = await loadLibrary('routes')
    const { matrix } = await RouteMatrix.computeRouteMatrix({
      origins: [routeLocation(from.location)], destinations: destinations.map((to) => routeLocation(to.location)),
      travelMode: 'WALKING', fields: ['durationMillis', 'distanceMeters', 'condition'],
    })
    return destinations.map((_, index) => {
      const item = matrix?.rows?.[0]?.items?.[index]
      if (item?.condition === 'ROUTE_NOT_FOUND') return { status: 'unavailable', reason: 'no-route' }
      if (item?.error || item?.condition !== 'ROUTE_EXISTS'
        || !Number.isFinite(item.durationMillis) || item.durationMillis < 0) {
        return { status: 'unavailable', reason: 'invalid-route-response' }
      }
      return { status: 'ready', provider: 'google', travelSeconds: item.durationMillis / 1000,
        distanceMeters: item.distanceMeters, timeDependent: false }
    })
  }
}

export function routeErrorReason(error) {
  const message = String(error?.code ?? '') + ' ' + String(error?.message ?? '')
  if (/403|401|denied|not.authorized|api.key|billing|referer/i.test(message)) return 'routes-access-denied'
  if (/429|quota|resource.exhausted/i.test(message)) return 'routes-quota'
  if (/timeout/i.test(message)) return 'routes-timeout'
  return 'routes-unavailable'
}
