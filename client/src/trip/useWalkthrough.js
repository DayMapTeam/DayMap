import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadMapsLibrary, mapsApiKey } from '../services/googleMaps.js'
import { createNavigationRouteProvider } from '../services/navigationRoute.js'
import { distanceMeters } from './tripRules.js'
import {
  dayRunIssue, dayRunStops, nextDayLeg, pointAlongRoute, walkPairs, walkStartTime,
} from './walkthrough.js'

const walkingRoute = createNavigationRouteProvider(loadMapsLibrary)
const TICK_MS = 250
const STOP_PAUSE_MS = 1400

/** Session-only replay: the accepted plan may change, and the next leg follows it. */
export function useWalkthrough(plan) {
  const pairs = useMemo(() => walkPairs(plan), [plan])
  const itinerary = useMemo(() => dayRunStops(plan), [plan])
  const dayIssue = useMemo(() => dayRunIssue(plan), [plan])
  const [mode, setMode] = useState('day')
  const [selectedPairId, setSelectedPairId] = useState(null)
  const pair = pairs.find(({ id }) => id === selectedPairId) ?? pairs[0] ?? null
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const planRef = useRef(plan)
  const sessionRef = useRef(session)
  const requestId = useRef(0)
  const routes = useRef(new Map())
  const pauseRequested = useRef(false)

  useEffect(() => { planRef.current = plan }, [plan])
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { routes.current.clear() }, [plan.id])

  const routeFor = useCallback((origin, destination) => {
    const key = [origin.lat, origin.lng, destination.lat, destination.lng].join(':')
    const cached = routes.current.get(key)
    if (cached) return Promise.resolve(cached)
    const pending = walkingRoute({ from: origin, to: destination, mode: 'walk' })
      .then((route) => {
        if (routes.current.get(key) === pending) routes.current.set(key, route)
        return route
      })
      .catch((error) => {
        if (routes.current.get(key) === pending) routes.current.delete(key)
        throw error
      })
    routes.current.set(key, pending)
    return pending
  }, [])

  const reset = useCallback(() => {
    requestId.current += 1
    pauseRequested.current = false
    setSession(null)
    setStatus('idle')
    setError(null)
  }, [])
  const finish = useCallback(() => {
    requestId.current += 1
    pauseRequested.current = false
    setSession(null)
    setStatus('finished')
    setError(null)
  }, [])
  const dismissFinished = useCallback(() => setStatus('idle'), [])

  // A new account/day cannot inherit the old person's simulated location.
  useEffect(() => {
    if (session && session.planId !== plan.id) {
      const timer = setTimeout(reset, 0)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [session, plan.id, reset])

  const beginLeg = useCallback(async ({ kind, planId, from, to, origin, completedIds, baseTime = null,
    speed = 30, playing = true }) => {
    const id = ++requestId.current
    if (!mapsApiKey) {
      setError('Google Maps Routes is needed for a real walking path.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setError(null)
    setSession((current) => current ? { ...current, playing: false, autoAdvance: false } : current)
    try {
      const route = await routeFor(origin, to.location)
      if (id !== requestId.current) return
      if (planRef.current.id !== planId) { reset(); return }
      if (!route.steps.length) throw new Error('Route has no walking steps')
      const durationSeconds = Math.max(1, route.seconds)
      const shouldPlay = playing && !pauseRequested.current
      setSession({
        id, kind, planId, fromId: from.id, fromTitle: from.title, toId: to.id, toTitle: to.title,
        from: { lat: origin.lat, lng: origin.lng },
        to: { lat: to.location.lat, lng: to.location.lng },
        route, durationSeconds, startTime: baseTime ?? walkStartTime({ from, to }, route),
        elapsedSeconds: 0, sampledAt: performance.now(), playing: shouldPlay, speed, finishTicks: 0,
        autoAdvance: kind === 'day' && shouldPlay, completedIds,
      })
      setStatus('ready')
      if (kind === 'day') {
        const latest = planRef.current
        const reached = dayRunStops(latest).find(({ id: stopId }) => stopId === to.id)
        if (reached) {
          const completed = [...new Set([...completedIds, to.id])]
          const next = nextDayLeg(latest, reached, completed)
          if (next.to) void routeFor(to.location, next.to.location).catch(() => {})
        }
      }
    } catch {
      if (id !== requestId.current) return
      setStatus('error')
      setError('Google could not find a walking route to the next event. Change its place or try again.')
    }
  }, [reset, routeFor])

  const start = useCallback(() => {
    pauseRequested.current = false
    if (mode === 'day') {
      if (dayIssue) { setError(dayIssue); setStatus('error'); return }
      const [home] = dayRunStops(plan)
      const leg = nextDayLeg(plan, home, [home.id])
      if (!leg.to) { finish(); return }
      void beginLeg({ kind: 'day', planId: plan.id, from: leg.from, to: leg.to,
        origin: leg.from.location, completedIds: leg.completedIds })
      return
    }
    if (!pair) { setError('Add two located events first.'); setStatus('error'); return }
    void beginLeg({ kind: 'pair', planId: plan.id, from: pair.from, to: pair.to,
      origin: pair.from.location, completedIds: [pair.from.id] })
  }, [mode, dayIssue, plan, pair, beginLeg, finish])

  const advance = useCallback(() => {
    const current = sessionRef.current
    if (!current || current.finishTicks < 2) return
    if (current.kind === 'pair') { finish(); return }
    const latest = planRef.current
    if (latest.id !== current.planId) { reset(); return }
    const completedIds = [...new Set([...current.completedIds, current.toId])]
    const reached = dayRunStops(latest).find(({ id }) => id === current.toId)
      ?? { id: current.toId, title: current.toTitle, location: current.to, timing: {} }
    const next = nextDayLeg(latest, reached, completedIds)
    if (!next.to) { finish(); return }
    const arrival = current.startTime + current.durationSeconds * 1000
    const end = Date.parse(next.from.timing?.scheduledEndAt)
    const baseTime = Math.max(arrival, Number.isFinite(end) ? end : arrival)
    void beginLeg({ kind: 'day', planId: latest.id, from: next.from, to: next.to,
      origin: current.to, completedIds: next.completedIds, baseTime, speed: current.speed })
  }, [beginLeg, finish, reset])

  useEffect(() => {
    if (!session || session.finishTicks < 2 || !session.autoAdvance) return undefined
    const timer = setTimeout(advance, STOP_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [session, advance])

  useEffect(() => {
    if (!session?.playing) return undefined
    const timer = setInterval(() => {
      const at = performance.now()
      setSession((current) => {
        if (!current?.playing) return current
        const realSeconds = Math.max(0, (at - current.sampledAt) / 1000)
        const elapsedSeconds = Math.min(current.durationSeconds, current.elapsedSeconds + realSeconds * current.speed)
        const finishTicks = elapsedSeconds >= current.durationSeconds ? current.finishTicks + 1 : 0
        return { ...current, elapsedSeconds, sampledAt: at, finishTicks, playing: finishTicks < 2 }
      })
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [session?.playing])

  const pause = useCallback(() => {
    pauseRequested.current = true
    const at = performance.now()
    setSession((current) => {
      if (!current) return current
      const extra = current.playing ? Math.max(0, at - current.sampledAt) * current.speed / 1000 : 0
      const elapsedSeconds = Math.min(current.durationSeconds, current.elapsedSeconds + extra)
      return { ...current, elapsedSeconds, sampledAt: at, playing: false, autoAdvance: false,
        finishTicks: elapsedSeconds >= current.durationSeconds ? 2 : current.finishTicks }
    })
  }, [])
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && sessionRef.current?.playing) pause()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [pause])
  const resume = useCallback(() => {
    pauseRequested.current = false
    const current = sessionRef.current
    if (!current) return
    if (current.finishTicks >= 2) {
      advance()
      return
    }
    if (current.kind === 'day') {
      const latest = planRef.current
      if (latest.id !== current.planId) { reset(); return }
      const source = dayRunStops(latest).find(({ id }) => id === current.fromId)
        ?? { id: current.fromId, title: current.fromTitle, location: current.from, timing: {} }
      const next = nextDayLeg(latest, source, current.completedIds)
      if (!next.to) { finish(); return }
      const changed = next.to.id !== current.toId || next.from.id !== current.fromId ||
        distanceMeters(next.to.location, current.to) >= 10
      if (changed) {
        const origin = pointAlongRoute(current.route, current.elapsedSeconds / current.durationSeconds) ?? current.from
        void beginLeg({ kind: 'day', planId: latest.id, from: next.from, to: next.to, origin,
          completedIds: next.completedIds, baseTime: current.startTime + current.elapsedSeconds * 1000,
          speed: current.speed })
        return
      }
    }
    setSession((value) => value ? { ...value, sampledAt: performance.now(), playing: true,
      autoAdvance: value.kind === 'day' } : value)
  }, [advance, beginLeg, finish, reset])
  const setSpeed = useCallback((speed) => {
    if (![10, 30, 60, 120].includes(speed)) return
    const at = performance.now()
    setSession((current) => {
      if (!current) return current
      const extra = current.playing ? Math.max(0, at - current.sampledAt) * current.speed / 1000 : 0
      return { ...current, elapsedSeconds: Math.min(current.durationSeconds, current.elapsedSeconds + extra),
        sampledAt: at, speed }
    })
  }, [])

  const reading = useMemo(() => {
    if (!session) return null
    const point = session.finishTicks ? session.to
      : pointAlongRoute(session.route, session.elapsedSeconds / session.durationSeconds)
    return point ? { ...point, accuracy: 5, simulated: true } : null
  }, [session])
  const now = session ? new Date(session.startTime + session.elapsedSeconds * 1000) : null
  const targetId = session?.toId
  const replayRoute = session?.route
  const routeOverride = useMemo(() => targetId ? { targetId, route: replayRoute } : null,
    [targetId, replayRoute])

  return { mode, setMode, pairs, pair, selectedPairId, setSelectedPairId, itinerary, dayIssue,
    session, status, error, reading, now, routeOverride,
    start, pause, resume, setSpeed, reset, dismissFinished }
}
