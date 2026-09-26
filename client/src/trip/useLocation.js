import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'daymap.location'
const WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }

function remembered() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

function remember(on) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, 'on')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable: location still works for this visit.
  }
}

/**
 * The device's live position, only after the person asks for it. Positions
 * stay in memory: they are never saved to the plan, the server or storage.
 * Only the choice to use location is remembered, and it resumes on the next
 * visit only if the browser already granted permission (so no prompt appears
 * without a tap).
 *
 * status: 'off' | 'requesting' | 'on' | 'denied' | 'unavailable' | 'unsupported'
 * position: { lat, lng, accuracy } or null
 */
export function useLocation() {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const [status, setStatus] = useState(supported ? 'off' : 'unsupported')
  const [position, setPosition] = useState(null)
  const watchRef = useRef(null)

  const stopWatching = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
  }, [])

  const start = useCallback(() => {
    if (!supported || watchRef.current !== null) return
    setStatus((current) => (current === 'on' ? current : 'requesting'))
    watchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setStatus('on')
        setPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          stopWatching()
          remember(false)
          setStatus('denied')
          setPosition(null)
        } else {
          // Timeouts and lost signal keep watching; the last position is kept but flagged.
          setStatus('unavailable')
        }
      },
      WATCH_OPTIONS,
    )
  }, [supported, stopWatching])

  const enable = useCallback(() => {
    remember(true)
    start()
  }, [start])

  const disable = useCallback(() => {
    remember(false)
    stopWatching()
    setStatus(supported ? 'off' : 'unsupported')
    setPosition(null)
  }, [supported, stopWatching])

  // Resume a previous opt-in, but never trigger a permission prompt on load.
  useEffect(() => {
    if (!supported || !remembered()) return
    let cancelled = false
    const query = navigator.permissions?.query?.({ name: 'geolocation' })
    if (!query) return
    query.then((permission) => {
      if (!cancelled && permission.state === 'granted') start()
    }, () => {})
    return () => {
      cancelled = true
    }
  }, [supported, start])

  useEffect(() => stopWatching, [stopWatching])

  return { status, position, enable, disable }
}
