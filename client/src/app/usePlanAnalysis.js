import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { analyzePlan } from '../../../shared/planning/analyze.js'
import { planFingerprint } from '../../../shared/planning/fingerprint.js'
import { listStopChanges } from './planEdits.js'
import { chooseMode, chooseTravelProvider, createPlanningContext } from '../services/planningContext.js'
import { createWalkingRouteStore } from '../services/walkingRouteStore.js'
import { createRoutesProvider } from '../services/walkingRoutes.js'
import { useTravelPreference } from './useTravelPreference.js'
import { loadMapsLibrary, mapsApiKey } from '../services/googleMaps.js'
import { buildTimeline, stopInterval } from '../../../shared/planning/timeline.js'
import { gapRoutePairs } from '../../../shared/planning/proposals.js'

const googleRoutes = createRoutesProvider(loadMapsLibrary)

export function usePlanAnalysis(plan, draft, now) {
  const shown = draft?.plan ?? plan
  const provider = chooseTravelProvider(shown, import.meta.env.VITE_TRAVEL_PROVIDER, Boolean(mapsApiKey))
  const [preference, setPreference] = useTravelPreference()
  const [routes] = useState(() => createWalkingRouteStore(googleRoutes))
  const results = useSyncExternalStore(routes.subscribe, routes.getSnapshot)
  const ctx = useMemo(() => createPlanningContext(shown, now, draft?.editedStopIds,
    provider === 'google' ? (from, to, options) => routes.lookup(from, to, { ...options, results }) : undefined, preference),
  [shown, now, draft?.editedStopIds, provider, routes, results, preference])
  const analysis = useMemo(() => analyzePlan(shown, ctx), [shown, ctx])
  const accepted = useMemo(() => analyzePlan(plan, ctx), [plan, ctx])
  const displayGaps = useMemo(() => draft?.suggestion?.strategy === 'fill-gap'
    ? analyzePlan(shown, { ...ctx, freeTimeMin: 0 }).freeTime.filter((gap) => gap.minutes >= ctx.freeTimeMin
      || [gap.fromStopId, gap.toStopId].includes(draft.suggestion.changes[0].stopId)) : analysis.freeTime,
  [draft, shown, ctx, analysis.freeTime])
  useEffect(() => {
    if (provider !== 'google') return
    // Public transport is compared with walking, so both are requested.
    const pairs = (source, pending) => pending.flatMap(({ fromStopId, toStopId, mode, departAt }) => {
      const pair = { from: source.stops.find((stop) => stop.id === fromStopId), to: source.stops.find((stop) => stop.id === toStopId) }
      return mode === 'transit' ? [{ ...pair, mode, departAt }, { ...pair, mode: 'walk' }] : [{ ...pair, mode, departAt }]
    })
    routes.request([...pairs(shown, analysis.pending), ...pairs(plan, accepted.pending)])
  }, [provider, routes, shown, plan, analysis.pending, accepted.pending])
  const introduced = analysis.conflicts.filter((c) => !accepted.conflicts.some((old) => old.id === c.id && old.factsKey === c.factsKey))
  const getContext = useCallback(() => createPlanningContext(shown,
    shown.dataMode === 'demo' ? now : new Date(), draft?.editedStopIds,
    provider === 'google' ? (from, to, options) => routes.lookup(from, to, options) : undefined, preference),
  [shown, now, draft?.editedStopIds, provider, routes, preference])
  // Alternative times: walking or driving as the setting chooses. Public
  // transport at a new time is only known once that departure is fetched.
  const withModes = (pairs) => pairs.map((pair) => ({ ...pair, mode: preference === 'drive' ? chooseMode(pair.from, pair.to, 'drive').mode : 'walk' }))
  const checkAlternatives = () => {
    if (provider !== 'google') return
    const current = getContext().now
    const time = current instanceof Date ? current.getTime() : current
    const stops = buildTimeline(shown).filter((stop) => stop.status === 'planned' && stopInterval(stop).end > time)
    routes.request(withModes(stops.flatMap((from) => stops.filter((to) => to.id !== from.id
      && !(from.location?.placeId && from.location.placeId === to.location?.placeId)).map((to) => ({ from, to })))))
  }
  const checkGapRoutes = (gapId) => {
    if (provider === 'google') routes.request(withModes(gapRoutePairs(shown, gapId, getContext())))
  }
  // Journeys the add flow is waiting for, at their real departures.
  const requestJourneys = useCallback((pairs) => {
    if (provider !== 'google') return
    const lookup = (from, to, options) => routes.lookup(from, to, options)
    routes.request(pairs.flatMap(({ from, to, departAt }) => {
      const { mode } = chooseMode(from, to, preference, lookup)
      return mode === 'transit' ? [{ from, to, mode, departAt }, { from, to, mode: 'walk' }] : [{ from, to, mode, departAt }]
    }))
  }, [provider, routes, preference])
  const changedIds = new Set(draft ? listStopChanges(plan, shown).map(({ after }) => after.id) : [])
  const stopStates = Object.fromEntries(shown.stops.map((stop) => {
    const conflicts = analysis.conflicts.filter((c) => c.stopIds.includes(stop.id))
    const unresolved = analysis.unresolved.some((entry) => entry.stopIds.includes(stop.id))
    return [stop.id, { clash: conflicts.length > 0, previewShifted: changedIds.has(stop.id),
      note: conflicts.length ? 'Schedule conflict' : unresolved ? 'Travel unresolved' : changedIds.has(stop.id) ? 'Draft change' : '' }]
  }))
  return { preference, setPreference, shown, ctx, getContext, analysis, displayGaps, introduced, fingerprint: planFingerprint(shown), stopStates,
    provider, loadingRoutes: provider === 'google' && [...results.values()].some((r) => r.status === 'pending'),
    failedRoutes: provider === 'google' && [...results.values()].some((r) => r.status === 'unavailable'),
    retryRoutes: routes.retryFailures, checkAlternatives, checkGapRoutes, requestJourneys }
}
