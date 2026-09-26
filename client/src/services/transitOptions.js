const COLOR = /^#[0-9a-f]{3,8}$/i
const MINUTE = 60000

const iso = (value) => {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}
const safeColor = (value) => (typeof value === 'string' && COLOR.test(value) ? value : null)
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** One ride of a Google transit step, as plain data. */
export function normalizeRide(details, seconds = 0) {
  const line = details.transitLine ?? {}
  return {
    kind: 'ride',
    vehicle: text(line.vehicle?.name) ?? 'Transit',
    name: text(line.shortName) ?? text(line.name) ?? 'Service',
    lineName: text(line.name),
    color: safeColor(line.color),
    textColor: safeColor(line.textColor),
    headsign: text(details.headsign),
    fromStop: text(details.departureStop?.name),
    toStop: text(details.arrivalStop?.name),
    departAt: iso(details.departureTime),
    arriveAt: iso(details.arrivalTime),
    stopCount: Number.isFinite(Number(details.stopCount)) ? Number(details.stopCount) : null,
    minutes: Math.round(seconds / 60),
  }
}

/**
 * Plain public-transport options from Google routes: each ride (line, vehicle,
 * colours, stops, times) and the walking before, between and after it.
 * Walking-only and duplicate routes are dropped; earliest arrival first.
 */
export function normalizeTransitRoutes(routes) {
  const options = []
  const seen = new Set()
  for (const route of routes ?? []) {
    const parts = []
    for (const step of route?.legs?.[0]?.steps ?? []) {
      const seconds = Number(step?.staticDurationMillis ?? 0) / 1000
      const details = step?.travelMode === 'TRANSIT' ? step.transitDetails : null
      if (details) {
        parts.push(normalizeRide(details, seconds))
      } else if (parts.at(-1)?.kind === 'walk') {
        parts.at(-1).seconds += seconds
      } else {
        parts.push({ kind: 'walk', seconds })
      }
    }
    const rides = parts.filter((part) => part.kind === 'ride')
    if (!rides.length || !rides[0].departAt) continue
    const key = rides.map((ride) => `${ride.name}@${ride.departAt}`).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const steps = parts
      .map((part) => (part.kind === 'walk' ? { kind: 'walk', minutes: Math.ceil(part.seconds / 60) } : part))
      .filter((part) => part.kind !== 'walk' || part.minutes > 0)
    const walkBefore = steps[0]?.kind === 'walk' ? steps[0].minutes : 0
    const durationMs = Number(route.durationMillis)
    options.push({
      id: key,
      minutes: Number.isFinite(durationMs) ? Math.round(durationMs / MINUTE) : null,
      walkMinutes: steps.filter((part) => part.kind === 'walk').reduce((sum, part) => sum + part.minutes, 0),
      leaveAt: new Date(Date.parse(rides[0].departAt) - walkBefore * MINUTE).toISOString(),
      arriveAt: rides.at(-1).arriveAt,
      steps,
    })
  }
  return options.sort((a, b) => (Date.parse(a.arriveAt) || 0) - (Date.parse(b.arriveAt) || 0) || (a.minutes ?? 0) - (b.minutes ?? 0))
}

/**
 * Public-transport services between two places at a departure time, through
 * the Maps JavaScript Routes library. Google objects stay in this adapter.
 */
export function createTransitOptionsProvider(loadLibrary) {
  return async ({ from, to, departAt }) => {
    const { Route } = await loadLibrary('routes')
    const { routes } = await Route.computeRoutes({
      origin: { lat: from.lat, lng: from.lng },
      destination: { lat: to.lat, lng: to.lng },
      travelMode: 'TRANSIT',
      departureTime: new Date(departAt),
      computeAlternativeRoutes: true,
      fields: ['durationMillis', 'distanceMeters', 'legs'],
    })
    return normalizeTransitRoutes(routes)
  }
}
