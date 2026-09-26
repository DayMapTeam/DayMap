import { useCallback, useEffect, useState } from 'react'

const WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }

/**
 * The device's live position, watched for as long as DayMap is open (the
 * browser asks for permission when the app opens). Positions stay in memory:
 * they are never saved to the plan, the server, storage or logs.
 *
 * status: 'requesting' | 'on' | 'denied' | 'unavailable' | 'unsupported'
 * position: { lat, lng, accuracy } or null
 */
export function useLocation() {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const [status, setStatus] = useState(supported ? 'requesting' : 'unsupported')
  const [position, setPosition] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!supported) return undefined
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setStatus('on')
        setPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied')
          setPosition(null)
        } else {
          // Timeouts and lost signal keep watching; the last position is kept.
          setStatus('unavailable')
        }
      },
      WATCH_OPTIONS,
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [supported, attempt])

  const retry = useCallback(() => {
    setStatus('requesting')
    setAttempt((count) => count + 1)
  }, [])

  return { status, position, retry }
}
