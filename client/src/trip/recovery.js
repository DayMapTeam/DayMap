import { buildTimeline, stopInterval } from '../../../shared/planning/timeline.js'
import { planDayBounds } from '../../../shared/planning/dayBounds.js'
import { validateStopEdit } from '../app/planEdits.js'
import { TRAVEL_BUFFERS } from '../services/planningContext.js'
import { distanceMeters, isAt, isValidPoint } from './tripRules.js'

export const RECOVERY = Object.freeze({ freshnessMs: 60000, locationAgeMs: 30000, movementMeters: 75, horizonMs: 90 * 60000 })
export const MODE_NAMES = { walk: 'Walk', transit: 'Public transport', drive: 'Drive' }

/** Only the immediate appointment: never skip an unknown destination to recommend a later one. */
export function recoveryTarget(plan, trip, now) {
  const stops = buildTimeline(plan)
  if (trip.target) return stops.find((stop) => stop.id === trip.target.id && stop.status === 'planned') ?? null
  const at = stops.findIndex((stop) => stop.id === trip.atStop?.id)
  return stops.slice(at + 1).find((stop) => stop.status === 'planned' && stopInterval(stop).end > now) ?? null
}

export function freshPosition(position, status, now) {
  return status === 'on' && isValidPoint(position) && Number.isFinite(position.accuracy) && position.accuracy <= 100
    && Number.isFinite(position.observedAt) && now >= position.observedAt && now - position.observedAt <= RECOVERY.locationAgeMs
}

export function recoveryKey(plan, target) {
  return JSON.stringify([plan.id, plan.version, target?.id, target?.location, target?.timing, target?.travelMode])
}

export function currentRecovery(snapshot, { key, from, now }) {
  return snapshot.key === key && snapshot.status === 'ready' && isValidPoint(from)
    && now >= snapshot.departAt && now - snapshot.departAt < RECOVERY.freshnessMs
    && distanceMeters(from, snapshot.from) <= RECOVERY.movementMeters
}

// A transit departure is usable only while its walking approaches and transfers can still be made.
export function catchableTransit(route, now) {
  let cursor = now
  let rides = 0
  for (const step of route.steps ?? []) {
    if (step.kind !== 'ride') {
      if (!Number.isFinite(step.seconds) || step.seconds < 0) return false
      cursor += step.seconds * 1000
      continue
    }
    const depart = Date.parse(step.ride?.departAt)
    const arrive = Date.parse(step.ride?.arriveAt)
    if (!Number.isFinite(depart) || !Number.isFinite(arrive) || cursor > depart || arrive < depart) return false
    cursor = arrive
    rides++
  }
  return rides > 0
}

/** Compare arrival INCLUDING the transition/parking buffer. Unknown routes are never zero minutes. */
export function recoveryOptions(snapshot, target, now, carAvailable) {
  const start = stopInterval(target)?.start
  if (!Number.isFinite(start)) return []
  return snapshot.results.flatMap(({ mode, route }) => {
    if (!route || (mode === 'drive' && !carAvailable) || !Number.isFinite(route.seconds) || route.seconds <= 0) return []
    if (mode === 'transit' && !snapshot.demo && !catchableTransit(route, now)) return []
    let arriveAt = now + route.seconds * 1000
    if (mode === 'transit' && !snapshot.demo) {
      const lastRide = route.steps.findLastIndex((step) => step.kind === 'ride')
      const finalWalk = route.steps.slice(lastRide + 1).reduce((sum, step) => sum + step.seconds, 0)
      arriveAt = Date.parse(route.steps[lastRide].ride.arriveAt) + finalWalk * 1000
    }
    if (arriveAt < now) return []
    const readyAt = arriveAt + TRAVEL_BUFFERS[mode] * 60000
    let leaveAt = start - route.seconds * 1000 - TRAVEL_BUFFERS[mode] * 60000
    if (mode === 'transit' && !snapshot.demo) {
      const firstRide = route.steps.findIndex((step) => step.kind === 'ride')
      const approachSeconds = route.steps.slice(0, firstRide).reduce((sum, step) => sum + step.seconds, 0)
      leaveAt = Date.parse(route.steps[firstRide].ride.departAt) - approachSeconds * 1000
    }
    return [{ mode, route, arriveAt, readyAt, leaveAt, lateMinutes: Math.max(0, Math.ceil((readyAt - start) / 60000)),
      minutes: Math.ceil((readyAt - now) / 60000), bufferMinutes: TRAVEL_BUFFERS[mode] }]
  }).sort((a, b) => a.readyAt - b.readyAt || a.mode.localeCompare(b.mode))
}

export function recoveryAdvice(options, currentMode, now) {
  const current = options.find((option) => option.mode === currentMode)
  const best = options[0]
  if (!best) return { kind: 'unknown', label: 'Check trip', best: null, current: null }
  if (!current) return { kind: 'unknown', label: 'Compare routes', best, current: null, alternative: null }
  const baseline = current
  const minutesUntilLeave = Math.floor((baseline.leaveAt - now) / 60000)
  const alternative = current && best.mode !== currentMode && current.readyAt - best.readyAt >= 2 * 60000 ? best : null
  if (baseline.lateMinutes > 0) return { kind: 'late', label: `${baseline.lateMinutes} min late`, best, current, alternative }
  if (minutesUntilLeave <= 5) return { kind: 'due', label: 'Leave now', best, current, alternative }
  if (minutesUntilLeave <= 10) return { kind: 'soon', label: 'Leave soon', best, current, alternative }
  return { kind: 'early', label: `Leave in ${minutesUntilLeave} min`, best, current, alternative }
}

/** A later start is a draft to review, never an accepted change or a claim that the rest of the day fits. */
export function laterStartEdit(plan, target, option, now) {
  if (!option || target.status !== 'planned' || target.timing.kind !== 'flexible') return null
  const interval = stopInterval(target)
  if (!interval || interval.end <= now || option.lateMinutes === 0) return null
  const start = Math.ceil(Math.max(now, option.readyAt) / 300000) * 300000
  const end = start + interval.end - interval.start
  if (end > planDayBounds(plan.date, plan.timezone).end) return null
  const edit = { title: target.title, scheduledStartAt: new Date(start).toISOString(), scheduledEndAt: new Date(end).toISOString() }
  return validateStopEdit(target, edit) === null ? edit : null
}

export function atRecoveryDestination(from, target) {
  return isValidPoint(from) && isValidPoint(target?.location) && isAt(from, target)
}
