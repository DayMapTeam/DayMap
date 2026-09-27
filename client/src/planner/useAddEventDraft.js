import { useEffect, useMemo, useState } from 'react'
import { usePlan } from '../app/planContext.js'
import { fitNewStop } from '../app/planAdd.js'
import { toTimeInputValue } from '../components/formatTime.js'
import { zonedTimeToTimestamp } from '../components/zonedTime.js'
import { describeAdded, splitPlaceLabel } from './addEventCopy.js'

const SUGGESTED_MINUTES = 30

/** A place from search → the §5 location shape. */
function placeToLocation(place) {
  return { label: place.label, placeId: place.placeId, lat: place.lat, lng: place.lng }
}

/**
 * Draft state for the add sheet: a name (and usually a place), and what it is —
 * an activity with From–To times, a note, or an explicit day endpoint. Activities are
 * fitted with the same function the reducer commits with, so what the person
 * sees is what Add applies.
 *
 * @param {object} options
 * @param {Date} options.now
 * @param {ReturnType<import('../app/usePlanAnalysis.js').usePlanAnalysis>} options.planning
 *   Its journey estimates are allowed for, and missing ones are requested.
 */
export function useAddEventDraft({ now, planning, initialPlace = null }) {
  const { plan, addStop, setDayPlace } = usePlan()
  const [id] = useState(() => crypto.randomUUID())
  const [title, setTitleState] = useState(() => initialPlace ? splitPlaceLabel(initialPlace.label).name : '')
  const [location, setLocation] = useState(() => initialPlace ? placeToLocation(initialPlace) : null)
  // A place name never decides whether the person's day is over.
  const [role, changeRole] = useState('event')
  const [dayRole, setDayRole] = useState('both')
  // Times the person typed; until then the suggestion stays live as travel estimates arrive.
  const [edited, setEdited] = useState(null)
  const { ctx, requestJourneys } = planning

  // A good time: the soonest free half hour that allows for travel.
  const suggestion = useMemo(() => {
    const draft = { id, title: title || 'New event', location, kind: 'flexible', durationMinutes: SUGGESTED_MINUTES }
    const best = title ? fitNewStop(plan, draft, { now, ctx }).options.find((candidate) => candidate.ok) : null
    return best
      ? { start: toTimeInputValue(best.startAt, plan.timezone), end: toTimeInputValue(best.endAt, plan.timezone) }
      : { start: '', end: '' }
  }, [id, title, location, plan, now, ctx])
  const startTime = edited?.start ?? suggestion.start
  const endTime = edited?.end ?? suggestion.end
  const setStartTime = (value) => setEdited({ start: value, end: endTime })
  const setEndTime = (value) => setEdited({ start: startTime, end: value })

  const newStop = useMemo(() => ({
    id,
    title,
    location,
    kind: role === 'note' ? 'all-day' : 'timed',
    startAt: startTime ? zonedTimeToTimestamp(plan.date, startTime, plan.timezone) : null,
    endAt: endTime ? zonedTimeToTimestamp(plan.date, endTime, plan.timezone) : null,
  }), [id, title, location, role, startTime, endTime, plan.date, plan.timezone])

  const fit = useMemo(
    () => (role !== 'day-place' ? fitNewStop(plan, newStop, { now, ctx }) : { error: null, options: [] }),
    [role, plan, newStop, now, ctx],
  )
  const option = fit.options[0] ?? null

  // Ask for the journeys the fit is waiting for; known ones aren't refetched.
  useEffect(() => {
    const pending = fit.options.flatMap((candidate) => candidate.journeys).filter((leg) => leg.request).map((leg) => leg.request)
    if (pending.length) requestJourneys(pending)
  }, [fit, requestJourneys])

  // Wait for journey estimates, so the time shown includes the travel.
  const checkingTravel = option?.journeys?.some((leg) => leg.status === 'pending') ?? false
  const canCommit = role !== 'day-place'
    ? option?.ok === true && !checkingTravel
    : location !== null && title.trim() !== '' && title.trim().length <= 120

  // Typing a name forgets the picked place: free text is an event without one.
  function changeText(text) {
    setTitleState(text)
    setLocation(null)
    changeRole('event')
    setEdited(null)
  }

  function pickPlace(place) {
    setTitleState(splitPlaceLabel(place.label).name)
    setLocation(placeToLocation(place))
    changeRole('event')
    setEdited(null)
  }

  function attachPlace(place) {
    setLocation(place === null ? null : placeToLocation(place))
  }

  /** Apply the draft. Returns what the toast should say (with the new stop's ID for an event), or null. */
  function commit() {
    if (!canCommit) return null
    if (role === 'day-place') {
      setDayPlace(dayRole, { ...location, label: title.trim() })
      const where = { start: 'starts', end: 'ends', both: 'starts and ends' }[dayRole]
      return { stopId: null, message: `Your day ${where} at ${title.trim()}.` }
    }
    // The same context as the preview, so the committed fit is the one shown.
    addStop({ newStop, afterStopId: option.afterStopId, baseVersion: plan.version, now, ctx })
    return { stopId: id, message: describeAdded(option, plan, id, title) }
  }

  return {
    plan,
    stopId: id,
    title,
    setTitle: setTitleState,
    changeText,
    location,
    pickPlace,
    attachPlace,
    role,
    changeRole,
    dayRole,
    setDayRole,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    fit,
    option,
    canCommit,
    checkingTravel,
    commit,
  }
}
