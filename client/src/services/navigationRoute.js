import { normalizeRide } from './transitOptions.js'

const TRAVEL_MODES = { walk: 'WALKING', transit: 'TRANSIT', drive: 'DRIVING' }

const valid = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
const points = (path) => (path ?? []).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })).filter(valid)
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/**
 * A Google route as plain data for turn-by-turn guidance: the whole path and
 * each step with its instruction, manoeuvre, distance, time and path. Rides
 * carry their line, stops and times. Kept in memory for the trip only.
 *
 * @param {object} route A Maps JS `Route`.
 * @param {'walk' | 'transit' | 'drive'} mode
 */
export function normalizeRoute(route, mode) {
  const steps = (route?.legs?.[0]?.steps ?? []).map((step) => {
    const seconds = Number(step.staticDurationMillis ?? 0) / 1000
    const details = step.travelMode === 'TRANSIT' ? step.transitDetails : null
    const ride = details ? normalizeRide(details, seconds) : null
    return {
      kind: ride ? 'ride' : step.travelMode === 'WALKING' || mode !== 'drive' ? 'walk' : 'drive',
      instruction: text(step.instructions) ?? (ride ? `${ride.vehicle} ${ride.name}${ride.headsign ? ` towards ${ride.headsign}` : ''}` : null),
      maneuver: text(step.maneuver),
      distanceMeters: Number(step.distanceMeters) || 0,
      seconds,
      path: points(step.path),
      ride,
    }
  }).filter((step) => step.path.length >= 2)
  const path = points(route?.path)
  const durationMs = Number(route?.durationMillis)
  return {
    mode,
    path: path.length >= 2 ? path : steps.flatMap((step) => step.path),
    steps,
    distanceMeters: Number(route?.distanceMeters) || steps.reduce((sum, step) => sum + step.distanceMeters, 0),
    seconds: Number.isFinite(durationMs) ? durationMs / 1000 : steps.reduce((sum, step) => sum + step.seconds, 0),
  }
}

/** Routes for navigation through the Maps JavaScript Routes library. */
export function createNavigationRouteProvider(loadLibrary) {
  return async ({ from, to, mode = 'walk', departAt }) => {
    const { Route } = await loadLibrary('routes')
    const { routes } = await Route.computeRoutes({
      origin: { lat: from.lat, lng: from.lng },
      destination: { lat: to.lat, lng: to.lng },
      travelMode: TRAVEL_MODES[mode] ?? 'WALKING',
      fields: ['durationMillis', 'distanceMeters', 'path', 'legs'],
      ...(mode === 'transit' ? { departureTime: new Date(departAt ?? Date.now()) } : {}),
    })
    const route = routes?.[0] ? normalizeRoute(routes[0], mode) : null
    if (!route || route.path.length < 2) throw Object.assign(new Error('No route found'), { code: 'no-route' })
    return route
  }
}
