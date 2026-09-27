import { useEffect, useState } from 'react'
import { usePlan } from '../app/planContext.js'
import { numberStops } from '../app/stopNumbers.js'
import { formatTimeRange } from '../components/formatTime.js'
import PlacePopup from '../components/PlacePopup.jsx'
import { getPlaceDetails } from '../services/placesService.js'
import { KIND_LABELS } from './stopLabels.js'
import '../components/buttons.css'

// Details for the stop's place, ignoring responses for a place no longer shown.
function usePlaceDetails(placeId) {
  const [result, setResult] = useState({ placeId: null, details: null })

  useEffect(() => {
    if (placeId === null) return
    let cancelled = false
    getPlaceDetails(placeId).then((details) => {
      if (!cancelled) setResult({ placeId, details })
    })
    return () => {
      cancelled = true
    }
  }, [placeId])

  return result.placeId === placeId ? result.details : null
}

/**
 * Popup for a stop whose pin was clicked. Shows the draft when there is one,
 * like the planner does. `onDirections(stopId)` starts a trip there, or is null
 * when the stop can't be navigated to (no location, not planned, all-day).
 */
export default function StopPopup({ stopId, anchor, onClose, onViewInPlanner, onDirections = null }) {
  const { plan, draft } = usePlan()
  const shown = draft?.plan ?? plan
  const stop = shown.stops.find((candidate) => candidate.id === stopId)
  const details = usePlaceDetails(stop?.location?.placeId ?? null)
  if (!stop) return null

  const { timing } = stop
  const number = numberStops(shown.stops).get(stop.id)
  const time = timing.scheduledStartAt !== null && timing.scheduledEndAt !== null
    ? formatTimeRange(timing.scheduledStartAt, timing.scheduledEndAt, shown.timezone)
    : 'Time not set'

  return (
    <PlacePopup
      anchor={anchor}
      title={stop.title}
      badge={number === undefined ? null : { number, kind: timing.kind }}
      photoUrl={details?.photoUrl ?? null}
      onClose={onClose}
    >
      {details && (
        <p className="place-popup-meta">
          {details.rating !== null && <strong>{details.rating} ★</strong>}
          {details.userRatingsTotal !== null && ` · (${details.userRatingsTotal.toLocaleString('en-AU')})`}
          {details.category && ` · ${details.category}`}
        </p>
      )}
      <p className="place-popup-time">{time} · {KIND_LABELS[timing.kind]}</p>
      <p className="place-popup-sub">{details?.address ?? stop.location?.label ?? 'Location needed'}</p>
      <button type="button" className="button-filled place-popup-action" onClick={() => onViewInPlanner(stop.id)}>
        View in planner
      </button>
      {onDirections && (
        <button type="button" className="button-text place-popup-action" onClick={() => onDirections(stop.id)}>
          Directions
        </button>
      )}
    </PlacePopup>
  )
}
