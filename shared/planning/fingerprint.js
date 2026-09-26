// Plans contain JSON data. Sort object keys to ignore insertion order, but keep
// array order because stop ordering can affect scheduling and tie-breaking.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    )
  }

  return value
}

/**
 * Identify the JSON plan inputs a proposal was built against.
 * This comparison string is not a security hash or a feasibility check.
 * Current time, locks, preferences, buffers and travel must be checked again
 * when a proposal is applied/accepted, even if this fingerprint still matches.
 */
export function planFingerprint(plan) {
  const inputs = {
    id: plan.id,
    version: plan.version,
    date: plan.date,
    timezone: plan.timezone,
    stops: plan.stops,
    legModes: (plan.legs ?? []).map((leg) => ({
      fromStopId: leg.fromStopId,
      toStopId: leg.toStopId,
      mode: leg.mode,
      modeSource: leg.modeSource,
    })),
  }

  return JSON.stringify(canonicalize(inputs))
}
