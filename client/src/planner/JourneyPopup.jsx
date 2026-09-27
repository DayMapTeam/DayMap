
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePlan } from '../app/planContext.js'
import { formatClock, formatDuration } from '../components/formatTime.js'
import '../components/buttons.css'
import { TRAVEL_BUFFERS, chooseMode } from '../services/planningContext.js'
import { directionsUrl } from '../trip/tripRules.js'
import { pickService } from './journeySummary.js'
import { MODE_WORDS } from './stopLabels.js'
import LineBadge from './LineBadge.jsx'
import TravelModeIcon from './TravelModeIcon.jsx'
import './JourneyPopup.css'

const MAX_SERVICES = 5
const MODE_TITLES = { walk: 'Walk', transit: 'Public transport', drive: 'Car' }
const MODE_NOTES = {
  walk: null,
  transit: 'Includes walking to and from stops.',
  drive: `Plus ${TRAVEL_BUFFERS.drive} min to park.`,
}

function estimateText(estimate) {
  if (estimate?.status === 'ready') return formatDuration(Math.max(1, Math.ceil(estimate.travelSeconds / 60)))
  if (estimate?.status === 'unavailable') return estimate.reason === 'no-route' ? 'No route' : 'Unavailable'
  return 'Checking…'
}

function Service({ option, timezone, name, checked, onChoose }) {
  const [open, setOpen] = useState(false)
  const stepsId = useId()
  const rides = option.steps.filter((step) => step.kind === 'ride')
  const first = rides[0]
  return (
    <li className="journey-service" data-checked={checked || undefined}>
      <label className="journey-service-head">
        <input className="visually-hidden" type="radio" name={name} checked={checked} onChange={onChoose} />
        <span className="journey-service-lines">
          {rides.map((ride, index) => <LineBadge key={index} ride={ride} />)}
          <span className="journey-service-vehicle">
            {first.vehicle}{first.headsign ? ` to ${first.headsign}` : ''}{rides.length > 1 ? ` + ${rides.length - 1} change${rides.length > 2 ? 's' : ''}` : ''}
          </span>
        </span>
        <span className="journey-service-times">
          Leave {formatClock(option.leaveAt, timezone)} · arrive {formatClock(option.arriveAt, timezone)}
        </span>
        <span className="journey-service-meta">
          {option.minutes !== null ? formatDuration(option.minutes) : ''}{option.walkMinutes ? ` · ${option.walkMinutes} min walking` : ''}
        </span>
      </label>
      <button type="button" className="journey-service-toggle" aria-expanded={open} aria-controls={stepsId}
        aria-label={open ? 'Hide steps' : 'Show steps'} onClick={() => setOpen(!open)}>
        <svg className="journey-service-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ol id={stepsId} className="journey-steps">
          {option.steps.map((step, index) => (
            <li key={index} className="journey-step" data-kind={step.kind}>
              {step.kind === 'walk' ? (
                <><TravelModeIcon mode="walk" size={12} /> Walk {step.minutes} min</>
              ) : (
                <>
                  <LineBadge ride={step} />
                  <span>
                    {step.fromStop ? `From ${step.fromStop} at ${formatClock(step.departAt, timezone)}` : `Departs ${formatClock(step.departAt, timezone)}`}
                    {step.stopCount ? `, ${step.stopCount} stops` : ''}
                    {step.toStop ? ` to ${step.toStop}` : ''} ({formatClock(step.arriveAt, timezone)})
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

/**
 * How to make one journey: walk, public transport or car, each with its time,
 * or Automatic. Choosing sets the mode for this journey only. Public transport
 * chosen lists the real services from Google, with the walking they involve;
 * picking one makes it the service the planner shows (for this session only).
 *
 * @param {object} props
 * @param {object} props.from Stop the journey starts at.
 * @param {object} props.to Stop the journey goes to; its `travelMode` is the choice.
 * @param {object} props.planning The planner's analysis (estimates and requests).
 * @param {() => void} props.onClose
 */
export default function JourneyPopup({ from, to, planning, onClose }) {
  const { plan, setStopTravelMode } = usePlan()
  const titleId = useId()
  const closeRef = useRef(null)
  const { timezone } = planning.shown
  const departAt = planning.departureFor(from, to)
  const estimates = planning.journeyEstimates(from, to)
  const automatic = chooseMode(from, { ...to, travelMode: null }, 'auto', planning.ctx.travel).mode
  const chosen = to.travelMode ?? null
  const live = planning.provider === 'google'
  const previousLeg = planning.analysis.legs.find((leg) => leg.toStopId === from.id && leg.status === 'ready')
  const carElsewhere = previousLeg && previousLeg.mode !== 'drive'

  const { requestAllModes, requestTransit } = planning
  useEffect(() => {
    requestAllModes(from, to)
    requestTransit(from, to)
  }, [requestAllModes, requestTransit, from, to])
  const services = planning.transitServicesFor(from, to)
  const shownServices = { ...services, status: services.status === 'ready' || services.status === 'error' ? services.status : 'loading' }
  // The service the planner line shows: the user's pick, or the suggested one.
  const pickedService = pickService(services)
  const chooseService = (option) => planning.chooseTransit(from, to, option.id)

  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()
    return () => { if (opener instanceof HTMLElement) opener.focus() }
  }, [])
  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  const choose = (mode) => setStopTravelMode(to.id, mode)
  const mapsMode = chosen ?? automatic
  const rows = [
    { mode: null, title: 'Automatic', value: `Now: ${MODE_WORDS[automatic]}`, note: 'The quickest sensible way.' },
    ...['walk', 'drive', 'transit'].map((mode) => ({ mode, title: MODE_TITLES[mode], value: estimateText(estimates[mode]), note: MODE_NOTES[mode] })),
  ]

  return createPortal(
    <div className="journey-scrim" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="journey-popup glass" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div className="journey-head">
          <div>
            <p className="journey-eyebrow">Journey</p>
            <h2 id={titleId} className="journey-title">{from.title} → {to.title}</h2>
            <p className="journey-when">
              {departAt ? `Leave after ${formatClock(departAt, timezone)}` : 'Departure time not set'}
              {to.timing.scheduledStartAt ? ` · starts ${formatClock(to.timing.scheduledStartAt, timezone)}` : ''}
            </p>
          </div>
          <button ref={closeRef} type="button" className="journey-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {/* The popup keeps one size; the modes and services scroll between the header and the actions. */}
        <div className="journey-body">
          <fieldset className="journey-modes">
            <legend className="journey-section">How will you get there?</legend>
            {rows.map((row) => (
              <label key={row.mode ?? 'auto'} className="journey-mode" data-checked={chosen === row.mode || undefined}>
                <input className="visually-hidden" type="radio" name={`${titleId}-mode`} checked={chosen === row.mode} onChange={() => choose(row.mode)} />
                <span className="journey-mode-icon"><TravelModeIcon mode={row.mode} size={16} /></span>
                <span className="journey-mode-text">
                  <span className="journey-mode-title">{row.title}</span>
                  {row.note && <span className="journey-mode-note">{row.note}</span>}
                  {row.mode === 'drive' && carElsewhere && (
                    <span className="journey-mode-warning">You won’t come to {from.title} by car, so your car may not be there.</span>
                  )}
                </span>
                <span className="journey-mode-value">{row.value}</span>
              </label>
            ))}
          </fieldset>

          {chosen === 'transit' && <section className="journey-services" aria-label="Public transport services">
            <p className="journey-section">
              Buses and trains{departAt ? ` after ${formatClock(departAt, timezone)}` : ''}
            </p>
            {!live && <p className="journey-hint">Live bus and train times need Google Maps. This demo uses simulated journey times.</p>}
            {live && shownServices.status === 'loading' && <p className="journey-hint" role="status">Finding services…</p>}
            {live && shownServices.status === 'error' && <p className="journey-hint">Google couldn’t list services right now.</p>}
            {live && shownServices.status === 'ready' && shownServices.options.length === 0 && (
              <p className="journey-hint">No public transport found for this trip at this time.</p>
            )}
            {shownServices.options.length > 0 && (
              <ul className="journey-service-list">
                {shownServices.options.slice(0, MAX_SERVICES).map((option) => (
                  <Service key={option.id} option={option} timezone={timezone} name={`${titleId}-service`}
                    checked={pickedService?.id === option.id} onChoose={() => chooseService(option)} />
                ))}
              </ul>
            )}
          </section>}
        </div>

        <div className="journey-actions">
          <a className="button-text" href={directionsUrl(to.location, mapsMode, from.location)} target="_blank" rel="noreferrer">
            Open in Google Maps<span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          <button type="button" className="button-filled" onClick={onClose}>Done</button>
        </div>
        {plan.dataMode === 'demo' && !live && <p className="journey-hint">Simulated times for the demo day.</p>}
      </div>
    </div>,
    document.body,
  )
}
