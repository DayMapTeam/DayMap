import { useCallback, useState } from 'react'
import { TRAVEL_PREFERENCES } from '../services/planningContext.js'

const KEY = 'daymap:travel-preference'

function read() {
  try {
    const value = globalThis.localStorage?.getItem(KEY)
    return TRAVEL_PREFERENCES.includes(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
}

/**
 * How the person gets around: 'auto' (walk + public transport), 'drive' or
 * 'walk'. A per-device convenience, so it lives in localStorage.
 */
export function useTravelPreference() {
  const [preference, setPreferenceState] = useState(read)
  const setPreference = useCallback((next) => {
    if (!TRAVEL_PREFERENCES.includes(next)) return
    setPreferenceState(next)
    try {
      globalThis.localStorage?.setItem(KEY, next)
    } catch {
      // Blocked storage only means the choice isn't remembered.
    }
  }, [])
  return [preference, setPreference]
}
