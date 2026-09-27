import { formatClock } from '../components/formatTime.js'
import { directionsUrl } from './tripRules.js'
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
        <p className="nav-distance">{distance === null ? '' : formatDistance(distance)}</p>
        <p className="nav-instruction">
          Board <LineBadge ride={ride} /> {ride.vehicle.toLowerCase()}{ride.headsign ? ` to ${ride.headsign}` : ''}
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

function FlagIcon() {
  return (
    <span className="nav-step-icon">
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 21V4m0 1h11l-2.5 4L17 13H6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

const stepName = (step) => (step.kind === 'ride' && step.ride ? `${step.ride.vehicle.toLowerCase()} ${step.ride.name}` : step.instruction ?? 'continue')

/**
 * Top of the screen while navigating, like Google Maps: the next turn and how
 * far away it is (or, on a bus or train, where to get off), and the one after.
 */
function NavBanner({ navigation, timezone, destination }) {
  const { route, progress } = navigation
  const stepIndex = progress?.stepIndex ?? 0
  const current = route?.steps[stepIndex] ?? null
  const next = route?.steps[stepIndex + 1] ?? null
  const distance = progress ? progress.toStepEndMeters : current?.distanceMeters ?? 0
  let body = <p className="nav-waiting" role="status">{WAITING[navigation.status] ?? WAITING.loading}</p>
  let then = null
  if (current?.kind === 'ride' && current.ride) {
    body = (
      <div className="nav-step">
        <StepIcon step={current} />
        <div className="nav-step-text">
          <p className="nav-instruction"><LineBadge ride={current.ride} /> Get off at {current.ride.toStop ?? 'your stop'}</p>
          <p className="nav-detail">{formatDistance(distance)}{current.ride.arriveAt ? ` · ${formatClock(current.ride.arriveAt, timezone)}` : ''}</p>
        </div>
      </div>
    )
    then = next
  } else if (current && next) {
    body = (
      <div className="nav-step">
        <StepIcon step={next} />
        <div className="nav-step-text">
          <StepText step={next} distance={distance} timezone={timezone} />
        </div>
      </div>
    )
    then = route.steps[stepIndex + 2] ?? null
  } else if (current) {
    body = (
      <div className="nav-step">
        <FlagIcon />
        <div className="nav-step-text">
          <p className="nav-distance">{formatDistance(distance)}</p>
          <p className="nav-instruction">Arrive at {destination}</p>
        </div>
      </div>
    )
  }
  return (
    <section className="nav-banner" aria-live="polite" aria-label="Directions">
      {body}
      {then && <p className="nav-then">Then {stepName(then)}</p>}
    </section>
  )
}

function SpeakerIcon({ muted }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" fill="currentColor" />
      {muted
        ? <path d="m13.5 7.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        : <path d="M13.5 7.2a4 4 0 0 1 0 5.6M15.8 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  )
}

/** Bottom of the screen while navigating: time left, arrival, and controls. */
function NavBar({ trip, navigation, voice, now, timezone, reading, following, hasPosition, onRecenter }) {
  const { target } = trip
  const { route, progress } = navigation
  const remainingSeconds = progress?.remainingSeconds ?? route?.seconds ?? null
  const remainingMeters = progress?.remainingMeters ?? route?.distanceMeters ?? null
  const eta = remainingSeconds === null ? null : now.getTime() + remainingSeconds * 1000
  const start = Date.parse(target.timing.scheduledStartAt)
  const late = eta === null || !Number.isFinite(start) ? null : Math.ceil((eta - start) / 60000)
  const mapsUrl = directionsUrl(target.location, navigation.mode ?? 'walk', reading, { navigate: true })

  return (
    <section className="nav-bar glass" aria-label={`Navigating to ${target.title}`}>
      <div className="nav-bar-info">
        {remainingSeconds !== null ? (
          <>
            <p className={`nav-bar-time${late > 0 ? ' nav-late' : ''}`}>{Math.max(1, Math.round(remainingSeconds / 60))} min</p>
            <p className="nav-bar-detail">
              {remainingMeters !== null ? `${formatDistance(remainingMeters)} · ` : ''}arrive {formatClock(eta, timezone)}
              {late !== null && (late > 0 ? ` · ${late} min late` : ' · on time')}
            </p>
          </>
        ) : <p className="nav-bar-time">…</p>}
        <p className="nav-bar-destination">{target.title}</p>
      </div>
      <div className="nav-bar-actions">
        {voice.supported && (
          <button type="button" className="nav-round" aria-pressed={!voice.muted} aria-label={voice.muted ? 'Turn voice on' : 'Mute voice'} onClick={voice.toggleMuted}>
            <SpeakerIcon muted={voice.muted} />
          </button>
        )}
        {hasPosition && !following && <button type="button" className="nav-pill" onClick={onRecenter}>Re-centre</button>}
        <button type="button" className="nav-pill" onClick={trip.arrive}>I’m here</button>
        <a className="nav-pill" href={mapsUrl} target="_blank" rel="noreferrer">
          Google Maps<span className="visually-hidden"> (opens Google Maps navigation)</span>
        </a>
        <button type="button" className="nav-exit" aria-label={trip.state.startedBy === 'auto' ? 'Cancel trip' : 'Exit navigation'} onClick={trip.end}>×</button>
      </div>
    </section>
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
 * @param {ReturnType<import('./useVoiceGuidance.js').useVoiceGuidance>} props.voice
 * @param {{ lat: number, lng: number } | null} props.reading Your position, for the Google Maps handoff.
 * @param {Date} props.now
 * @param {string} props.timezone
 * @param {(stopId: string) => void} props.onGo
 * @param {boolean} props.following Whether the camera follows you.
 * @param {boolean} props.hasPosition Whether your location is known.
 * @param {() => void} props.onRecenter
 * @param {import('react').ReactNode} props.recoveryControl Compact departure/recovery disclosure.
 */
export default function TripDock({ trip, navigation, voice, now, timezone, reading, onGo, following, hasPosition, onRecenter, recoveryControl }) {
  const { target, next } = trip
  if (target) {
    return (
      <>
        <NavBanner navigation={navigation} timezone={timezone} destination={target.title} />
        <div className="trip-dock trip-dock-navigating">
          <TripToast trip={trip} />
          {recoveryControl}
          <NavBar {...{ trip, navigation, voice, now, timezone, reading, following, hasPosition, onRecenter }} />
        </div>
      </>
    )
  }
  return (
    <div className="trip-dock">
      <TripToast trip={trip} />
      {recoveryControl}
      {next && (
        <button type="button" className="trip-go" aria-label={`Go to ${next.title}`} title={`Go to ${next.title}`} onClick={() => onGo(next.id)}>
          Go
        </button>
      )}
    </div>
  )
}
