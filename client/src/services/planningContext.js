import { stopInterval } from '../../../shared/planning/timeline.js'

/** How the person gets around: the default is walking plus public transport. */
export const TRAVEL_PREFERENCES = ['auto', 'drive', 'walk']
/** Minutes added to each journey, per mode: waiting, transfers, parking. */
export const TRAVEL_BUFFERS = { walk: 5, transit: 5, drive: 10 }
/** Journeys up to this straight-line distance are walked in every setting. */
export const WALK_ONLY_METERS = 1500
/** Public transport has to save at least this much over walking to be chosen. */
const TRANSIT_MIN_SAVING_SECONDS = 5 * 60

const valid = (p) => p && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180

/** Great-circle distance in metres, or null without coordinates. */
export function straightLineMeters(a, b) {
  if (!valid(a) || !valid(b)) return null
  const rad = (degrees) => degrees * Math.PI / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
}

// Simulated speeds for the labelled demo only: metres per second after a
// detour factor, plus fixed minutes (waiting for a bus, finding a park).
const DEMO = {
  walk: { detour: 1.3, speed: 1.3, fixed: 0 },
  transit: { detour: 1.3, speed: 6, fixed: 8 * 60 },
  drive: { detour: 1.4, speed: 11, fixed: 3 * 60 },
}

/** Demo estimates only. Live plans stay unresolved until Google answers. */
export function demoEstimate(from, to, { mode = 'walk', departAt = null } = {}) {
  const meters = straightLineMeters(from.location, to.location)
  if (meters === null) return { status: 'unavailable', reason: 'missing-coordinates' }
  const { detour, speed, fixed } = DEMO[mode] ?? DEMO.walk
  return {
    status: 'ready', provider: 'demo', mode,
    travelSeconds: Math.ceil(meters * detour / speed + fixed),
    ...(mode === 'transit' ? { timeDependent: true, departAt } : {}),
  }
}

export function demoWalkingEstimate(from, to) {
  return demoEstimate(from, to, { mode: 'walk' })
}

/**
 * The mode for one journey: the one chosen for the destination, if any.
 * Otherwise short hops are walked. Otherwise "drive" drives,
 * "walk" walks, and "auto" compares public transport at the real departure
 * with walking: transit wins only when it saves five minutes, and a missing
 * transit route means walking. While estimates load it asks for transit.
 *
 * @returns {{ mode: 'walk' | 'transit' | 'drive', source: string }}
 */
export function chooseMode(from, to, preference, travel) {
  // A way of travelling the person chose for this journey always wins.
  if (['walk', 'transit', 'drive'].includes(to.travelMode)) return { mode: to.travelMode, source: 'chosen' }
  const meters = straightLineMeters(from.location, to.location)
  if (preference === 'walk' || (meters !== null && meters <= WALK_ONLY_METERS)) return { mode: 'walk', source: 'auto' }
  if (preference === 'drive') return { mode: 'drive', source: 'auto' }
  const end = stopInterval(from)?.end
  const departAt = Number.isFinite(end) ? new Date(end).toISOString() : null
  const transit = travel?.(from, to, { mode: 'transit', departAt })
  const walk = travel?.(from, to, { mode: 'walk', departAt })
  if (transit?.status === 'ready' && walk?.status === 'ready') {
    return transit.travelSeconds + TRANSIT_MIN_SAVING_SECONDS <= walk.travelSeconds
      ? { mode: 'transit', source: 'auto' } : { mode: 'walk', source: 'auto' }
  }
  if (transit?.status === 'unavailable' && walk?.status === 'ready') return { mode: 'walk', source: 'no-transit' }
  return { mode: 'transit', source: 'auto' }
}

export function createPlanningContext(plan, now, lockedStopIds = [], travel, preference = 'auto') {
  const lookup = travel ?? (plan.dataMode === 'demo' ? demoEstimate
    : () => ({ status: 'unavailable', reason: 'routes-not-connected' }))
  return {
    now, lockedStopIds, preference, buffers: TRAVEL_BUFFERS, freeTimeMin: 15,
    modeFor: (from, to) => chooseMode(from, to, preference, lookup),
    travel: lookup,
  }
}

export function chooseTravelProvider(plan, requested, hasKey) {
  if (plan.dataMode !== 'demo') return 'google'
  if (requested === 'demo') return 'demo'
  return hasKey || requested === 'google' ? 'google' : 'demo'
}
