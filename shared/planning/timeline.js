/** Read a positive timed interval. Unscheduled/all-day/invalid items return null. */
export function stopInterval(stop) {
  const timing = stop.timing
  if (!timing || timing.kind === 'all-day') return null
  const start = Date.parse(timing.scheduledStartAt)
  const end = Date.parse(timing.scheduledEndAt)
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end }
    : null
}

/**
 * Timed, non-skipped stops, ordered by start, end, then input order.
 * Completed stops remain available for historical context. Neither the input
 * array nor its stops are mutated; returned stops are read-only references.
 */
export function buildTimeline(plan) {
  return plan.stops
    .map((stop, index) => ({ stop, index, interval: stopInterval(stop) }))
    .filter(({ stop, interval }) => stop.status !== 'skipped' && interval !== null)
    .sort((a, b) => a.interval.start - b.interval.start
      || a.interval.end - b.interval.end || a.index - b.index)
    .map(({ stop }) => stop)
}

/** Display keeps every stop: all-day, valid timed, then unscheduled/invalid. */
export function sortStopsForDisplay(stops) {
  const group = (stop, interval) => stop.timing?.kind === 'all-day' ? 0 : interval ? 1 : 2
  return stops.map((stop, index) => {
    const interval = stopInterval(stop)
    return { stop, index, interval, group: group(stop, interval) }
  }).sort((a, b) => a.group - b.group
    || (a.group === 1 ? a.interval.start - b.interval.start || a.interval.end - b.interval.end : 0)
    || a.index - b.index)
    .map(({ stop }) => stop)
}
