// Demo estimates only. Live plans stay unresolved until a Routes adapter exists.
export function demoWalkingEstimate(from, to) {
  const a = from.location
  const b = to.location
  if (![a, b].every((p) => p && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
    && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180)) {
    return { status: 'unavailable', reason: 'missing-coordinates' }
  }
  const rad = (degrees) => degrees * Math.PI / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  const meters = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
  const detourFactor = 1.3
  const walkingMetersPerSecond = 1.3
  return { status: 'ready', travelSeconds: Math.ceil(meters * detourFactor / walkingMetersPerSecond), provider: 'demo' }
}

export function createPlanningContext(plan, now, lockedStopIds = [], travel) {
  return {
    now, lockedStopIds, modeFor: () => 'walk', buffers: { walk: 5 }, freeTimeMin: 15,
    travel: travel ?? (plan.dataMode === 'demo' ? demoWalkingEstimate
      : () => ({ status: 'unavailable', reason: 'routes-not-connected' })),
  }
}

export function chooseTravelProvider(plan, requested, hasKey) {
  if (plan.dataMode !== 'demo') return 'google'
  if (requested === 'demo') return 'demo'
  return hasKey || requested === 'google' ? 'google' : 'demo'
}
