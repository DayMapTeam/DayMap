import { formatClock, formatTimeRange } from '../components/formatTime.js'
import { bearingDegrees, compassLabel, directionsUrl, distanceMeters, walkingSecondsEstimate } from './tripRules.js'
import { SIMULATED_SPEEDUP } from './useSimulatedWalk.js'
import '../components/buttons.css'
import './Trip.css'

function formatDistance(meters) {
  return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`
}

const minutes = (seconds) => Math.max(1, Math.ceil(seconds / 60))

function LocationControl({ location }) {
  if (location.status === 'on' || location.status === 'requesting') return null
  if (location.status === 'denied') {
    return <p className="trip-hint">Location is blocked in your browser settings. Go and “I’m here” still work.</p>
  }
  if (location.status === 'unsupported') return <p className="trip-hint">This browser can’t share your location.</p>
  return (
    <button type="button" className="button-text trip-location" onClick={location.enable}>
      {location.status === 'unavailable' ? 'Location signal lost · Retry' : 'Use my location'}
    </button>
  )
}

function SimulateButton({ sim, to }) {
  if (!sim) return null
  return (
    <button type="button" className="button-text" disabled={sim.walking} onClick={() => sim.walkTo(to.location)}>
      {sim.walking ? 'Walking… (simulated)' : 'Simulate walk'}
    </button>
  )
}

/** The trip in progress: distance, rough ETA against the stop's start, and the ways out. */
function NavigatingCard({ trip, plan, now, reading, location, following, onRecenter, sim }) {
  const { target, atStop, state } = trip
  const start = Date.parse(target.timing.scheduledStartAt)
  const distance = reading ? distanceMeters(reading, target.location) : null
  const seconds = distance === null ? null : walkingSecondsEstimate(distance)
  const lateMinutes = seconds === null ? null : Math.ceil((now.getTime() + seconds * 1000 - start) / 60000)
  const schedule = lateMinutes === null
    ? `Starts ${formatClock(start, plan.timezone)}`
    : lateMinutes > 0
      ? `About ${lateMinutes} min late · starts ${formatClock(start, plan.timezone)}`
      : `On time · starts ${formatClock(start, plan.timezone)}`

  return (
    <section className="trip-card glass" aria-label="Trip">
      <p className="trip-eyebrow">
        {state.startedBy === 'auto' && atStop ? `Started when you left ${atStop.title}` : 'Heading to'}
      </p>
      <h2 className="trip-title">{target.title}</h2>
      <p className="trip-primary">
        {distance === null
          ? 'Your location is off'
          : `${formatDistance(distance)} ${compassLabel(bearingDegrees(reading, target.location))} · ≈ ${minutes(seconds)} min walk`}
      </p>
      <p className={`trip-secondary${lateMinutes > 0 ? ' trip-late' : ''}`}>{schedule}</p>
      {reading?.simulated && <p className="trip-hint">Simulated position, {SIMULATED_SPEEDUP}× walking speed.</p>}
      {distance !== null && <p className="trip-hint">Straight-line estimate. Open Google Maps for turn-by-turn directions.</p>}
      <div className="trip-actions">
        <button type="button" className="button-filled" onClick={trip.arrive}>I’m here</button>
        <a className="button-text trip-link" href={directionsUrl(target.location)} target="_blank" rel="noreferrer">
          Google Maps<span className="visually-hidden"> (opens in a new tab)</span>
        </a>
        {reading && !following && <button type="button" className="button-text" onClick={onRecenter}>Recenter</button>}
        <SimulateButton sim={sim} to={target} />
        {!sim && <LocationControl location={location} />}
        <button type="button" className="button-text trip-end" onClick={trip.end}>
          {state.startedBy === 'auto' ? 'Cancel' : 'End'}
        </button>
      </div>
    </section>
  )
}

/** Leaving well before a stop ends: ask before starting. */
function AskCard({ trip, plan }) {
  const { askStop, atStop } = trip
  return (
    <section className="trip-card glass" aria-label="Trip">
      <p className="trip-eyebrow">{atStop ? `You left ${atStop.title} early` : 'You’re on the move'}</p>
      <h2 className="trip-title">Heading to {askStop.title}?</h2>
      <p className="trip-secondary">
        {formatTimeRange(askStop.timing.scheduledStartAt, askStop.timing.scheduledEndAt, plan.timezone)}
      </p>
      <div className="trip-actions">
        <button type="button" className="button-filled" onClick={trip.acceptAsk}>Go</button>
        <button type="button" className="button-text" onClick={trip.dismissAsk}>Not yet</button>
      </div>
    </section>
  )
}

/** The next stop, how far it is, and when to leave. */
function NextCard({ trip, plan, now, reading, legs, location, onGo, sim }) {
  const { next, atStop } = trip
  const start = Date.parse(next.timing.scheduledStartAt)
  const started = start <= now.getTime()
  let travel = null
  if (reading) {
    travel = `≈ ${minutes(walkingSecondsEstimate(distanceMeters(reading, next.location)))} min walk from here`
  } else {
    const leg = legs.find((candidate) => candidate.toStopId === next.id && candidate.status === 'ready')
    const from = leg && plan.stops.find((stop) => stop.id === leg.fromStopId)
    if (leg && from) {
      const leaveBy = start - (leg.travelSeconds + leg.bufferSeconds) * 1000
      travel = `${minutes(leg.travelSeconds)} min walk from ${from.title} · leave by ${formatClock(leaveBy, plan.timezone)}`
    }
  }

  return (
    <section className="trip-card glass" aria-label="Next stop">
      <p className="trip-eyebrow">{atStop ? `At ${atStop.title} · next` : started ? 'Now' : 'Next'}</p>
      <h2 className="trip-title">{next.title}</h2>
      <p className="trip-secondary">
        {formatTimeRange(next.timing.scheduledStartAt, next.timing.scheduledEndAt, plan.timezone)}
        {next.location.label ? ` · ${next.location.label}` : ''}
      </p>
      {travel && <p className="trip-primary">{travel}</p>}
      {atStop && location.status === 'on' && (
        <p className="trip-hint">Directions start by themselves when you leave.</p>
      )}
      <div className="trip-actions">
        <button type="button" className="button-filled" onClick={() => onGo(next.id)}>Go</button>
        <SimulateButton sim={sim} to={next} />
        {!sim && <LocationControl location={location} />}
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
        {notice.kind === 'arrived' ? `Arrived at ${stop.title}` : `Directions to ${stop.title} started`}
      </span>
      {notice.kind === 'auto-started' && trip.state.phase === 'navigating' && (
        <button type="button" className="button-text trip-toast-action" onClick={trip.end}>Cancel</button>
      )}
    </div>
  )
}

/**
 * Trip controls, floating over the map next to the planner. The planner itself
 * is untouched, so ending a trip leaves it exactly as it was.
 *
 * @param {object} props
 * @param {ReturnType<import('./useTrip.js').useTrip>} props.trip
 * @param {object} props.plan The accepted plan.
 * @param {Date} props.now
 * @param {{ lat: number, lng: number, accuracy?: number, simulated?: boolean } | null} props.reading
 * @param {Array} props.legs Journey estimates for the accepted plan, for "leave by".
 * @param {ReturnType<import('./useLocation.js').useLocation>} props.location
 * @param {(stopId: string) => void} props.onGo
 * @param {boolean} props.following Whether the camera follows the person.
 * @param {() => void} props.onRecenter
 * @param {ReturnType<import('./useSimulatedWalk.js').useSimulatedWalk> | null} props.sim Demo plans only.
 */
export default function TripDock({ trip, plan, now, reading, legs, location, onGo, following, onRecenter, sim }) {
  let card = null
  if (trip.target) {
    card = <NavigatingCard {...{ trip, plan, now, reading, location, following, onRecenter, sim }} />
  } else if (trip.askStop) {
    card = <AskCard trip={trip} plan={plan} />
  } else if (trip.next) {
    card = <NextCard {...{ trip, plan, now, reading, legs, location, onGo, sim }} />
  }
  return (
    <div className="trip-dock">
      <TripToast trip={trip} />
      {card}
    </div>
  )
}
