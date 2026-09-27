/** Known coordinates are only reused when the person explicitly picks a row. */
export function matchingDayPlaces(plan, query, limit = 4) {
  const text = query.trim().toLocaleLowerCase()
  const places = [plan.startPlace, plan.endPlace, ...plan.stops.map((stop) => stop.location)]
  const seen = new Set()
  return places.filter((place) => {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false
    const key = `${place.label}|${place.lat}|${place.lng}`
    if (seen.has(key) || (text && !place.label.toLocaleLowerCase().includes(text))) return false
    seen.add(key)
    return true
  }).slice(0, limit)
}
