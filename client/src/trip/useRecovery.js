import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useNow } from '../components/useNow.js'
import { buildTimeline, stopInterval } from '../../../shared/planning/timeline.js'
import { createNavigationRouteProvider } from '../services/navigationRoute.js'
import { loadMapsLibrary, mapsApiKey } from '../services/googleMaps.js'
import { demoEstimate } from '../services/planningContext.js'
import { navigationMode } from './navigation.js'
import { distanceMeters, isValidPoint } from './tripRules.js'
import { createRecoveryStore } from './recoveryStore.js'
import { atRecoveryDestination, currentRecovery, freshPosition, laterStartEdit, RECOVERY, recoveryAdvice,
  recoveryKey, recoveryOptions, recoveryTarget } from './recovery.js'

const googleProvider = createNavigationRouteProvider(loadMapsLibrary)
const demoProvider = async ({ from, to, mode }) => ({ mode, seconds: demoEstimate({ location: from }, { location: to }, { mode }).travelSeconds, steps: [] })

/** Foreground-only departure checks. Device coordinates and route responses never enter the saved plan. */
export function useRecovery({ plan, trip, navigation, location, now, draft }) {
  const wallNow = useNow(10000)
  const demo = plan.dataMode === 'demo'
  const time = demo ? now.getTime() : Math.max(wallNow.getTime(), location.position?.observedAt ?? 0)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  // Demo always uses the fictional plan's current stop, never the device's real position.
  const demoAt = demo ? buildTimeline(plan).find((stop) => {
    const interval = stopInterval(stop)
    return interval.start <= time && interval.end > time
  }) : null
  const target = recoveryTarget(plan, demo && !trip.target ? { ...trip, atStop: demoAt ?? trip.atStop } : trip, time)
  const from = demo ? demoAt?.location ?? plan.startPlace : location.position
  const locationReady = demo ? isValidPoint(from) : freshPosition(from, location.status, time)
  const candidate = target && isValidPoint(target.location) && stopInterval(target).start - time <= RECOVERY.horizonMs
    && stopInterval(target).end > time && !(locationReady && atRecoveryDestination(from, target)) ? target : null
  const baseKey = recoveryKey(plan, candidate)
  const carKey = JSON.stringify([plan.id, candidate?.id, candidate?.location])
  const [car, setCar] = useState(null)
  // A car confirmation belongs to this destination and place; walking away invalidates it.
  const carAvailable = car?.key === carKey && locationReady && (distanceMeters(car.from, from) <= 150
    || (trip.target?.id === candidate?.id && navigation.mode === 'drive'))
  const key = `${baseKey}:${Boolean(carAvailable)}`
  const store = useMemo(() => createRecoveryStore(demo ? demoProvider : googleProvider), [demo])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const enabled = Boolean(candidate && locationReady && visible && (demo || mapsApiKey))
  useEffect(() => {
    if (!enabled) { store.clear(); return }
    store.request({ key, from, to: candidate.location, now: time, modes: carAvailable ? ['walk', 'transit', 'drive'] : ['walk', 'transit'], demo })
  }, [store, enabled, key, from, candidate, time, carAvailable, demo])
  useEffect(() => () => store.clear(), [store])

  const fresh = enabled && currentRecovery(snapshot, { key, from, now: time })
  const options = fresh ? recoveryOptions(snapshot, candidate, time, carAvailable) : []
  const planned = plan.legs.find((leg) => leg.toStopId === candidate?.id)?.mode
  const mode = candidate ? (trip.target ? navigation.mode : null) ?? navigationMode(candidate, planned, from) : null
  const advice = candidate ? recoveryAdvice(options, mode, time) : null
  const edit = candidate && advice.best && advice.best.lateMinutes > 0 ? laterStartEdit(plan, candidate, advice.current, time) : null
  const state = !visible ? 'paused' : !locationReady ? 'location' : !(demo || mapsApiKey) ? 'unavailable' : !fresh ? 'loading' : options.length ? 'ready' : 'unavailable'

  // Recheck at click time; the tab may have slept or a transit departure may have passed since rendering.
  function choose(modeToUse) {
    const currentTime = demo ? time : Date.now()
    if (draft || !candidate || !visible || (!demo && !freshPosition(from, location.status, currentTime))
      || !currentRecovery(store.getSnapshot(), { key, from, now: currentTime })) return null
    return recoveryOptions(store.getSnapshot(), candidate, currentTime, carAvailable).find((option) => option.mode === modeToUse) ?? null
  }
  return { target: candidate, key, targetKey: baseKey, state, demo, options, advice, edit, mode, carAvailable: Boolean(carAvailable),
    setCarAvailable: (available) => setCar(available && locationReady ? { key: carKey, from: { lat: from.lat, lng: from.lng } } : null),
    choose, canAct: !draft && state === 'ready', locationReady, now: time,
  }
}
