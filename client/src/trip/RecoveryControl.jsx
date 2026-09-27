import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { formatClock } from '../components/formatTime.js'
import TravelModeIcon from '../planner/TravelModeIcon.jsx'
import { laterStartEdit, MODE_NAMES } from './recovery.js'
import './RecoveryControl.css'

/** A single quiet disclosure beside navigation. No planner rows, auto-opening dialogs, or repeated toast alerts. */
export default function RecoveryControl({ recovery, plan, navigating, onChoose, onReview, draft }) {
  const [open, setOpen] = useState(false)
  const [snoozed, setSnoozed] = useState(null)
  const root = useRef(null)
  const trigger = useRef(null)
  const id = useId()
  const [panelHeight, setPanelHeight] = useState(360)
  useLayoutEffect(() => {
    if (!open) return undefined
    function measure() {
      const top = root.current?.getBoundingClientRect().top ?? 0
      const occupied = [...document.querySelectorAll('.app-header, .nav-banner')]
        .map((element) => element.getBoundingClientRect()).filter((rect) => rect.height > 0)
        .reduce((bottom, rect) => Math.max(bottom, rect.bottom), 0)
      setPanelHeight(Math.max(100, Math.min(560, top - occupied - 24)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (root.current?.parentElement) observer.observe(root.current.parentElement)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [open, navigating])
  const [shownKey, setShownKey] = useState(recovery.targetKey)
  if (shownKey !== recovery.targetKey) { setShownKey(recovery.targetKey); setOpen(false) }
  useEffect(() => {
    if (!open) return undefined
    const dismiss = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  if (!recovery.target) return null
  const { target, advice, state, demo, options } = recovery
  const muted = snoozed?.key === target.id && recovery.now < snoozed.until
  const label = muted ? 'Trip options' : state === 'ready' ? (navigating && ['early', 'soon', 'due'].includes(advice.kind) ? 'On track' : advice.label) : 'Trip options'
  const urgent = !muted && state === 'ready' && (advice.kind === 'late' || (!navigating && advice.kind === 'due'))
  function close() { setOpen(false); trigger.current?.focus() }
  function select(mode) {
    const option = recovery.choose(mode)
    if (!option) return
    onChoose(target.id, mode)
    close()
  }
  function review() {
    const option = recovery.choose(advice.current?.mode)
    const edit = option && laterStartEdit(plan, target, option, recovery.now)
    if (!edit) return
    onReview(target.id, edit)
    close()
  }
  return (
    <div className="recovery" ref={root} data-urgent={urgent || undefined} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { event.stopPropagation(); close() }
    }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
      <button ref={trigger} type="button" className="recovery-trigger glass" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}>
        <span className="recovery-dot" aria-hidden="true" />
        <span>{demo ? 'Demo · ' : ''}{label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 7 3-3 3 3" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      {/* Announce only meaningful status changes, not every countdown tick. */}
      <span className="visually-hidden" role="status">{urgent ? `${target.title}: ${advice.kind === 'late' ? 'You may arrive late. Review trip options.' : 'Time to leave. Review trip options.'}` : ''}</span>
      {open && <section id={id} className="recovery-panel glass" style={{ maxHeight: panelHeight }} aria-label="Trip options">
        <div className="recovery-head">
          <div><p className="recovery-eyebrow">{demo ? 'Simulated departure check' : 'From your location'}</p>
            <h2>{target.title}</h2><p>Starts {formatClock(target.timing.scheduledStartAt, plan.timezone)}</p></div>
          <button type="button" className="recovery-close" aria-label="Close trip options" onClick={close}>×</button>
        </div>
        {state === 'paused' && <p className="recovery-message">Return to DayMap to refresh your trip options.</p>}
        {state === 'location' && <p className="recovery-message">A fresh, accurate location is needed to compare journeys. Keep DayMap open and enable location access.</p>}
        {state === 'loading' && <p className="recovery-message" role="status">Checking routes from here… Options refresh at most once a minute.</p>}
        {state === 'unavailable' && <p className="recovery-message">No verified routes available right now. Your current journey is unchanged.</p>}
        {state === 'ready' && <>
          <p className="recovery-message">{!advice.current ? 'Your current travel mode could not be verified. Choose from the available routes.' : advice.alternative
            ? `${MODE_NAMES[advice.alternative.mode]} saves ${Math.floor((advice.current.readyAt - advice.alternative.readyAt) / 60000)} min${advice.alternative.lateMinutes === 0 ? ' and gets you there on time' : ''}.`
            : advice.best.lateMinutes > 0 ? 'None of the available routes gets you there on time.'
              : navigating ? 'You have time. Keep going, or compare your options.'
                : advice.kind === 'early' ? 'You have time. These arrival estimates are for leaving now.' : 'Leave now to arrive with time to spare.'}</p>
          <ul className="recovery-options">
            {options.map((option) => <li key={option.mode}>
              <button type="button" className="recovery-option" disabled={!recovery.canAct} onClick={() => select(option.mode)}>
                <TravelModeIcon mode={option.mode} size={20} />
                <span className="recovery-option-copy"><strong>{MODE_NAMES[option.mode]}{option.mode === advice.alternative?.mode ? ' · Suggested' : ''}</strong>
                  <span>Ready {formatClock(option.readyAt, plan.timezone)} · {option.lateMinutes ? `${option.lateMinutes} min late` : 'on time'}</span>
                  <span>Includes {option.bufferMinutes} min {option.mode === 'drive' ? 'to park' : 'buffer'}</span></span>
                <span className="recovery-option-action">{navigating ? 'Use' : 'Go'}<span className="visually-hidden"> by {MODE_NAMES[option.mode]}</span></span>
              </button>
            </li>)}
          </ul>
          <p className="recovery-footnote">{demo ? 'Fictional estimates, not live services.' : 'Google Maps estimates. Public transport depends on making the scheduled service.'}</p>
          {recovery.edit && <button type="button" className="recovery-review" disabled={!recovery.canAct} onClick={review}>
            Review a {formatClock(recovery.edit.scheduledStartAt, plan.timezone)} start
          </button>}
          {recovery.edit && <p className="recovery-footnote">Keeps the event’s length. Opens a draft to check against the rest of your day before you accept.</p>}
          {advice.best.lateMinutes > 0 && target.timing.kind === 'fixed' && <p className="recovery-footnote">This appointment is fixed. DayMap won’t move it.</p>}
        </>}
        <label className="recovery-car"><input type="checkbox" checked={recovery.carAvailable}
          disabled={!recovery.locationReady || Boolean(draft)} onChange={(event) => recovery.setCarAvailable(event.target.checked)} />
          I have a car here</label>
        {draft && <p className="recovery-footnote">Accept or discard your pending edits before changing this journey.</p>}
        <div className="recovery-footer"><span>While DayMap is open</span><button type="button" onClick={() => {
          setSnoozed({ key: target.id, until: recovery.now + 5 * 60000 }); close()
        }}>Quiet for 5 min</button></div>
      </section>}
    </div>
  )
}
