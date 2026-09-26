import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { initialTrip, nextStopFor, tripReducer, tripStops } from './tripRules.js'

const NOTICE_MS = 5000

/**
 * Trip state for the accepted plan. Each new position reading goes through the
 * trip rules once. Trip state is UI state: it never edits the plan.
 *
 * @param {object} input
 * @param {object} input.plan The accepted plan.
 * @param {Date} input.now The planner's current time.
 * @param {{ lat: number, lng: number, accuracy?: number } | null} input.reading The latest position.
 */
export function useTrip({ plan, now, reading }) {
  const [state, dispatch] = useReducer(tripReducer, initialTrip)
  // The plan and time for the next reading, without re-feeding a reading when they change.
  const latest = useRef({ plan, now })

  useEffect(() => {
    latest.current = { plan, now }
  }, [plan, now])

  useEffect(() => {
    if (reading) dispatch({ type: 'reading', reading, plan: latest.current.plan, now: latest.current.now })
  }, [reading])

  useEffect(() => {
    dispatch({ type: 'sync', plan })
  }, [plan])

  const noticeKey = state.notice?.key ?? null
  useEffect(() => {
    if (noticeKey === null) return
    const id = setTimeout(() => dispatch({ type: 'clear-notice', key: noticeKey }), NOTICE_MS)
    return () => clearTimeout(id)
  }, [noticeKey])

  const stops = useMemo(() => new Map(plan.stops.map((stop) => [stop.id, stop])), [plan.stops])
  const next = useMemo(() => nextStopFor(plan, { atStopId: state.atStopId, now }), [plan, state.atStopId, now])
  const target = state.phase === 'navigating'
    ? tripStops(plan).find((stop) => stop.id === state.targetId) ?? null
    : null

  const go = useCallback((stopId) => dispatch({ type: 'go', stopId }), [])
  const end = useCallback(() => dispatch({ type: 'end' }), [])
  const arrive = useCallback(() => dispatch({ type: 'arrive' }), [])
  const acceptAsk = useCallback(() => dispatch({ type: 'accept-ask' }), [])
  const dismissAsk = useCallback(() => dispatch({ type: 'dismiss-ask' }), [])

  return {
    state,
    next,
    target,
    atStop: state.atStopId === null ? null : stops.get(state.atStopId) ?? null,
    askStop: state.ask === null ? null : stops.get(state.ask.toStopId) ?? null,
    noticeStop: state.notice === null ? null : stops.get(state.notice.stopId) ?? null,
    go, end, arrive, acceptAsk, dismissAsk,
  }
}
