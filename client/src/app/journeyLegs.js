import { stopInterval } from '../../../shared/planning/timeline.js'
import { formatDuration } from '../components/formatTime.js'
import { distanceMeters, isValidPoint } from '../trip/tripRules.js'

const MODES = ['walk', 'transit', 'drive']
const MODE_WORDS = { walk: 'Walk', drive: 'Drive', transit: 'Transit' }
// Stops closer than this share a spot: there is no line to draw.
const MIN_METERS = 10

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
 * The travel chip's text: how you travel and for how long, e.g. "Walk · 22 min".
 * Without a known time it is just the way of travelling.
 *
 * @param {'walk' | 'transit' | 'drive'} mode
 * @param {number | null} seconds
 */
export function legLabel(mode, seconds) {
  const word = MODE_WORDS[mode] || 'Travel'
  if (!Number.isFinite(seconds) || seconds < 0) return word
  return `${word} · ${formatDuration(Math.max(1, Math.ceil(seconds / 60)))}`
}

/**
 * The journeys to draw on the map, as { id, state, path, label }. `path` is
 * just the two stops, [from, to]: the map draws a direct
 * destination line between them, not the roads. Journeys without both ends
 * pinned, without a way of travelling, or between two places at the same
 * spot are left out.
 *
 * @param {object[]} legs Analysed legs, in travel order.
 * @param {object[]} stops The shown plan's stops.
 * @param {Date | number} now
 */
export function buildJourneyLegs(legs, stops, now) {
  const timed = legs.flatMap((leg) => {
    const to = stops.find((stop) => stop.id === leg.toStopId)
    const departMs = Date.parse(leg.departAt)
    const arriveMs = leg.arriveAt ? Date.parse(leg.arriveAt) : stopInterval(to ?? {})?.start
    return Number.isFinite(departMs) && Number.isFinite(arriveMs) ? [{ leg, id: leg.id, departMs, arriveMs }] : []
  })
  const states = legStates(timed, now)
  return timed.flatMap(({ leg }) => {
    if (!MODES.includes(leg.mode) || leg.provider === 'same-place') return []
    const from = stops.find((stop) => stop.id === leg.fromStopId)?.location
    const to = stops.find((stop) => stop.id === leg.toStopId)?.location
    if (!isValidPoint(from) || !isValidPoint(to)) return []
    if (distanceMeters(from, to) < MIN_METERS) return []
    return [{
      id: leg.id,
      state: states.get(leg.id),
      path: [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }],
      // The planner's estimate, so the chip and the planner agree.
      label: legLabel(leg.mode, leg.status === 'ready' ? leg.travelSeconds : null),
    }]
  })
}
