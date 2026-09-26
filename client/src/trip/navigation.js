import { distanceMeters, isValidPoint } from './tripRules.js'

// Guidance rules. Pure: routes and readings in, progress and state out.
export const NAV_RULES = Object.freeze({
  // Further than this from the route (plus GPS accuracy, up to 50 m) is off the route.
  offRouteMeters: 50,
  offRouteReadings: 3,
  // Never recalculate more often than this.
  rerouteAfterMs: 20000,
  // The camera looks at the route this far ahead of you.
  lookAheadMeters: 40,
  // Straight-line journeys up to this length are walked unless a mode was chosen.
  walkOnlyMeters: 1500,
})

const EARTH = 6371000
const rad = (degrees) => degrees * Math.PI / 180

/** Segments of the route with the step each belongs to and where it starts along the route. */
export function routeSegments(route) {
  const segments = []
  let along = 0
  route.steps.forEach((step, stepIndex) => {
    for (let i = 1; i < step.path.length; i++) {
      const a = step.path[i - 1]
      const b = step.path[i]
      const length = distanceMeters(a, b)
      segments.push({ a, b, stepIndex, start: along, length })
      along += length
    }
  })
  return segments
}

// Where `p` projects onto segment a→b: fraction 0..1 and distance in metres (local flat approximation).
function project(p, a, b) {
  const k = Math.cos(rad(p.lat))
  const ax = rad(a.lng) * k * EARTH
  const ay = rad(a.lat) * EARTH
  const dx = rad(b.lng) * k * EARTH - ax
  const dy = rad(b.lat) * EARTH - ay
  const px = rad(p.lng) * k * EARTH - ax
  const py = rad(p.lat) * EARTH - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * dx + py * dy) / lengthSquared))
  return { t, distance: Math.hypot(px - t * dx, py - t * dy) }
}

function pointAt(segments, along) {
  const segment = segments.find((s) => along <= s.start + s.length) ?? segments.at(-1)
  const t = segment.length === 0 ? 1 : Math.min(1, Math.max(0, (along - segment.start) / segment.length))
  return { lat: segment.a.lat + (segment.b.lat - segment.a.lat) * t, lng: segment.a.lng + (segment.b.lng - segment.a.lng) * t }
}

/**
 * How far along the route a position is: the current step, the distance to
 * its end (the next turn), what remains, how far off the route you are, and
 * a point a little ahead for the camera to look at.
 */
export function routeProgress(route, position) {
  const segments = routeSegments(route)
  if (!segments.length || !isValidPoint(position)) return null
  let best = null
  for (const segment of segments) {
    const { t, distance } = project(position, segment.a, segment.b)
    if (!best || distance < best.distance) best = { segment, t, distance }
  }
  const along = best.segment.start + best.t * best.segment.length
  const total = segments.at(-1).start + segments.at(-1).length
  const stepIndex = best.segment.stepIndex
  const stepSegments = segments.filter((s) => s.stepIndex === stepIndex)
  const stepStart = stepSegments[0].start
  const stepEnd = stepSegments.at(-1).start + stepSegments.at(-1).length
  const stepLength = Math.max(1, stepEnd - stepStart)
  const step = route.steps[stepIndex]
  const laterSeconds = route.steps.slice(stepIndex + 1).reduce((sum, s) => sum + s.seconds, 0)
  return {
    stepIndex,
    toStepEndMeters: Math.max(0, stepEnd - along),
    remainingMeters: Math.max(0, total - along),
    remainingSeconds: step.seconds * ((stepEnd - along) / stepLength) + laterSeconds,
    offRouteMeters: best.distance,
    ahead: pointAt(segments, Math.min(total, along + NAV_RULES.lookAheadMeters)),
  }
}

/**
 * How to travel from where you are now: the mode chosen for this journey, or
 * walking for a short trip, or the planned journey's mode (public transport
 * if that was a walk that is now too long).
 */
export function navigationMode(target, plannedMode, from) {
  if (['walk', 'transit', 'drive'].includes(target.travelMode)) return target.travelMode
  if (isValidPoint(from) && distanceMeters(from, target.location) <= NAV_RULES.walkOnlyMeters) return 'walk'
  return plannedMode === 'drive' ? 'drive' : 'transit'
}

export const initialNavigation = Object.freeze({
  targetId: null,
  requestId: 0,
  // What the current request asks for: { from, to, mode } or null.
  request: null,
  // 'idle' | 'no-origin' | 'loading' | 'ready' | 'error'
  status: 'idle',
  route: null,
  routedAt: 0,
  offCount: 0,
})

function requestFrom(state, from, at) {
  if (!isValidPoint(from)) return { ...state, status: state.route ? state.status : 'no-origin', request: null }
  return { ...state, requestId: state.requestId + 1, request: { ...state.request, from }, status: state.route ? 'ready' : 'loading',
    offCount: 0, routedAt: at }
}

/**
 * Navigation state. Actions:
 * - target { target, from, mode, at }: a trip started (or ended when target is null).
 * - routed { requestId, route, at } / failed { requestId }
 * - reading { reading, at }: off the route for three readings recalculates from here.
 */
export function navigationReducer(state, action) {
  switch (action.type) {
    case 'target': {
      if (!action.target) return initialNavigation
      if (action.target.id === state.targetId) return state
      const base = { ...initialNavigation, requestId: state.requestId, targetId: action.target.id,
        request: { from: null, to: action.target.location, mode: action.mode } }
      return requestFrom(base, action.from, action.at)
    }
    case 'routed':
      if (action.requestId !== state.requestId) return state
      return { ...state, status: 'ready', route: action.route, routedAt: action.at, offCount: 0 }
    case 'failed':
      if (action.requestId !== state.requestId) return state
      return { ...state, status: state.route ? 'ready' : 'error' }
    case 'reading': {
      const { reading, at } = action
      if (!isValidPoint(reading) || state.targetId === null) return state
      if (!state.route) return state.status === 'no-origin' ? requestFrom(state, reading, at) : state
      const progress = routeProgress(state.route, reading)
      const limit = NAV_RULES.offRouteMeters + Math.min(Math.max(reading.accuracy ?? 0, 0), 50)
      const offCount = progress && progress.offRouteMeters > limit ? state.offCount + 1 : 0
      if (offCount >= NAV_RULES.offRouteReadings && at - state.routedAt >= NAV_RULES.rerouteAfterMs) {
        return requestFrom(state, reading, at)
      }
      return offCount === state.offCount ? state : { ...state, offCount }
    }
    default:
      return state
  }
}
