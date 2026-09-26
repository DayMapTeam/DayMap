import '../components/buttons.css'
import './Trip.css'

function TripToast({ trip }) {
  const { notice } = trip.state
  const stop = trip.noticeStop
  if (!notice || !stop) return null
  return (
    <div className="trip-toast glass" role="status">
      <span className="trip-toast-text">
        {notice.kind === 'arrived' ? `Arrived at ${stop.title}` : `Heading to ${stop.title}`}
      </span>
      {notice.kind === 'auto-started' && trip.state.phase === 'navigating' && (
        <button type="button" className="button-text trip-toast-action" onClick={trip.end}>Cancel</button>
      )}
    </div>
  )
}

/**
 * Bottom left of the map: just Go, which heads to the next stop in the
 * planner. During a trip, a slim bar with the destination and the ways out.
 * Trips also start by themselves when you leave where you are.
 *
 * @param {object} props
 * @param {ReturnType<import('./useTrip.js').useTrip>} props.trip
 * @param {(stopId: string) => void} props.onGo
 * @param {boolean} props.following Whether the camera follows you.
 * @param {boolean} props.hasPosition Whether your location is known.
 * @param {() => void} props.onRecenter
 */
export default function TripDock({ trip, onGo, following, hasPosition, onRecenter }) {
  const { target, next } = trip
  return (
    <div className="trip-dock">
      <TripToast trip={trip} />
      {target ? (
        <section className="trip-bar glass" aria-label="Trip">
          <span className="trip-bar-dot" aria-hidden="true" />
          <span className="trip-bar-text">
            <span className="visually-hidden">Heading to </span>{target.title}
          </span>
          {hasPosition && !following && (
            <button type="button" className="button-text" onClick={onRecenter}>Recenter</button>
          )}
          <button type="button" className="button-text" onClick={trip.arrive}>I’m here</button>
          <button type="button" className="trip-bar-end" aria-label={trip.state.startedBy === 'auto' ? 'Cancel trip' : 'End trip'} onClick={trip.end}>×</button>
        </section>
      ) : next && (
        <button type="button" className="trip-go" aria-label={`Go to ${next.title}`} title={`Go to ${next.title}`} onClick={() => onGo(next.id)}>
          Go
        </button>
      )}
    </div>
  )
}
