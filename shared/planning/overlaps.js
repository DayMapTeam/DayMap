import { buildTimeline, stopInterval } from './timeline.js'

/**
 * Time-only analysis. It makes no travel assumptions and never edits the plan.
 * `now` is required (Date or epoch milliseconds), keeping output deterministic.
 * Intervals are half-open: one event ending at another's start is not overlap.
 * Past overlaps and completed/skipped stops do not produce current warnings.
 */
export function analyzeOverlaps(plan, { now }) {
  const nowMs = now instanceof Date ? now.getTime() : now
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a valid Date or epoch milliseconds')

  const conflicts = []
  const unresolved = []
  const seenIds = new Set()
  for (const stop of plan.stops) {
    if (typeof stop.id !== 'string' || !stop.id || seenIds.has(stop.id)) {
      throw new TypeError('Every stop must have a unique non-empty string id')
    }
    seenIds.add(stop.id)
    if (stop.status === 'skipped' || stop.status === 'completed' || stop.timing?.kind === 'all-day') continue
    const timing = stop.timing
    const unscheduled = timing && timing.scheduledStartAt == null && timing.scheduledEndAt == null
    if (!unscheduled && !stopInterval(stop)) {
      unresolved.push({
        id: `invalid-time:${encodeURIComponent(stop.id)}`,
        code: 'invalid-time', stopIds: [stop.id],
      })
    }
  }

  let active = []
  for (const stop of buildTimeline(plan)) {
    if (stop.status === 'completed') continue
    const interval = stopInterval(stop)
    if (interval.end <= nowMs) continue
    active = active.filter((entry) => entry.interval.end > interval.start)
    for (const previous of active) {
      const overlapEnd = Math.min(previous.interval.end, interval.end)
      if (overlapEnd <= nowMs) continue
      // Canonical pair IDs survive reordering and changes in which starts first.
      const pair = [previous.stop, stop].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      conflicts.push({
        id: `overlap:${pair.map((item) => encodeURIComponent(item.id)).join(':')}`,
        code: 'overlap',
        severity: 'error',
        stopIds: pair.map((item) => item.id),
        // Full interval intersection, rounded up for display; not the duration
        // of the containing event and not just the remaining time from now.
        minutes: Math.ceil((overlapEnd - interval.start) / 60000),
        needsDecision: pair.every((item) => item.timing.kind === 'fixed'),
        factsKey: JSON.stringify(pair.map((item) => ({
          id: item.id, status: item.status, kind: item.timing.kind,
          ...stopInterval(item),
        }))),
      })
    }
    active.push({ stop, interval })
  }

  return { conflicts, unresolved }
}
