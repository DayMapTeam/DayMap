import { useCallback, useEffect, useRef, useState } from 'react'
import { bearingDegrees, distanceMeters, offsetPoint } from './tripRules.js'

// Demo only. About 15× walking speed, so a few hundred metres takes seconds.
export const SIMULATED_SPEEDUP = 15
const TICK_MS = 1000
const STEP_METERS = 1.3 * SIMULATED_SPEEDUP * (TICK_MS / 1000)
// Where a walk starts when there is no position yet: a short walk south-west.
const START_METERS = 600
const START_BEARING = 225
// Readings repeated at the destination, so arrival needs no extra step.
const DWELL_TICKS = 2
const ACCURACY = 8

/** One simulated step toward `destination`, landing on it exactly when close. */
export function stepToward(from, destination) {
  if (distanceMeters(from, destination) <= STEP_METERS) return { lat: destination.lat, lng: destination.lng }
  return offsetPoint(from, bearingDegrees(from, destination), STEP_METERS)
}

/** Where a simulated walk starts when there is no position yet. */
export function simulatedStart(target) {
  return offsetPoint(target, START_BEARING, START_METERS)
}

/**
 * A fake position that walks in a straight line to a destination. It feeds the
 * same trip rules as the real location, so leaving and arriving behave the
 * same way. Labelled as simulated wherever it shows.
 */
export function useSimulatedWalk() {
  const [position, setPosition] = useState(null)
  const [destination, setDestination] = useState(null)
  // The latest position for the interval, which must not restart on every step.
  const positionRef = useRef(null)

  const walkTo = useCallback((target) => {
    if (positionRef.current === null) {
      const start = simulatedStart(target)
      const first = { lat: start.lat, lng: start.lng, accuracy: ACCURACY, simulated: true }
      positionRef.current = first
      setPosition(first)
    }
    setDestination({ lat: target.lat, lng: target.lng, dwell: DWELL_TICKS })
  }, [])

  const reset = useCallback(() => {
    positionRef.current = null
    setDestination(null)
    setPosition(null)
  }, [])

  useEffect(() => {
    if (destination === null) return
    const id = setInterval(() => {
      const from = positionRef.current
      if (distanceMeters(from, destination) === 0) {
        setDestination((current) => (current && current.dwell > 1 ? { ...current, dwell: current.dwell - 1 } : null))
      }
      const next = stepToward(from, destination)
      const reading = { ...next, accuracy: ACCURACY, simulated: true }
      positionRef.current = reading
      setPosition(reading)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [destination])

  return { position, walking: destination !== null, walkTo, reset }
}
