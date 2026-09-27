import { stopInterval } from '../../../shared/planning/timeline.js'
import { formatDuration } from '../components/formatTime.js'
import { isValidPoint } from '../trip/tripRules.js'

const MODES = ['walk', 'transit', 'drive']
const MODE_WORDS = { walk: 'Walk', drive: 'Drive', transit: 'Transit' }

/**
 * Where each journey stands at `now`, in travel order: `done` once it has
 * arrived; `current` while under way, or else the next to leave; `next` for
 * the one after that; `later` for the rest.
 *
 * @param {{ id: string, departMs: number, arriveMs: number }[]} legs In travel order.
 * @param {Date | number} now
 * @returns {Map<string, 'done' | 'current' | 'next' | 'later'>}
 */
export function legStates(legs, now) {
  const time = now instanceof Date ? now.getTime() : now
  let current = legs.findIndex((leg) => leg.departMs <= time && time < leg.arriveMs)
  if (current === -1) current = legs.findIndex((leg) => leg.departMs > time)
  return new Map(legs.map((leg, index) => {
    if (leg.arriveMs <= time) return [leg.id, 'done']
    if (index === current) return [leg.id, 'current']
    if (current !== -1 && index === current + 1) return [leg.id, 'next']
    return [leg.id, 'later']
  }))
}

/**
 * The travel chip's text: how you travel and for how long, e.g. "Bus · 22 min".
 * Without a known time it is just the way of travelling.
 *
 * @param {'walk' | 'transit' | 'drive'} mode
 * @param {number | null} seconds
 * @param {string | null} [vehicle] For public transport, e.g. "Bus".
 */
export function legLabel(mode, seconds, vehicle = null) {
  const word = (mode === 'transit' && vehicle) || MODE_WORDS[mode] || 'Travel'
  if (!Number.isFinite(seconds) || seconds < 0) return word
  return `${word} · ${formatDuration(Math.max(1, Math.ceil(seconds / 60)))}`
}

/**
 * What to ask the route store for one analysed leg: both ends pinned, a way
 * of travelling, and the leg's own departure. Null when it can't be drawn.
 */
export function routeRequest(leg, stops) {
  if (!MODES.includes(leg.mode) || leg.provider === 'same-place') return null
  const from = stops.find((stop) => stop.id === leg.fromStopId)
  const to = stops.find((stop) => stop.id === leg.toStopId)
  if (!isValidPoint(from?.location) || !isValidPoint(to?.location)) return null
  return { from, to, mode: leg.mode, departAt: leg.departAt }
}

/**
 * The journeys to draw on the map, as { id, mode, state, path, distanceMeters,
 * label }. Only journeys whose route has arrived are included: a journey is
 * never drawn as a straight line between its pins.
 *
 * @param {object[]} legs Analysed legs, in travel order.
 * @param {object[]} stops The shown plan's stops.
 * @param {Date | number} now
 * @param {(request: object) => object} lookup Route store lookup.
 */
export function buildRouteLegs(legs, stops, now, lookup) {
  const timed = legs.flatMap((leg) => {
    const to = stops.find((stop) => stop.id === leg.toStopId)
    const departMs = Date.parse(leg.departAt)
    const arriveMs = leg.arriveAt ? Date.parse(leg.arriveAt) : stopInterval(to ?? {})?.start
    return Number.isFinite(departMs) && Number.isFinite(arriveMs) ? [{ leg, id: leg.id, departMs, arriveMs }] : []
  })
  const states = legStates(timed, now)
  return timed.flatMap(({ leg }) => {
    const request = routeRequest(leg, stops)
    const route = request && lookup(request)
    if (route?.status !== 'ready' || !(route.path?.length >= 2)) return []
    // The planner's estimate when there is one, so the chip and the planner agree.
    const seconds = leg.status === 'ready' ? leg.travelSeconds : route.seconds
    return [{
      id: leg.id,
      mode: leg.mode,
      state: states.get(leg.id),
      path: route.path,
      distanceMeters: route.distanceMeters,
      label: legLabel(leg.mode, seconds, route.vehicle),
    }]
  })
}
