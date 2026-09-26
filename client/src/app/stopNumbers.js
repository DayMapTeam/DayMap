/**
 * Display numbers for stops: their position in the plan, starting at 1. The
 * map pins and the popup both read this, so they always match the planner's
 * order. Unlocated stops keep their number so pins match planner positions.
 *
 * @returns {Map<string, number>} stop ID → number
 */
export function numberStops(stops) {
  return new Map(stops.map((stop, index) => [stop.id, index + 1]))
}
