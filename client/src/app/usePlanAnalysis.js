import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { analyzePlan } from '../../../shared/planning/analyze.js'
import { planFingerprint } from '../../../shared/planning/fingerprint.js'
import { listStopChanges } from './planEdits.js'
import { chooseTravelProvider, createPlanningContext } from '../services/planningContext.js'
import { createWalkingRouteStore } from '../services/walkingRouteStore.js'
import { createWalkingRoutesProvider } from '../services/walkingRoutes.js'
import { loadMapsLibrary, mapsApiKey } from '../services/googleMaps.js'
import { buildTimeline, stopInterval } from '../../../shared/planning/timeline.js'

const googleWalking = createWalkingRoutesProvider(loadMapsLibrary)

export function usePlanAnalysis(plan, draft, now) {
  const shown = draft?.plan ?? plan
  const provider = chooseTravelProvider(shown, import.meta.env.VITE_TRAVEL_PROVIDER, Boolean(mapsApiKey))
  const [routes] = useState(() => createWalkingRouteStore(googleWalking))
  const results = useSyncExternalStore(routes.subscribe, routes.getSnapshot)
  const ctx = useMemo(() => createPlanningContext(shown, now, draft?.editedStopIds,
    provider === 'google' ? (from, to) => routes.lookup(from, to, results) : undefined),
  [shown, now, draft?.editedStopIds, provider, routes, results])
  const analysis = useMemo(() => analyzePlan(shown, ctx), [shown, ctx])
  const accepted = useMemo(() => analyzePlan(plan, ctx), [plan, ctx])
  useEffect(() => {
    if (provider !== 'google') return
    const pairs = (source, pending) => pending.map(({ fromStopId, toStopId }) => ({
      from: source.stops.find((stop) => stop.id === fromStopId), to: source.stops.find((stop) => stop.id === toStopId),
    }))
    routes.request([...pairs(shown, analysis.pending), ...pairs(plan, accepted.pending)])
  }, [provider, routes, shown, plan, analysis.pending, accepted.pending])
  const introduced = analysis.conflicts.filter((c) => !accepted.conflicts.some((old) => old.id === c.id && old.factsKey === c.factsKey))
  const getContext = useCallback(() => createPlanningContext(shown,
    shown.dataMode === 'demo' ? now : new Date(), draft?.editedStopIds,
    provider === 'google' ? (from, to) => routes.lookup(from, to) : undefined), [shown, now, draft?.editedStopIds, provider, routes])
  const checkAlternatives = () => {
    if (provider !== 'google') return
    const current = getContext().now
    const time = current instanceof Date ? current.getTime() : current
    const stops = buildTimeline(shown).filter((stop) => stop.status === 'planned' && stopInterval(stop).end > time)
    routes.request(stops.flatMap((from) => stops.filter((to) => to.id !== from.id
      && !(from.location?.placeId && from.location.placeId === to.location?.placeId)).map((to) => ({ from, to }))))
  }
  const changedIds = new Set(draft ? listStopChanges(plan, shown).map(({ after }) => after.id) : [])
  const stopStates = Object.fromEntries(shown.stops.map((stop) => {
    const conflicts = analysis.conflicts.filter((c) => c.stopIds.includes(stop.id))
    const unresolved = analysis.unresolved.some((entry) => entry.stopIds.includes(stop.id))
    return [stop.id, { clash: conflicts.length > 0, previewShifted: changedIds.has(stop.id),
      note: conflicts.length ? 'Schedule conflict' : unresolved ? 'Travel unresolved' : changedIds.has(stop.id) ? 'Draft change' : '' }]
  }))
  return { shown, ctx, getContext, analysis, introduced, fingerprint: planFingerprint(shown), stopStates,
    provider, loadingRoutes: provider === 'google' && [...results.values()].some((r) => r.status === 'pending'),
    failedRoutes: provider === 'google' && [...results.values()].some((r) => r.status === 'unavailable'),
    retryRoutes: routes.retryFailures, checkAlternatives }
}
