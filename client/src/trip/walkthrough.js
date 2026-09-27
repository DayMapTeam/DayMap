import { DAY_END_ID, distanceMeters, isValidPoint, tripStops } from './tripRules.js'
import { routeSegments } from './navigation.js'

/** Adjacent located events in the accepted plan, in planner order. */
export function walkPairs(plan) {
  const stops = tripStops(plan)
  return stops.slice(1).map((to, index) => ({
    id: `${stops[index].id}:${to.id}`,
    from: stops[index],
    to,
  })).filter(({ from, to }) => distanceMeters(from.location, to.location) > 10)
}

export const DAY_START_ID = 'day-start'
const routeSamples = new WeakMap()

/** Home/day start, every located timed event, then the optional day end. */
export function dayRunStops(plan) {
  if (!isValidPoint(plan.startPlace)) return []
  const start = { id: DAY_START_ID, title: plan.startPlace.label, location: plan.startPlace,
    timing: { scheduledEndAt: null, scheduledStartAt: null } }
  return [start, ...tripStops(plan)]
}

export function dayRunIssue(plan) {
  if (!isValidPoint(plan.startPlace)) return 'Set a located Day start (such as Home) in the planner first.'
  const missing = plan.stops.find((stop) => stop.status === 'planned' && stop.timing.kind !== 'all-day' &&
    !isValidPoint(stop.location))
  if (missing) return `Set a map location for “${missing.title}” before running the whole day.`
  if (!tripStops(plan).some((stop) => stop.id !== DAY_END_ID)) return 'Add at least one located event to run the whole day.'
  return null
}

/** Visit same-place events without asking Google for a zero-distance route. */
export function nextDayLeg(plan, from, completedIds) {
  const completed = new Set(completedIds)
  let origin = from
  const itinerary = dayRunStops(plan)
  const index = itinerary.findIndex((stop) => stop.id === from.id)
  for (const stop of itinerary.slice(index < 0 ? 1 : index + 1)) {
    if (completed.has(stop.id)) continue
    if (distanceMeters(origin.location, stop.location) < 10) {
      completed.add(stop.id)
      origin = stop
      continue
    }
    return { from: origin, to: stop, completedIds: [...completed] }
  }
  return { from: origin, to: null, completedIds: [...completed] }
}

/** Move along Google's path geometry, not a line through buildings. */
export function pointAlongRoute(route, fraction) {
  let segments = routeSamples.get(route)
  if (!segments) {
    segments = routeSegments(route)
    routeSamples.set(route, segments)
  }
  if (!segments.length) return route.path?.[0] ?? null
  const total = segments.at(-1).start + segments.at(-1).length
  const wanted = Math.max(0, Math.min(1, fraction)) * total
  const segment = segments.find((item) => wanted <= item.start + item.length) ?? segments.at(-1)
  const part = segment.length ? Math.max(0, Math.min(1, (wanted - segment.start) / segment.length)) : 1
  return {
    lat: segment.a.lat + (segment.b.lat - segment.a.lat) * part,
    lng: segment.a.lng + (segment.b.lng - segment.a.lng) * part,
  }
}

export function walkStartTime(pair, route) {
  const end = Date.parse(pair.from.timing.scheduledEndAt)
  if (Number.isFinite(end)) return end
  const start = Date.parse(pair.to.timing.scheduledStartAt)
  return Number.isFinite(start) ? start - route.seconds * 1000 : Date.now()
}
