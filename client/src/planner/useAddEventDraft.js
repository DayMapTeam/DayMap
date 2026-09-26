import { useEffect, useMemo, useState } from 'react'
import { usePlan } from '../app/planContext.js'
import { fitNewStop } from '../app/planAdd.js'
import { toTimeInputValue } from '../components/formatTime.js'
import { zonedTimeToTimestamp } from '../components/zonedTime.js'
import { describeAdded, splitPlaceLabel } from './addEventCopy.js'

const DEFAULT_DURATION = 30

/** A place from search → the §5 location shape. */
function placeToLocation(place) {
  return { label: place.label, placeId: place.placeId, lat: place.lat, lng: place.lng }
}

/**
 * Draft state for a new stop in the guided add sheet.
 * The fit is recalculated on every change with the same function the reducer
 * commits with, so what the user sees is what Add applies. It is local and
 * synchronous, so nothing needs debouncing or cancelling.
 *
 * @param {object} options
 * @param {Date} options.now
 * @param {ReturnType<import('../app/usePlanAnalysis.js').usePlanAnalysis>} options.planning
 *   Its journey estimates are allowed for, and missing ones are requested.
 */
export function useAddEventDraft({ now, planning }) {
  const { plan, addStop } = usePlan()
  const [id] = useState(() => crypto.randomUUID())
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState(null)
  const [kind, setKind] = useState('flexible')
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [chosenAfterStopId, setChosenAfterStopId] = useState(null)

  const newStop = useMemo(() => ({
    id,
    title,
    location,
    kind,
    durationMinutes,
    startAt: startTime ? zonedTimeToTimestamp(plan.date, startTime, plan.timezone) : null,
    endAt: endTime ? zonedTimeToTimestamp(plan.date, endTime, plan.timezone) : null,
  }), [id, title, location, kind, durationMinutes, startTime, endTime, plan.date, plan.timezone])

  const { ctx, requestJourneys } = planning
  const fit = useMemo(
    () => fitNewStop(plan, newStop, { now, ctx }),
    [plan, newStop, now, ctx],
  )

  // Ask for the journeys the options are waiting for; known ones aren't refetched.
  useEffect(() => {
    const pending = fit.options.flatMap((candidate) => candidate.journeys).filter((leg) => leg.request).map((leg) => leg.request)
    if (pending.length) requestJourneys(pending)
  }, [fit, requestJourneys])

  const option = kind === 'fixed'
    ? fit.options[0] ?? null
    : fit.options.find((candidate) => candidate.afterStopId === chosenAfterStopId) ?? fit.options[0] ?? null
  // Wait for journey estimates, so the time shown includes the travel.
  const checkingTravel = option?.journeys?.some((leg) => leg.status === 'pending') ?? false
  const canCommit = option?.ok === true && !checkingTravel

  // Switching to a set time starts from the slot DayMap would have picked.
  function changeKind(next) {
    setKind(next)
    if (next === 'fixed' && !startTime && option !== null) {
      setStartTime(toTimeInputValue(option.startAt, plan.timezone))
      setEndTime(toTimeInputValue(option.endAt, plan.timezone))
    }
  }

  // Typing a name forgets the picked place: free text is added without one.
  function changeText(text) {
    setTitle(text)
    setLocation(null)
  }

  function pickPlace(place) {
    setTitle(splitPlaceLabel(place.label).name)
    setLocation(placeToLocation(place))
  }

  /** Apply the draft. Returns what the toast should say, or null if it can't be added. */
  function commit() {
    if (!canCommit) return null
    // The same context as the preview, so the committed fit is the one shown.
    addStop({ newStop, afterStopId: option.afterStopId, baseVersion: plan.version, now, ctx })
    return { stopId: id, message: describeAdded(option, plan, id, title) }
  }

  return {
    plan,
    stopId: id,
    title,
    setTitle,
    changeText,
    location,
    pickPlace,
    kind,
    changeKind,
    durationMinutes,
    setDurationMinutes,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    chosenAfterStopId: option?.afterStopId ?? null,
    setChosenAfterStopId,
    fit,
    option,
    canCommit,
    checkingTravel,
    commit,
  }
}
