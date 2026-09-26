import { loadMapsLibrary } from './googleMaps.js'

export function createPlacesProvider() {
  let token
  let generation = 0
  let requestId = 0
  const predictions = new Map()

  function reset() {
    generation++
    token = undefined
    predictions.clear()
  }

  return {
    reset,
    async suggest(input) {
      const epoch = generation
      const { AutocompleteSessionToken, AutocompleteSuggestion } = await loadMapsLibrary('places')
      if (epoch !== generation) return []
      token ??= new AutocompleteSessionToken()
      const id = ++requestId
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: token,
        locationBias: { center: { lat: -34.925, lng: 138.602 }, radius: 30000 },
        includedRegionCodes: ['au'],
        region: 'au',
      })
      if (epoch !== generation || id !== requestId) return []
      predictions.clear()
      return suggestions.filter((entry) => entry.placePrediction).map(({ placePrediction }) => {
        const result = { id: placePrediction.placeId, label: placePrediction.text.toString() }
        predictions.set(result.id, placePrediction)
        return result
      })
    },
    async resolve(result) {
      const prediction = predictions.get(result.id)
      if (!prediction) throw new Error('Search again to select this place')
      const place = prediction.toPlace()
      // toPlace carries this session token into the first details request.
      reset()
      await place.fetchFields({ fields: ['location', 'formattedAddress'] })
      const lat = place.location?.lat()
      const lng = place.location?.lng()
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Place has no coordinates')
      return { placeId: result.id, label: result.label, address: place.formattedAddress ?? '', lat, lng }
    },
  }
}
