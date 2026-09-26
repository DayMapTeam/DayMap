import { formatClock } from '../components/formatTime.js'
import '../components/buttons.css'
import LineBadge from '../planner/LineBadge.jsx'
import TravelModeIcon from '../planner/TravelModeIcon.jsx'
import './Trip.css'

const TURNS = {
  TURN_SLIGHT_LEFT: -45, TURN_LEFT: -90, TURN_SHARP_LEFT: -135, UTURN_LEFT: 180, FORK_LEFT: -30, RAMP_LEFT: -30, MERGE: 0,
  TURN_SLIGHT_RIGHT: 45, TURN_RIGHT: 90, TURN_SHARP_RIGHT: 135, UTURN_RIGHT: 180, FORK_RIGHT: 30, RAMP_RIGHT: 30,
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`
}

/** The turn to make, as an arrow; a vehicle icon while riding. */
function StepIcon({ step }) {
  if (step.kind === 'ride') return <span className="nav-step-icon"><TravelModeIcon mode="transit" size={22} /></span>
  const angle = TURNS[step.maneuver] ?? 0
  return (
    <span className="nav-step-icon">
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${angle}deg)` }}>
        <path d="M12 20V5M6 10.5 12 4.5l6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function StepText({ step, distance, timezone }) {
  if (step.kind === 'ride' && step.ride) {
    const { ride } = step
    return (
      <>
        <p className="nav-instruction">
          <LineBadge ride={ride} /> {ride.vehicle}{ride.headsign ? ` to ${ride.headsign}` : ''}
        </p>
        <p className="nav-detail">
          {ride.fromStop ? `Board at ${ride.fromStop}` : 'Board'}{ride.departAt ? ` · ${formatClock(ride.departAt, timezone)}` : ''}
          {ride.toStop ? ` · get off at ${ride.toStop}` : ''}{ride.stopCount ? ` (${ride.stopCount} stops)` : ''}
        </p>
      </>
    )
  }
  return (
    <>
      <p className="nav-distance">{distance === null ? formatDistance(step.distanceMeters) : formatDistance(distance)}</p>
      <p className="nav-instruction">{step.instruction ?? 'Continue'}</p>
    </>
  )
}

const WAITING = {
  loading: 'Finding the route…',
  'no-origin': 'Waiting for your location…',
  error: 'No route found from here.',
  unavailable: 'Route guidance needs Google Maps.',
  idle: 'Finding the route…',
}

/** Turn-by-turn guidance for the trip in progress. */
function NavigationCard({ trip, navigation, now, timezone, following, hasPosition, onRecenter }) {
  const { target } = trip
  const { route, progress } = navigation
  const stepIndex = progress?.stepIndex ?? 0
  const step = route?.steps[stepIndex] ?? null
  const upcoming = route?.steps[stepIndex + 1] ?? null
  const remainingSeconds = progress?.remainingSeconds ?? route?.seconds ?? null
  const remainingMeters = progress?.remainingMeters ?? route?.distanceMeters ?? null
  const eta = remainingSeconds === null ? null : now.getTime() + remainingSeconds * 1000
  const start = Date.parse(target.timing.scheduledStartAt)
  const late = eta === null || !Number.isFinite(start) ? null : Math.ceil((eta - start) / 60000)

  return (
    <section className="nav-card glass" aria-label={`Navigating to ${target.title}`}>
      {step ? (
        <div className="nav-step" aria-live="polite">
          <StepIcon step={step} />
          <div className="nav-step-text">
            <StepText step={step} distance={progress ? progress.toStepEndMeters : null} timezone={timezone} />
            {upcoming && <p className="nav-then">Then: {upcoming.kind === 'ride' && upcoming.ride ? `${upcoming.ride.vehicle} ${upcoming.ride.name}` : upcoming.instruction}</p>}
          </div>
        </div>
      ) : (
        <p className="nav-waiting" role="status">{WAITING[navigation.status] ?? WAITING.loading}</p>
      )}
      <div className="nav-summary">
        <span className="nav-destination">{target.title}</span>
        {remainingSeconds !== null && (
          <span className="nav-remaining">
            <strong>{Math.max(1, Math.round(remainingSeconds / 60))} min</strong>
            {remainingMeters !== null ? ` · ${formatDistance(remainingMeters)}` : ''}
            {` · arrive ${formatClock(eta, timezone)}`}
            {late !== null && <span className={late > 0 ? 'nav-late' : 'nav-on-time'}>{late > 0 ? ` · ${late} min late` : ' · on time'}</span>}
          </span>
        )}
      </div>
      <div className="nav-actions">
        {hasPosition && !following && <button type="button" className="button-text" onClick={onRecenter}>Recenter</button>}
        <button type="button" className="button-text" onClick={trip.arrive}>I’m here</button>
        <button type="button" className="button-text nav-end" onClick={trip.end}>{trip.state.startedBy === 'auto' ? 'Cancel' : 'End'}</button>
      </div>
    </section>
  )
}

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
 * planner. During a trip, live turn-by-turn guidance. Trips also start by
 * themselves when you leave where you are.
 *
 * @param {object} props
 * @param {ReturnType<import('./useTrip.js').useTrip>} props.trip
 * @param {ReturnType<import('./useNavigation.js').useNavigation>} props.navigation
 * @param {Date} props.now
 * @param {string} props.timezone
 * @param {(stopId: string) => void} props.onGo
 * @param {boolean} props.following Whether the camera follows you.
 * @param {boolean} props.hasPosition Whether your location is known.
 * @param {() => void} props.onRecenter
 */
export default function TripDock({ trip, navigation, now, timezone, onGo, following, hasPosition, onRecenter }) {
  const { target, next } = trip
  return (
    <div className="trip-dock">
      <TripToast trip={trip} />
      {target ? (
        <NavigationCard {...{ trip, navigation, now, timezone, following, hasPosition, onRecenter }} />
      ) : next && (
        <button type="button" className="trip-go" aria-label={`Go to ${next.title}`} title={`Go to ${next.title}`} onClick={() => onGo(next.id)}>
          Go
        </button>
      )}
    </div>
  )
}
