// Demo stand-in for GET /api/places/:id (DM-07). It resolves to null until the
// endpoint exists. Results are cached in memory for this visit only: Google
// place content must not be persisted (ARCHITECTURE §9).

const cache = new Map()

/**
 * Proposed normalised shape (not yet agreed with the team):
 * `{ photoUrl, rating, userRatingsTotal, category, address }`, or null.
 */
export function getPlaceDetails(placeId) {
  if (!cache.has(placeId)) cache.set(placeId, Promise.resolve(null))
  return cache.get(placeId)
}
