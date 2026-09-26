import { planDayBounds } from '../../../shared/planning/dayBounds.js'
import { buildTimeline } from '../../../shared/planning/timeline.js'

// Trip rules. Everything here is pure: positions come in as readings
// ({ lat, lng, accuracy } in metres), and trip state is UI state that never
// changes the plan.

export const RULES = Object.freeze({
  // Within this distance of a stop counts as being there.
  arriveMeters: 50,
  // Further than this from the stop you are at counts as having left it.
  departMeters: 150,
  // GPS accuracy widens both circles, up to this much, so jitter is not movement.
  maxAccuracyBonusMeters: 50,
  // Readings worse than this are ignored entirely.
  ignoreAccuracyAboveMeters: 200,
  arriveReadings: 2,
  departReadings: 3,
})

// The same straight-line walking assumptions as the demo travel estimate.
const DETOUR_FACTOR = 1.3
const WALKING_METERS_PER_SECOND = 1.3
const EARTH_RADIUS_METERS = 6371000
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

const rad = (degrees) => degrees * Math.PI / 180

export function isValidPoint(point) {
  return Boolean(point) && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
}

/** Great-circle distance in metres. */
export function distanceMeters(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
}

/** Initial compass bearing from a to b, 0–360 degrees clockwise from north. */
export function bearingDegrees(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat))
    - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/** The point `meters` from `from` along `bearing` degrees. */
export function offsetPoint(from, bearing, meters) {
  const angular = meters / EARTH_RADIUS_METERS
  const lat1 = rad(from.lat)
  const lng1 = rad(from.lng)
  const theta = rad(bearing)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta))
  const lng2 = lng1 + Math.atan2(Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: lat2 * 180 / Math.PI, lng: ((lng2 * 180 / Math.PI + 540) % 360) - 180 }
}

export function compassLabel(bearing) {
  return COMPASS[Math.round(bearing / 45) % 8]
}

/** Rough walking time for a straight-line distance. Always shown as approximate. */
export function walkingSecondsEstimate(meters) {
  return Math.ceil(meters * DETOUR_FACTOR / WALKING_METERS_PER_SECOND)
}

function accuracyBonus(reading) {
  return Math.min(Math.max(reading.accuracy ?? 0, 0), RULES.maxAccuracyBonusMeters)
}

const arriveRadius = (reading) => RULES.arriveMeters + accuracyBonus(reading)
const departRadius = (reading) => RULES.departMeters + accuracyBonus(reading)

export const DAY_END_ID = 'day-end'

/**
 * Where the day ends (home, a hotel) as the last stop a trip can go to: from
 * the end of the last timed stop until midnight. Null without an end place.
 */
export function dayEndStop(plan) {
  if (!isValidPoint(plan.endPlace)) return null
  const timed = buildTimeline(plan).filter((stop) => stop.timing.kind !== 'all-day' && stop.timing.scheduledEndAt)
  const { start, end } = planDayBounds(plan.date, plan.timezone)
  const from = timed.length ? Date.parse(timed.at(-1).timing.scheduledEndAt) : start
  const iso = (ms) => new Date(ms).toISOString()
  return {
    id: DAY_END_ID, title: plan.endPlace.label, source: 'manual', sourceEventId: null, sourceCalendarId: null,
    location: plan.endPlace, travelMode: null, status: 'planned',
    timing: { kind: 'flexible', durationMinutes: null, fixedStartAt: null, fixedEndAt: null, earliestStartAt: null,
      latestEndAt: null, scheduledStartAt: iso(Math.min(from, end - 60000)), scheduledEndAt: iso(end) },
  }
}

// Timed, not skipped, on the map, in time order, then where the day ends.
// Includes completed stops, which you can still be at.
function locatedStops(plan) {
  const stops = buildTimeline(plan).filter((stop) => isValidPoint(stop.location))
  const end = dayEndStop(plan)
  return end ? [...stops, end] : stops
}

/** Stops a trip can go to: planned, timed and on the map, in time order. */
export function tripStops(plan) {
  return locatedStops(plan).filter((stop) => stop.status === 'planned')
}

/**
 * The stop to head to next: the one after the stop you are at, or otherwise
 * the first that has not ended yet. Stops that already ended are skipped.
 */
export function nextStopFor(plan, { atStopId = null, now }) {
  const stops = locatedStops(plan)
  const time = now instanceof Date ? now.getTime() : now
  const at = stops.findIndex((stop) => stop.id === atStopId)
  return stops.slice(at + 1)
    .find((stop) => stop.status === 'planned' && Date.parse(stop.timing.scheduledEndAt) > time) ?? null
}

/** Google Maps directions for the journey's mode: a plain link, no API request. */
const MAPS_TRAVEL_MODES = { walk: 'walking', transit: 'transit', drive: 'driving' }

export function directionsUrl(location, mode = 'walk', origin = null, { navigate = false } = {}) {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  if (origin) url.searchParams.set('origin', `${origin.lat},${origin.lng}`)
  url.searchParams.set('destination', `${location.lat},${location.lng}`)
  if (location.placeId) url.searchParams.set('destination_place_id', location.placeId.replace(/^places\//, ''))
  url.searchParams.set('travelmode', MAPS_TRAVEL_MODES[mode] ?? 'walking')
  // On a phone this opens Google Maps' own turn-by-turn navigation.
  if (navigate) url.searchParams.set('dir_action', 'navigate')
  return url.toString()
}

export const initialTrip = Object.freeze({
  // 'idle': not navigating. 'navigating': heading to targetId.
  phase: 'idle',
  targetId: null,
  startedBy: null, // 'go' | 'auto'
  // The stop you are at (arrived there, or found there), or null.
  atStopId: null,
  // Where you are settled when not at a stop (for example home): { lat, lng } or null.
  origin: null,
  // Consecutive qualifying readings.
  insideCount: 0,
  outsideCount: 0,
  // After cancelling an automatic start, wait until you come back and leave again.
  suppressed: false,
  // One short message at a time: { kind: 'arrived' | 'auto-started', stopId, key }.
  notice: null,
  noticeKey: 0,
})

function withNotice(state, kind, stopId) {
  const key = state.noticeKey + 1
  return { ...state, notice: { kind, stopId, key }, noticeKey: key }
}

function startTrip(state, stopId, startedBy) {
  return { ...state, phase: 'navigating', targetId: stopId, startedBy, origin: null, insideCount: 0, outsideCount: 0 }
}

// You are at this stop now: nothing to navigate, nothing on the map changes.
function settleAt(state, stopId) {
  return { ...state, phase: 'idle', targetId: null, startedBy: null, atStopId: stopId, origin: null,
    insideCount: 0, outsideCount: 0, suppressed: false }
}

function arrive(state) {
  return withNotice(settleAt(state, state.targetId), 'arrived', state.targetId)
}

function stopById(stops, stopId) {
  return stops.find((stop) => stop.id === stopId) ?? null
}

/** Whether `point` (a reading, or a stop's location) is already at `stop`. */
export function isAt(point, stop) {
  return isValidPoint(point) && isValidPoint(stop?.location)
    && distanceMeters(point, stop.location) <= arriveRadius(point)
}

function navigatingReading(state, reading, plan) {
  const target = stopById(tripStops(plan), state.targetId)
  if (!target) return { ...state, phase: 'idle', targetId: null, startedBy: null, insideCount: 0 }
  const insideCount = isAt(reading, target) ? state.insideCount + 1 : 0
  return insideCount >= RULES.arriveReadings ? arrive(state) : { ...state, insideCount }
}

function idleReading(state, reading, plan, now) {
  const next = nextStopFor(plan, { atStopId: state.atStopId, now })

  // Reaching the next stop without a trip (or already being there) counts as being there.
  if (next && isAt(reading, next)) {
    const insideCount = state.insideCount + 1
    if (insideCount >= RULES.arriveReadings) return settleAt(state, next.id)
    return { ...state, insideCount, outsideCount: 0 }
  }

  // Where you are settled: the stop you are at, or otherwise the first place DayMap saw you.
  const at = state.atStopId === null ? null : stopById(locatedStops(plan), state.atStopId)
  const anchor = at?.location ?? state.origin
  if (!anchor) return { ...state, atStopId: null, origin: { lat: reading.lat, lng: reading.lng }, insideCount: 0, outsideCount: 0 }
  const distance = distanceMeters(reading, anchor)
  if (distance <= arriveRadius(reading)) {
    // Back where you were: a cancelled start may happen again.
    return { ...state, insideCount: 0, outsideCount: 0, suppressed: false }
  }
  if (distance <= departRadius(reading)) return { ...state, insideCount: 0, outsideCount: 0 }

  // You've left: head to the next stop in the planner.
  const outsideCount = state.outsideCount + 1
  const base = { ...state, insideCount: 0, outsideCount }
  if (outsideCount < RULES.departReadings || state.suppressed || !next) return base
  return withNotice(startTrip(base, next.id, 'auto'), 'auto-started', next.id)
}

/**
 * Trip state machine. Actions:
 * - reading { reading, plan, now }: a new position.
 * - go { stopId, plan, reading }: Go (or Directions on a pin). If you are already
 *   there (by position, or at a stop in the same place) it just records that.
 * - end: stop navigating. Ending an automatic start waits until you come back and leave again.
 * - arrive: "I'm here".
 * - sync { plan }: the plan changed; forget stops that are gone.
 * - clear-notice { key }
 */
export function tripReducer(state, action) {
  switch (action.type) {
    case 'reading': {
      const { reading, plan, now } = action
      if (!isValidPoint(reading) || (reading.accuracy ?? 0) > RULES.ignoreAccuracyAboveMeters) return state
      return state.phase === 'navigating'
        ? navigatingReading(state, reading, plan)
        : idleReading(state, reading, plan, now)
    }
    case 'go': {
      const target = action.plan ? stopById(tripStops(action.plan), action.stopId) : null
      const atStop = action.plan && state.atStopId !== null ? stopById(locatedStops(action.plan), state.atStopId) : null
      const reading = isValidPoint(action.reading) ? action.reading : null
      if (target && (isAt(reading, target) || (!reading && atStop && isAt(atStop.location, target)))) {
        return settleAt(state, target.id)
      }
      return startTrip(state, action.stopId, 'go')
    }
    case 'end':
      if (state.phase !== 'navigating') return state
      return { ...state, phase: 'idle', targetId: null, startedBy: null, insideCount: 0,
        suppressed: state.startedBy === 'auto' || state.suppressed,
        notice: state.notice?.kind === 'auto-started' ? null : state.notice }
    case 'arrive':
      return state.phase === 'navigating' ? arrive(state) : state
    case 'sync': {
      const targets = new Set(tripStops(action.plan).map((stop) => stop.id))
      const located = new Set(locatedStops(action.plan).map((stop) => stop.id))
      let next = state
      if (next.phase === 'navigating' && !targets.has(next.targetId)) {
        next = { ...next, phase: 'idle', targetId: null, startedBy: null, insideCount: 0 }
      }
      if (next.atStopId !== null && !located.has(next.atStopId)) next = { ...next, atStopId: null, outsideCount: 0 }
      return next
    }
    case 'clear-notice':
      return state.notice?.key === action.key ? { ...state, notice: null } : state
    default:
      return state
  }
}
