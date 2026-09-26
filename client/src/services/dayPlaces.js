import { buildTimeline, stopInterval } from '../../../shared/planning/timeline.js'

const MINUTE = 60000
// Public transport from home is looked up for a departure this long before the first stop.
const START_LOOKUP_MINUTES = 45
const iso = (ms) => new Date(ms).toISOString()
const located = (stop) => Number.isFinite(stop.location?.lat) && Number.isFinite(stop.location?.lng)

// A place without times, as a short stop the journey engine can route from or to.
function placeStop(id, place, startMs) {
  return {
    id, title: place.label, source: 'manual', sourceEventId: null, sourceCalendarId: null, location: place, travelMode: null,
    status: 'planned', timing: { kind: 'flexible', durationMinutes: 1, fixedStartAt: null, fixedEndAt: null,
      earliestStartAt: null, latestEndAt: null, scheduledStartAt: iso(startMs), scheduledEndAt: iso(startMs + MINUTE) },
  }
}

function journey(from, to, ctx) {
  const choice = ctx.modeFor?.(from, to)
  const mode = typeof choice === 'string' ? choice : choice?.mode
  const departAt = iso(stopInterval(from).end)
  const request = { from, to, mode, departAt }
  const estimate = ctx.travel?.(from, to, { mode, departAt })
  const buffer = ctx.buffers?.[mode]
  if (estimate?.status !== 'ready' || !Number.isFinite(estimate.travelSeconds) || !Number.isFinite(buffer)) {
    return { leg: { status: estimate?.status === 'unavailable' ? 'unavailable' : 'stale' }, request }
  }
  return {
    leg: { status: 'ready', provider: estimate.provider ?? 'supplied', mode, modeSource: choice?.source ?? 'auto',
      fromStopId: from.id, toStopId: to.id, departAt, travelSeconds: estimate.travelSeconds, bufferSeconds: buffer * 60 },
    request,
  }
}

/**
 * Where the day starts and ends, with the journeys from the start place to
 * the first stop (and when to leave for it) and from the last stop to the end
 * place. `request` says what to fetch while an estimate is missing.
 */
export function dayBookends(plan, ctx) {
  const timed = buildTimeline(plan).filter((stop) => stop.status !== 'skipped' && stopInterval(stop) && located(stop))
  const first = timed[0] ?? null
  const last = timed.at(-1) ?? null
  let start = null
  let end = null
  if (plan.startPlace) {
    start = { place: plan.startPlace, stop: first, leg: null, request: null }
    if (first) {
      const from = placeStop('day-start', plan.startPlace, stopInterval(first).start - (START_LOOKUP_MINUTES + 1) * MINUTE)
      const { leg, request } = journey(from, first, ctx)
      // Leave in time to arrive as the first stop starts.
      start = { ...start, from, request, leg: leg.status === 'ready'
        ? { ...leg, departAt: iso(stopInterval(first).start - (leg.travelSeconds + leg.bufferSeconds) * 1000) } : leg }
    }
  }
  if (plan.endPlace) {
    end = { place: plan.endPlace, stop: last, leg: null, request: null }
    if (last) {
      const to = placeStop('day-end', plan.endPlace, stopInterval(last).end + MINUTE)
      const { leg, request } = journey(last, to, ctx)
      end = { ...end, to, leg, request }
    }
  }
  return { start, end }
}
