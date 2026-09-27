import { analyzeOverlaps } from './overlaps.js'
import { buildTimeline, stopInterval } from './timeline.js'

const SECOND = 1000
const MINUTE = 60
const pairKey = (from, to) => `${encodeURIComponent(from.id)}:${encodeURIComponent(to.id)}`
const stamp = (ms) => new Date(ms).toISOString()
const located = (stop) => Boolean(stop.location && (
  (typeof stop.location.placeId === 'string' && stop.location.placeId.trim())
  || (Number.isFinite(stop.location.lat) && Math.abs(stop.location.lat) <= 90
    && Number.isFinite(stop.location.lng) && Math.abs(stop.location.lng) <= 180)
))

// Only confirmed place identity permits zero travel; nearby coordinates alone
// do not establish the same entrance/building or zero transfer time.
function samePlace(from, to) {
  return Boolean(from.location?.placeId && from.location.placeId === to.location?.placeId)
}

const LATE_STEP_MS = 5 * 60 * SECOND
const LATE_ATTEMPTS = 3

/**
 * The latest five-minute departure that still arrives in time, with buffer,
 * for a journey the person leaves for just in time. Time-dependent travel
 * (public transport) is looked up again at that departure, and a slower
 * service moves the departure earlier, a few times at most. Null when no
 * later departure is verified yet (the missing estimate joins `pending`) or
 * none fits: the journey then leaves when `from` ends.
 */
function lateDeparture(from, to, { mode, departMs, startMs, bufferSeconds, estimate, ctx, pending }) {
  const timed = mode === 'transit' || estimate.timeDependent
  let travelSeconds = estimate.travelSeconds
  for (let attempt = 0; attempt < LATE_ATTEMPTS; attempt++) {
    const leave = Math.floor((startMs - (travelSeconds + bufferSeconds) * SECOND) / LATE_STEP_MS) * LATE_STEP_MS
    if (leave <= departMs) return null
    const departAt = stamp(leave)
    const found = timed ? ctx.travel?.(from, to, { mode, departAt }) : estimate
    if (!found || found.status === 'pending' || found.status === 'stale') {
      pending.push({ fromStopId: from.id, toStopId: to.id, mode, departAt })
      return null
    }
    if (found.status !== 'ready' || !Number.isFinite(found.travelSeconds) || found.travelSeconds < 0
      || (timed && Date.parse(found.departAt) !== leave)) return null
    if ((startMs - leave) / SECOND - found.travelSeconds - bufferSeconds >= 0) {
      return { departMs: leave, travelSeconds: found.travelSeconds }
    }
    travelSeconds = found.travelSeconds
  }
  return null
}

/**
 * Pure schedule analysis. `travel` is a synchronous lookup, NEVER a fetch.
 * ctx: now (Date or epoch ms), modeFor(from,to), travel(from,to,{mode,departAt}),
 * buffers (minutes per mode), freeTimeMin (minutes; defaults to 15).
 * A stop with `leaveTiming: 'late'` is left for just in time: its free time
 * comes before the journey, at the origin (`placement: 'before-travel'`).
 * Lookup: {status:'ready', travelSeconds, provider, timeDependent?, departAt?}
 * or {status:'pending'|'stale'|'unavailable', reason?}. Undefined means pending.
 * Time-dependent estimates must match the exact departure, not a cache bucket.
 */
export function analyzePlan(plan, ctx) {
  const { conflicts, unresolved } = analyzeOverlaps(plan, ctx)
  const now = ctx.now instanceof Date ? ctx.now.getTime() : ctx.now
  const freeTimeMin = ctx.freeTimeMin ?? 15
  if (!Number.isFinite(freeTimeMin) || freeTimeMin < 0) throw new TypeError('Invalid freeTimeMin')
  const legs = []
  const freeTime = []
  const pending = []
  const groups = []

  // Connected overlap groups have no unambiguous physical journey order.
  for (const stop of buildTimeline(plan)) {
    const interval = stopInterval(stop)
    const last = groups.at(-1)
    if (last && interval.start < last.end) {
      last.stops.push(stop)
      last.end = Math.max(last.end, interval.end)
    } else {
      groups.push({ stops: [stop], end: interval.end })
    }
  }

  for (const group of groups) {
    if (group.stops.length > 1 && group.end > now && group.stops.some((stop) => stop.status !== 'completed')) {
      const stopIds = group.stops.map((stop) => stop.id).sort()
      unresolved.push({ id: `ambiguous-order:${stopIds.map(encodeURIComponent).join(':')}`, code: 'ambiguous-order', stopIds })
    }
  }

  for (let index = 1; index < groups.length; index++) {
    const previous = groups[index - 1]
    const next = groups[index]
    if (next.end <= now || next.stops.every((stop) => stop.status === 'completed')) continue
    if (previous.stops.length > 1 || next.stops.length > 1) {
      const stopIds = [...previous.stops, ...next.stops].map((stop) => stop.id)
      unresolved.push({ id: `ambiguous-journey:${stopIds.map(encodeURIComponent).join(':')}`, code: 'ambiguous-journey', stopIds })
      continue
    }

    const from = previous.stops[0]
    const to = next.stops[0]
    const key = pairKey(from, to)
    const departMs = stopInterval(from).end
    const startMs = stopInterval(to).start
    const departAt = stamp(departMs)
    const modeChoice = ctx.modeFor?.(from, to)
    const mode = typeof modeChoice === 'string' ? modeChoice : modeChoice?.mode
    const leg = {
      id: `leg:${key}`, fromStopId: from.id, toStopId: to.id,
      mode: mode ?? null, modeSource: modeChoice?.source ?? 'preset',
      departAt, arriveAt: null, travelSeconds: null, spareSeconds: null,
      provider: null, status: 'unavailable', reason: null,
    }
    legs.push(leg)
    const markUnknown = (reason, status = 'unavailable', request = false) => {
      leg.status = status
      leg.reason = reason
      unresolved.push({ id: `${reason}:${key}`, code: reason, stopIds: [from.id, to.id] })
      if (request) pending.push({ fromStopId: from.id, toStopId: to.id, mode, departAt })
    }

    if (!located(from) || !located(to)) { markUnknown('missing-location'); continue }
    // A static plan cannot know actual progress after departure. A future
    // location/manual-progress feature can supply a new "you, now" origin.
    if (departMs < now) { markUnknown('progress-unknown'); continue }
    const identicalPlace = samePlace(from, to)
    if (!identicalPlace && !['walk', 'transit', 'drive'].includes(mode)) { markUnknown('missing-mode'); continue }
    const bufferMinutes = identicalPlace ? 0 : ctx.buffers?.[mode]
    if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0) { markUnknown('missing-buffer'); continue }
    const estimate = identicalPlace
      ? { status: 'ready', travelSeconds: 0, provider: 'same-place' }
      : ctx.travel?.(from, to, { mode, departAt })
    if (!estimate || estimate.status === 'pending') { markUnknown('pending', 'stale', true); continue }
    if (estimate.status === 'stale') { markUnknown('stale-estimate', 'stale', true); continue }
    if (estimate.status !== 'ready') { markUnknown(estimate.reason ?? 'travel-unavailable'); continue }
    if (!Number.isFinite(estimate.travelSeconds) || estimate.travelSeconds < 0) { markUnknown('invalid-estimate'); continue }
    if ((mode === 'transit' || estimate.timeDependent)
      && !identicalPlace && Date.parse(estimate.departAt) !== departMs) {
      markUnknown('departure-unverified', 'stale', true)
      continue
    }

    const gapSeconds = (startMs - departMs) / SECOND
    const bufferSeconds = bufferMinutes * MINUTE
    const early = estimate.travelSeconds
    // Leaving just in time moves the free time to the origin, before travel.
    const late = !identicalPlace && to.leaveTiming === 'late' && gapSeconds - early - bufferSeconds > 0
      ? lateDeparture(from, to, { mode, departMs, startMs, bufferSeconds, estimate, ctx, pending }) : null
    const legDepartMs = late?.departMs ?? departMs
    const travelSeconds = late?.travelSeconds ?? early
    const spareSeconds = (startMs - legDepartMs) / SECOND - travelSeconds - bufferSeconds
    Object.assign(leg, {
      status: 'ready', provider: estimate.provider ?? 'supplied',
      departAt: stamp(legDepartMs), travelSeconds, bufferSeconds, spareSeconds,
      arriveAt: stamp(legDepartMs + travelSeconds * SECOND),
    })
    if (spareSeconds < 0) {
      const lateSeconds = Math.max(0, travelSeconds - gapSeconds)
      const code = lateSeconds > 0 ? 'late' : 'tight'
      conflicts.push({
        id: `${code}:${key}`, code, severity: code === 'late' ? 'error' : 'warning',
        stopIds: [from.id, to.id], minutes: Math.ceil(-spareSeconds / MINUTE),
        lateMinutes: Math.ceil(lateSeconds / MINUTE),
        needsDecision: from.timing.kind === 'fixed' && to.timing.kind === 'fixed',
        factsKey: JSON.stringify({ departAt, startAt: stamp(startMs), mode, travelSeconds, bufferSeconds, provider: leg.provider }),
      })
    } else if (late) {
      const minutes = (late.departMs - departMs) / SECOND / MINUTE
      // Sized by the time the day has spare, so it stays shown (and movable back).
      if (gapSeconds - early - bufferSeconds >= freeTimeMin * MINUTE) {
        freeTime.push({
          id: `free:${key}`, fromStopId: from.id, toStopId: to.id,
          // A concrete free interval at the origin, before leaving just in time.
          locationStopId: from.id, placement: 'before-travel',
          startAt: stamp(departMs), endAt: stamp(late.departMs), minutes, provider: leg.provider,
        })
      }
    } else if (spareSeconds >= freeTimeMin * MINUTE && spareSeconds > 0) {
      freeTime.push({
        id: `free:${key}`, fromStopId: from.id, toStopId: to.id,
        // A concrete free interval at the destination after travelling there.
        locationStopId: to.id, placement: 'after-travel',
        startAt: stamp(departMs + (travelSeconds + bufferSeconds) * SECOND),
        endAt: stamp(startMs), minutes: spareSeconds / MINUTE, provider: leg.provider,
      })
    }
  }

  return {
    legs, conflicts, unresolved, freeTime, pending,
    summary: {
      errors: conflicts.filter((conflict) => conflict.severity === 'error').length,
      warnings: conflicts.filter((conflict) => conflict.severity === 'warning').length,
      unresolved: unresolved.length,
      freeMinutes: freeTime.reduce((sum, gap) => sum + gap.minutes, 0),
    },
  }
}
