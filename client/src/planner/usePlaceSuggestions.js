import { useCallback, useEffect, useRef, useState } from 'react'
import { createPlacesProvider } from '../services/places.js'
import { createPlaceSearchController } from '../services/placeSearchController.js'

/**
 * Place suggestions for the add flows, through the same browser Places
 * adapter and controller as the map search (debounced, late results ignored).
 * Without a Maps key the status becomes 'error' and the flow still works
 * without a place.
 *
 * @param {(place: object) => void} onResolved Called with a chosen place once its coordinates arrive.
 */
export function usePlaceSuggestions(onResolved) {
  const [state, setState] = useState({ status: 'idle', results: [] })
  const controllerRef = useRef(null)
  const onResolvedRef = useRef(onResolved)

  useEffect(() => {
    onResolvedRef.current = onResolved
  })

  useEffect(() => {
    const controller = createPlaceSearchController({
      provider: createPlacesProvider(),
      onState: setState,
      onSelect: (place) => {
        if (place !== null) onResolvedRef.current(place)
      },
    })
    controllerRef.current = controller
    return () => controller.dispose()
  }, [])

  const search = useCallback((query) => controllerRef.current.search(query), [])
  const select = useCallback((result) => controllerRef.current.select(result), [])

  return { state, search, select }
}

/** Status text under a place field, or '' when there is nothing to say. */
export function placeStatusMessage(status) {
  return {
    loading: 'Searching places…',
    resolving: 'Finding this location…',
    empty: 'No places found. It will be added without a place.',
    error: 'Place search is unavailable. You can still add it without a place.',
  }[status] ?? ''
}
