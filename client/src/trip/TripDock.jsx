import { useState } from 'react'
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
function NavBar({ trip, navigation, voice, now, timezone, reading, following, hasPosition, onRecenter, walkthrough, onResetWalkthrough }) {
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
        {walkthrough.session && <p className="walkthrough-label">Simulated walk</p>}
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
        {!walkthrough.session && <button type="button" className="nav-pill" onClick={trip.arrive}>I’m here</button>}
        {!walkthrough.session && <a className="nav-pill" href={mapsUrl} target="_blank" rel="noreferrer">
          Google Maps<span className="visually-hidden"> (opens Google Maps navigation)</span>
        </a>}
        <button type="button" className="nav-exit" aria-label={walkthrough.session ? 'End simulated walk' : trip.state.startedBy === 'auto' ? 'Cancel trip' : 'Exit navigation'} onClick={walkthrough.session ? onResetWalkthrough : trip.end}>×</button>
      </div>
    </section>
  )
}

function WalkthroughControls({ walkthrough, onReset, blocked, editingRun, runSheetOpen, runDraftPending, onEditRun, onAddRun, onSetRunStart, onResumeRun }) {
  const [open, setOpen] = useState(false)
  const { pair, pairs, session, status, error, mode, dayIssue } = walkthrough
  if (!open && !session && status !== 'loading' && status !== 'finished') {
    return <button type="button" className="walkthrough-open glass" onClick={() => setOpen(true)}>Test run</button>
  }
  return (
    <section className="walkthrough-panel glass" aria-label="Test run controls">
      <div className="walkthrough-heading">
        <strong>Test run</strong>
        {!session && status !== 'loading' && <button type="button" className="button-text" onClick={() => { setOpen(false); walkthrough.dismissFinished() }}>Close</button>}
      </div>
      {session ? (
        <>
          <p className="walkthrough-route">{session.fromTitle} → {session.toTitle}</p>
          {session.kind === 'day' && <p className="walkthrough-progress">
            Stop {Math.max(1, walkthrough.itinerary.findIndex(({ id }) => id === session.toId))} of {Math.max(1, walkthrough.itinerary.length - 1)}
          </p>}
          <p className="walkthrough-status" role="status">
            {status === 'loading' ? 'Finding the next walking route…' : editingRun ? 'Paused while you edit your day' :
              session.finishTicks >= 2 ? `At ${session.toTitle}` : session.playing ? 'Following the walking route' : 'Paused'}
          </p>
          {error && <p className="walkthrough-error" role="alert">{error}</p>}
          <div className="walkthrough-actions">
            {editingRun ? <button type="button" className="nav-pill" disabled={runSheetOpen || runDraftPending || blocked} onClick={onResumeRun}>Return to run</button>
              : <button type="button" className="nav-pill" disabled={status === 'loading'} onClick={session.playing ? walkthrough.pause : walkthrough.resume}>
                {session.playing ? 'Pause' : session.finishTicks >= 2 ? 'Continue' : 'Resume'}
              </button>}
            {!editingRun && <button type="button" className="nav-pill" disabled={status === 'loading'} onClick={walkthrough.skip}>
              {session.kind === 'day' ? 'Skip to next stop' : 'Skip to arrival'}
            </button>}
            <label className="walkthrough-speed">Speed
              <select value={session.speed} onChange={(event) => walkthrough.setSpeed(Number(event.target.value))}>
                <option value="10">10×</option><option value="30">30×</option><option value="60">60×</option><option value="120">120×</option>
              </select>
            </label>
            <button type="button" className="nav-pill" onClick={onReset}>End run</button>
          </div>
          {session.kind === 'day' && <div className="walkthrough-actions">
            <button type="button" className="nav-pill" onClick={onAddRun}>+ Add stop</button>
            <button type="button" className="nav-pill" onClick={onEditRun}>Edit day</button>
          </div>}
          {editingRun && <p className="walkthrough-help">Accept your planner changes, then return to the run. The next route will use your updated day.</p>}
          {editingRun && runDraftPending && <p className="walkthrough-error">Accept or discard the pending plan changes first.</p>}
        </>
      ) : status === 'finished' ? (
        <>
          <p className="walkthrough-status" role="status">Run complete. You’re back at your planner.</p>
          <button type="button" className="nav-pill walkthrough-start" onClick={() => { walkthrough.dismissFinished(); setOpen(true) }}>Run again</button>
        </>
      ) : (
        <>
          <p className="walkthrough-help">Replay walking routes at 10–120× speed. Your GPS and saved day stay separate from the simulation.</p>
          <div className="walkthrough-mode" role="group" aria-label="Run scope">
            <button type="button" aria-pressed={mode === 'day'} onClick={() => walkthrough.setMode('day')}>Whole day</button>
            <button type="button" aria-pressed={mode === 'pair'} onClick={() => walkthrough.setMode('pair')}>One journey</button>
          </div>
          {mode === 'day' ? <>
            <p className="walkthrough-help">Start at Day start, visit your events in order, then Day end if set.</p>
            {dayIssue && <p className="walkthrough-error">{dayIssue}</p>}
            {dayIssue && <button type="button" className="nav-pill" onClick={dayIssue.startsWith('Set a located Day start') ? onSetRunStart : onEditRun}>
              {dayIssue.startsWith('Set a located Day start') ? 'Set Day start' : 'Open planner'}
            </button>}
          </> : <>
            <label className="walkthrough-pair">From → to
              <select value={pair?.id ?? ''} onChange={(event) => walkthrough.setSelectedPairId(event.target.value)} disabled={!pairs.length || status === 'loading'}>
                {pairs.map(({ id, from, to }) => <option key={id} value={id}>{from.title} → {to.title}</option>)}
              </select>
            </label>
            {!pairs.length && <p className="walkthrough-error">Add two events with different map locations to test a journey.</p>}
          </>}
          {error && <p className="walkthrough-error" role="alert">{error}</p>}
          <button type="button" className="nav-pill walkthrough-start" disabled={(mode === 'day' ? Boolean(dayIssue) : !pair) || status === 'loading' || blocked} onClick={walkthrough.start}>
            {status === 'loading' ? 'Finding walking route…' : 'Start test run'}
          </button>
        </>
      )}
    </section>
  )
}

/**
 * Bottom left of the map: Go and a browser-only route replay. During a trip,
 * live turn-by-turn guidance. Trips also start when you leave where you are.
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
export default function TripDock({ trip, navigation, voice, now, timezone, reading, onGo, following, hasPosition, onRecenter,
  walkthrough, onResetWalkthrough, editingRun, runSheetOpen, runDraftPending, onEditRun, onAddRun, onSetRunStart,
  onResumeRun, recoveryControl }) {
  const { target, next } = trip
  const controls = <WalkthroughControls walkthrough={walkthrough} onReset={onResetWalkthrough} blocked={false}
    {...{ editingRun, runSheetOpen, runDraftPending, onEditRun, onAddRun, onSetRunStart, onResumeRun }} />
  if (target) {
    return (
      <>
        {!editingRun && <NavBanner navigation={navigation} timezone={timezone} destination={target.title} />}
        <div className="trip-dock trip-dock-navigating">
          <TripToast trip={trip} />
          {walkthrough.session && controls}
          {recoveryControl}
          {!editingRun && <NavBar {...{ trip, navigation, voice, now, timezone, reading, following, hasPosition, onRecenter, walkthrough, onResetWalkthrough }} />}
        </div>
      </>
    )
  }
  return (
    <div className="trip-dock">
      <TripToast trip={trip} />
      {recoveryControl}
      {next && !walkthrough.session && walkthrough.status !== 'loading' && (
        <button type="button" className="trip-go" aria-label={`Go to ${next.title}`} title={`Go to ${next.title}`} onClick={() => onGo(next.id)}>
          Go
        </button>
      )}
      {controls}
    </div>
  )
}
