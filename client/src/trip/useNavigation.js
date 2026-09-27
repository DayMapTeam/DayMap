import { useEffect, useMemo, useReducer, useRef } from 'react'
import { loadMapsLibrary, mapsApiKey } from '../services/googleMaps.js'
import { createNavigationRouteProvider } from '../services/navigationRoute.js'
import { initialNavigation, navigationMode, navigationReducer, routeProgress } from './navigation.js'

const googleNavigation = createNavigationRouteProvider(loadMapsLibrary)

/**
 * Live guidance for the trip in progress: a route from where you are to the
 * destination (recalculated when you leave it), and your progress along it.
 * The route lives in memory for this trip only.
 *
 * @param {object} input
 * @param {object | null} input.target The stop you are heading to, or null.
 * @param {'walk' | 'transit' | 'drive' | null} input.plannedMode The planned journey's mode.
 * @param {{ lat: number, lng: number, accuracy?: number } | null} input.reading Your position.
 * @param {{ lat: number, lng: number } | null} input.fallbackOrigin Where to route from without a position.
 * @returns {{ status: string, route: object | null, progress: object | null, mode: string | null }}
 */
export function useNavigation({ target, plannedMode, reading, fallbackOrigin, routeOverride = null }) {
  const [state, dispatch] = useReducer(navigationReducer, initialNavigation)
  const latest = useRef({ reading, fallbackOrigin, plannedMode })
  useEffect(() => {
    latest.current = { reading, fallbackOrigin, plannedMode }
  })

  useEffect(() => {
    const { reading: here, fallbackOrigin: stop, plannedMode: planned } = latest.current
    const from = here ?? stop
    dispatch({ type: 'target', target, from, mode: target ? navigationMode(target, planned, from) : null, at: Date.now() })
  }, [target, plannedMode])

  useEffect(() => {
    if (reading) dispatch({ type: 'reading', reading, at: Date.now() })
  }, [reading])

  const { requestId, request } = state
  useEffect(() => {
    if (!mapsApiKey || !request?.from || routeOverride?.targetId === state.targetId) return undefined
    let active = true
    googleNavigation({ ...request, departAt: new Date().toISOString() }).then(
      (route) => { if (active) dispatch({ type: 'routed', requestId, route, at: Date.now() }) },
      () => { if (active) dispatch({ type: 'failed', requestId }) },
    )
    return () => { active = false }
  }, [requestId, request, routeOverride, state.targetId])

  useEffect(() => {
    if (routeOverride?.targetId === state.targetId && state.route !== routeOverride.route) {
      dispatch({ type: 'routed', requestId, route: routeOverride.route, at: Date.now() })
    }
  }, [routeOverride, state.targetId, state.route, requestId])

  const progress = useMemo(() => (state.route && reading ? routeProgress(state.route, reading) : null), [state.route, reading])
  const status = !mapsApiKey && state.targetId ? 'unavailable' : state.status
  return { status, route: state.route, progress, mode: request?.mode ?? null }
}
