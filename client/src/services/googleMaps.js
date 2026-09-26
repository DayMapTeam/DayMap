import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

export const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

if (mapsApiKey) setOptions({ key: mapsApiKey, v: 'weekly' })

export function loadMapsLibrary(name) {
  if (!mapsApiKey) return Promise.reject(new Error('Missing Google Maps API key'))
  return importLibrary(name)
}
