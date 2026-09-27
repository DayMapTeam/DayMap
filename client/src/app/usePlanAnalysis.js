import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { analyzePlan } from '../../../shared/planning/analyze.js'
import { planFingerprint } from '../../../shared/planning/fingerprint.js'
import { listStopChanges } from './planEdits.js'
import { chooseMode, chooseTravelProvider, createPlanningContext } from '../services/planningContext.js'
import { createWalkingRouteStore } from '../services/walkingRouteStore.js'
import { createRoutesProvider } from '../services/walkingRoutes.js'
import { createTransitOptionsProvider } from '../services/transitOptions.js'
import { createTransitStore } from '../services/transitStore.js'
import { dayBookends } from '../services/dayPlaces.js'
import { loadMapsLibrary, mapsApiKey } from '../services/googleMaps.js'
import { buildTimeline, stopInterval } from '../../../shared/planning/timeline.js'
import { gapRoutePairs } from '../../../shared/planning/proposals.js'

const googleRoutes = createRoutesProvider(loadMapsLibrary)
const googleTransit = createTransitOptionsProvider(loadMapsLibrary)

export function usePlanAnalysis(plan, draft, now) {
  const shown = draft?.plan ?? plan
  const provider = chooseTravelProvider(shown, import.meta.env.VITE_TRAVEL_PROVIDER, Boolean(mapsApiKey))
  // Automatic mode choice; a journey's own choice lives on its destination stop.
  const preference = 'auto'
  const [routes] = useState(() => createWalkingRouteStore(googleRoutes))
  const results = useSyncExternalStore(routes.subscribe, routes.getSnapshot)
  const [transit] = useState(() => createTransitStore(googleTransit))
  const transitResults = useSyncExternalStore(transit.subscribe, transit.getSnapshot)
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
  // Where the day starts and ends, and the journeys to the first and from the last stop.
  const bookends = useMemo(() => dayBookends(shown, ctx), [shown, ctx])
  useEffect(() => {
    if (provider !== 'google') return
    for (const bookend of [bookends.start, bookends.end]) {
      if (!bookend?.request || bookend.leg?.status === 'ready') continue
      const { from, to, mode, departAt } = bookend.request
      routes.request(mode === 'transit' ? [{ from, to, mode, departAt }, { from, to, mode: 'walk' }] : [{ from, to, mode, departAt }])
    }
  }, [provider, routes, bookends])
  const introduced = analysis.conflicts.filter((c) => !accepted.conflicts.some((old) => old.id === c.id && old.factsKey === c.factsKey))
  const getContext = useCallback(() => createPlanningContext(shown,
    shown.dataMode === 'demo' ? now : new Date(), draft?.editedStopIds,
    provider === 'google' ? (from, to, options) => routes.lookup(from, to, options) : undefined, preference),
  [shown, now, draft?.editedStopIds, provider, routes, preference])
  // Alternative times: walking, or driving where that journey is by car.
  // Public transport at a new time is only known once that departure is fetched.
  const withModes = (pairs) => pairs.map((pair) => ({ ...pair, mode: pair.to.travelMode === 'drive' ? 'drive' : 'walk' }))
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
  // Every way of making one journey, for the journey popup. Departure is when
  // `from` ends, or now if that has passed.
  const departureFor = useCallback((from) => {
    const end = stopInterval(from)?.end
    if (!Number.isFinite(end)) return null
    const current = now instanceof Date ? now.getTime() : now
    return new Date(Math.max(end, Math.ceil(current / 60000) * 60000)).toISOString()
  }, [now])
  const journeyEstimates = useCallback((from, to) => {
    const departAt = departureFor(from)
    return Object.fromEntries(['walk', 'transit', 'drive'].map((mode) => [mode, ctx.travel(from, to, { mode, departAt })]))
  }, [ctx, departureFor])
  // Buses and trains for one journey, shared by the planner line and the popup.
  const transitServicesFor = useCallback((from, to) => transit.lookup(from.location, to.location, departureFor(from), transitResults),
    [transit, transitResults, departureFor])
  const requestTransit = useCallback((from, to) => {
    if (provider === 'google') transit.request(from.location, to.location, departureFor(from))
  }, [provider, transit, departureFor])
  const chooseTransit = useCallback((from, to, optionId) => transit.choose(from.location, to.location, departureFor(from), optionId),
    [transit, departureFor])
  useEffect(() => {
    for (const leg of analysis.legs) {
      if (leg.status !== 'ready' || leg.mode !== 'transit') continue
      const from = shown.stops.find((stop) => stop.id === leg.fromStopId)
      const to = shown.stops.find((stop) => stop.id === leg.toStopId)
      if (from && to) requestTransit(from, to)
    }
    const end = bookends.end
    if (end?.leg?.status === 'ready' && end.leg.mode === 'transit') requestTransit(end.stop, end.to)
  }, [analysis.legs, shown, requestTransit, bookends])
  const requestAllModes = useCallback((from, to) => {
    if (provider !== 'google') return
    const departAt = departureFor(from)
    routes.request(['walk', 'transit', 'drive'].map((mode) => ({ from, to, mode, departAt })))
  }, [provider, routes, departureFor])
  const changedIds = new Set(draft ? listStopChanges(plan, shown).map(({ after }) => after.id) : [])
  const stopStates = Object.fromEntries(shown.stops.map((stop) => {
    const conflicts = analysis.conflicts.filter((c) => c.stopIds.includes(stop.id))
    const unresolved = analysis.unresolved.some((entry) => entry.stopIds.includes(stop.id))
    return [stop.id, { clash: conflicts.length > 0, previewShifted: changedIds.has(stop.id),
      note: conflicts.length ? 'Schedule conflict' : unresolved ? 'Travel unresolved' : changedIds.has(stop.id) ? 'Draft change' : '' }]
  }))
  return { bookends, shown, ctx, getContext, analysis, displayGaps, introduced, fingerprint: planFingerprint(shown), stopStates,
    provider, loadingRoutes: provider === 'google' && [...results.values()].some((r) => r.status === 'pending'),
    failedRoutes: provider === 'google' && [...results.values()].some((r) => r.status === 'unavailable'),
    retryRoutes: routes.retryFailures, checkAlternatives, checkGapRoutes, requestJourneys,
    departureFor, journeyEstimates, requestAllModes, transitServicesFor, requestTransit, chooseTransit }
}
