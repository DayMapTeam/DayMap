import { useEffect, useId, useRef, useState } from 'react'
import '../components/buttons.css'
import { describeDayCheck, describeReason, describeVerdict, splitPlaceLabel } from './addEventCopy.js'
import { DurationChips, TimeRangeInputs, WhenModeToggle } from './AddEventFields.jsx'
import ChangeList from './ChangeList.jsx'
import FitVerdict from './FitVerdict.jsx'
import SlotOptions from './SlotOptions.jsx'
import { useAddEventDraft } from './useAddEventDraft.js'
import { placeStatusMessage, usePlaceSuggestions } from './usePlaceSuggestions.js'
import { useReturnFocus } from './useReturnFocus.js'

const STEPS = { 1: 'Where?', 2: 'When?', 3: 'Check your day' }
const BACK_LABELS = { 1: 'Planner', 2: 'Where', 3: 'When' }

function ChevronIcon() {
  return (
    <svg className="sheet-row-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 14.5s4.75-4.2 4.75-8a4.75 4.75 0 0 0-9.5 0c0 3.8 4.75 8 4.75 8Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="6.5" r="1.6" fill="currentColor" />
    </svg>
  )
}

// Step 1: find a place, or use the typed text without one.
function WhereStep({ query, onQueryChange, onPlace, onText }) {
  const inputId = useId()
  const labelId = useId()
  const { state, search, select } = usePlaceSuggestions(onPlace)
  const typed = query.trim()
  const results = state.status === 'results' ? state.results : []
  const message = placeStatusMessage(state.status)

  return (
    <>
      <label className="visually-hidden" htmlFor={inputId}>Search places or type a name</label>
      <div className="add-search add-search-large">
        <svg className="add-search-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id={inputId}
          className="add-search-input sheet-autofocus"
          type="text"
          placeholder="Search places or type a name"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value)
            search(event.target.value)
          }}
        />
      </div>
      {typed === '' ? (
        <p className="add-hint">Search for a place in Adelaide, or type something to do, like “Call Mum”.</p>
      ) : (
        <>
          <p id={labelId} className="add-section-label">Results</p>
          <ul className="inset-group sheet-rows" aria-labelledby={labelId}>
            {results.map((result) => {
              const { name, rest } = splitPlaceLabel(result.label)
              return (
                <li key={result.id}>
                  <button type="button" className="sheet-row" onClick={() => select(result)}>
                    <span className="sheet-row-thumb" aria-hidden="true"><PinIcon /></span>
                    <span className="sheet-row-text">
                      <span className="sheet-row-name">{name}</span>
                      {rest && <span className="sheet-row-sub">{rest}</span>}
                    </span>
                    <ChevronIcon />
                  </button>
                </li>
              )
            })}
            <li>
              <button type="button" className="sheet-row" onClick={() => onText(typed)}>
                <span className="sheet-row-thumb" data-plus aria-hidden="true">+</span>
                <span className="sheet-row-text">
                  <span className="sheet-row-name">Use “{typed}”</span>
                  <span className="sheet-row-sub">No place. Travel stays unknown.</span>
                </span>
                <ChevronIcon />
              </button>
            </li>
          </ul>
          {message && <p className="add-hint" role="status">{message}</p>}
        </>
      )}
    </>
  )
}

/**
 * Guided "add event" flow that takes over the planner: Where?, When?, then
 * Check your day. Step 3 is the preview and Add to day is the explicit accept.
 *
 * @param {object} props
 * @param {Date} props.now
 * @param {object} props.planning The planner's analysis: journey estimates for the fit.
 * @param {string} props.returnFocusSelector
 * @param {(result: { stopId: string, message: string }) => void} props.onCommitted
 * @param {() => void} props.onCancel
 */
export default function AddEventSheet({ now, planning, returnFocusSelector, onCommitted, onCancel }) {
  const titleId = useId()
  const sheetRef = useRef(null)
  const [step, setStep] = useState(1)
  const [query, setQuery] = useState('')
  const draft = useAddEventDraft({ now, planning })
  const { plan, option } = draft
  const verdict = describeVerdict(draft.fit, option, plan, draft.kind)

  useReturnFocus(returnFocusSelector)

  // Step 1 starts in the search field; later steps start at their title.
  useEffect(() => {
    const sheet = sheetRef.current
    const target = step === 1 ? sheet.querySelector('.sheet-autofocus') : sheet.querySelector('.sheet-title')
    target?.focus()
  }, [step])

  function back() {
    if (step === 1) onCancel()
    else setStep(step - 1)
  }

  function pickPlace(place) {
    draft.pickPlace(place)
    setStep(2)
  }

  function chooseText(text) {
    draft.changeText(text)
    setStep(2)
  }

  function add() {
    const result = draft.commit()
    if (result !== null) onCommitted(result)
  }

  return (
    <div
      ref={sheetRef}
      className="add-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="sheet-header">
        <div className="sheet-nav">
          <button type="button" className="sheet-back" onClick={back}>
            <span aria-hidden="true">‹ </span>{BACK_LABELS[step]}
          </button>
          <button type="button" className="sheet-cancel" onClick={onCancel}>Cancel</button>
        </div>
        <h2 id={titleId} className="sheet-title" tabIndex={-1}>{STEPS[step]}</h2>
        <div className="sheet-progress">
          <span className="sheet-progress-bars" aria-hidden="true">
            {[1, 2, 3].map((n) => <span key={n} className="sheet-progress-bar" data-done={n <= step || undefined} />)}
          </span>
          Step {step} of 3
        </div>
      </div>

      <div className="sheet-body">
        {step === 1 && (
          <WhereStep query={query} onQueryChange={setQuery} onPlace={pickPlace} onText={chooseText} />
        )}

        {step === 2 && (
          <>
            <div className="sheet-place">
              <span className="sheet-row-thumb" data-plus={draft.location === null || undefined} aria-hidden="true">
                {draft.location === null ? '+' : <PinIcon />}
              </span>
              <span className="sheet-row-text">
                <label className="visually-hidden" htmlFor={`${titleId}-name`}>Name</label>
                <input
                  id={`${titleId}-name`}
                  className="sheet-place-name"
                  type="text"
                  value={draft.title}
                  onChange={(event) => draft.setTitle(event.target.value)}
                />
                <span className="sheet-row-sub">
                  {draft.location === null ? 'No place. Travel stays unknown.' : draft.location.label}
                </span>
              </span>
              <button type="button" className="button-text" onClick={() => setStep(1)}>Change</button>
            </div>

            <div className="add-field">
              <p className="add-section-label">When</p>
              <WhenModeToggle value={draft.kind} onChange={draft.changeKind} />
              <p className="add-hint">
                {draft.kind === 'flexible'
                  ? 'Flexible. DayMap finds a time and may suggest moving it later if your day changes.'
                  : 'Fixed. DayMap will never move it.'}
              </p>
            </div>

            {draft.kind === 'flexible' ? (
              <>
                <div className="add-field">
                  <p className="add-section-label">How long?</p>
                  <DurationChips value={draft.durationMinutes} onChange={draft.setDurationMinutes} />
                </div>
                {draft.fit.options.length > 0
                  ? (
                    <SlotOptions
                      options={draft.fit.options}
                      value={draft.chosenAfterStopId}
                      onChange={draft.setChosenAfterStopId}
                      plan={plan}
                    />
                  )
                  : <FitVerdict verdict={verdict} />}
              </>
            ) : (
              <>
                <TimeRangeInputs
                  start={draft.startTime}
                  end={draft.endTime}
                  onStartChange={draft.setStartTime}
                  onEndChange={draft.setEndTime}
                />
                <FitVerdict verdict={verdict} />
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            {option?.ok ? (
              <>
                <FitVerdict
                  title="Your day still works"
                  verdict={{ tone: 'ok', text: describeDayCheck(option, plan, draft.stopId) }}
                />
                <ChangeList option={option} />
              </>
            ) : (
              <FitVerdict
                title="This doesn’t fit"
                verdict={{ tone: 'bad', text: option ? describeReason(option.reason, plan, draft.kind) : verdict.text }}
              />
            )}
            <p className="add-hint">Nothing is saved until you tap Add to day. You can edit it later from the planner.</p>
          </>
        )}
      </div>

      {step > 1 && (
        <div className="sheet-footer">
          {step === 2 ? (
            <button type="button" className="button-filled sheet-primary" disabled={!draft.canCommit} onClick={() => setStep(3)}>
              Next: check your day
            </button>
          ) : (
            <button type="button" className="button-filled sheet-primary" disabled={!draft.canCommit} onClick={add}>
              Add to day
            </button>
          )}
        </div>
      )}
    </div>
  )
}
