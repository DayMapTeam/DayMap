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
  // Leaving more than this long before a stop ends asks instead of starting.
  earlyLeaveMinutes: 15,
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

// Timed, not skipped, on the map, in time order. Includes completed stops, which you can still be at.
function locatedStops(plan) {
  return buildTimeline(plan).filter((stop) => isValidPoint(stop.location))
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

/** Google Maps walking directions: a plain link, no API request. */
export function directionsUrl(location) {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('destination', `${location.lat},${location.lng}`)
  if (location.placeId) url.searchParams.set('destination_place_id', location.placeId.replace(/^places\//, ''))
  url.searchParams.set('travelmode', 'walking')
  return url.toString()
}

export const initialTrip = Object.freeze({
  // 'idle': not navigating. 'navigating': heading to targetId.
  phase: 'idle',
  targetId: null,
  startedBy: null, // 'go' | 'auto'
  // The stop you are at (arrived there, or found there), or null.
  atStopId: null,
  // Consecutive qualifying readings.
  insideCount: 0,
  outsideCount: 0,
  // After cancelling an automatic start, wait until you come back and leave again.
  suppressed: false,
  // Left early: asking "Heading to …?" before starting. { toStopId } or null.
  ask: null,
  // One short message at a time: { kind: 'arrived' | 'auto-started', stopId, key }.
  notice: null,
  noticeKey: 0,
})

function withNotice(state, kind, stopId) {
  const key = state.noticeKey + 1
  return { ...state, notice: { kind, stopId, key }, noticeKey: key }
}

function startTrip(state, stopId, startedBy) {
  return { ...state, phase: 'navigating', targetId: stopId, startedBy, ask: null, insideCount: 0, outsideCount: 0 }
}

function arrive(state) {
  return withNotice({ ...state, phase: 'idle', targetId: null, startedBy: null, atStopId: state.targetId,
    insideCount: 0, outsideCount: 0, suppressed: false, ask: null }, 'arrived', state.targetId)
}

function stopById(stops, stopId) {
  return stops.find((stop) => stop.id === stopId) ?? null
}

function navigatingReading(state, reading, plan) {
  const target = stopById(tripStops(plan), state.targetId)
  if (!target) return { ...state, phase: 'idle', targetId: null, startedBy: null, insideCount: 0 }
  const inside = distanceMeters(reading, target.location) <= arriveRadius(reading)
  const insideCount = inside ? state.insideCount + 1 : 0
  return insideCount >= RULES.arriveReadings ? arrive(state) : { ...state, insideCount }
}

function idleReading(state, reading, plan, now) {
  const next = nextStopFor(plan, { atStopId: state.atStopId, now })

  // Reaching the next stop without a trip still counts as being there.
  if (next && distanceMeters(reading, next.location) <= arriveRadius(reading)) {
    const insideCount = state.insideCount + 1
    if (insideCount >= RULES.arriveReadings) {
      return { ...state, atStopId: next.id, insideCount: 0, outsideCount: 0, suppressed: false, ask: null }
    }
    return { ...state, insideCount, outsideCount: 0 }
  }

  const at = state.atStopId === null ? null : stopById(locatedStops(plan), state.atStopId)
  if (!at) return { ...state, atStopId: null, insideCount: 0, outsideCount: 0 }
  const distance = distanceMeters(reading, at.location)
  if (distance <= arriveRadius(reading)) {
    // Back at the stop: a cancelled or declined start may happen again.
    return { ...state, insideCount: 0, outsideCount: 0, suppressed: false, ask: null }
  }
  if (distance <= departRadius(reading)) return { ...state, insideCount: 0, outsideCount: 0 }

  const outsideCount = state.outsideCount + 1
  const base = { ...state, insideCount: 0, outsideCount }
  if (outsideCount < RULES.departReadings || state.suppressed || state.ask || !next) return base
  const time = now instanceof Date ? now.getTime() : now
  const early = time < Date.parse(at.timing.scheduledEndAt) - RULES.earlyLeaveMinutes * 60000
  if (early) return { ...base, ask: { toStopId: next.id } }
  return withNotice(startTrip(base, next.id, 'auto'), 'auto-started', next.id)
}

/**
 * Trip state machine. Actions:
 * - reading { reading, plan, now }: a new position.
 * - go { stopId }: start a trip now (Go, or Directions on a pin).
 * - end: stop navigating. Ending an automatic start waits until you come back and leave again.
 * - arrive: "I'm here".
 * - accept-ask / dismiss-ask: answer "Heading to …?".
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
    case 'go':
      return startTrip(state, action.stopId, 'go')
    case 'end':
      if (state.phase !== 'navigating') return state
      return { ...state, phase: 'idle', targetId: null, startedBy: null, insideCount: 0,
        suppressed: state.startedBy === 'auto' || state.suppressed,
        notice: state.notice?.kind === 'auto-started' ? null : state.notice }
    case 'arrive':
      return state.phase === 'navigating' ? arrive(state) : state
    case 'accept-ask':
      return state.ask ? startTrip(state, state.ask.toStopId, 'auto') : state
    case 'dismiss-ask':
      return state.ask ? { ...state, ask: null, suppressed: true } : state
    case 'sync': {
      const targets = new Set(tripStops(action.plan).map((stop) => stop.id))
      const located = new Set(locatedStops(action.plan).map((stop) => stop.id))
      let next = state
      if (next.phase === 'navigating' && !targets.has(next.targetId)) {
        next = { ...next, phase: 'idle', targetId: null, startedBy: null, insideCount: 0 }
      }
      if (next.atStopId !== null && !located.has(next.atStopId)) next = { ...next, atStopId: null, outsideCount: 0 }
      if (next.ask && !targets.has(next.ask.toStopId)) next = { ...next, ask: null }
      return next
    }
    case 'clear-notice':
      return state.notice?.key === action.key ? { ...state, notice: null } : state
    default:
      return state
  }
}
