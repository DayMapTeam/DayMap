import { sortStopsForDisplay } from '../../../shared/planning/timeline.js'

const hasPin = (location) => Boolean(location) && Number.isFinite(location.lat) && Number.isFinite(location.lng)

/**
 * Display numbers for the pinned stops: 1, 2, 3… in the planner's time order,
 * so deleting or retiming a stop never leaves a gap or an out-of-order pin.
 * Stops without a location have no pin, so they don't take a number. The map
 * pins and the popup both read this, so they always match.
 *
 * @returns {Map<string, number>} stop ID → number
 */
export function numberStops(stops) {
  const pinned = sortStopsForDisplay(stops).filter((stop) => hasPin(stop.location))
  return new Map(pinned.map((stop, index) => [stop.id, index + 1]))
}
