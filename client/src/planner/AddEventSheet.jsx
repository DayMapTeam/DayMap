import { useEffect, useId, useRef, useState } from 'react'
import '../components/buttons.css'
import { describeVerdict, splitPlaceLabel } from './addEventCopy.js'
import { TimeRangeInputs } from './AddEventFields.jsx'
import FitVerdict from './FitVerdict.jsx'
import { useAddEventDraft } from './useAddEventDraft.js'
import { placeStatusMessage, usePlaceSuggestions } from './usePlaceSuggestions.js'
import { useReturnFocus } from './useReturnFocus.js'

const ROLES = [
  { value: 'event', title: 'An event', note: 'Choose when it starts and ends.' },
  { value: 'both', title: 'My day starts and ends here', note: 'Like home. No times needed.' },
  { value: 'start', title: 'My day starts here', note: 'Where you are in the morning.' },
  { value: 'end', title: 'My day ends here', note: 'Home, or a hotel for the night.' },
]

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
 * Add to the day on one screen: find a place (or type a name), then say what
 * it is — an event with From and To times, or where the day starts and/or
 * ends (home, a hotel), which needs no times. Add is the explicit accept.
 *
 * @param {object} props
 * @param {Date} props.now
 * @param {object} props.planning The planner's analysis: journey estimates for the fit.
 * @param {string} props.returnFocusSelector
 * @param {(result: { stopId: string | null, message: string }) => void} props.onCommitted
 * @param {() => void} props.onCancel
 */
export default function AddEventSheet({ now, planning, returnFocusSelector, onCommitted, onCancel }) {
  const titleId = useId()
  const sheetRef = useRef(null)
  const [searching, setSearching] = useState(true)
  const [query, setQuery] = useState('')
  const draft = useAddEventDraft({ now, planning })
  const { plan, option } = draft
  const verdict = describeVerdict(draft.fit, option, plan, 'fixed')

  useReturnFocus(returnFocusSelector)

  // Searching starts in the search field; the details start at their title.
  useEffect(() => {
    const sheet = sheetRef.current
    const target = searching ? sheet.querySelector('.sheet-autofocus') : sheet.querySelector('.sheet-title')
    target?.focus()
  }, [searching])

  function pickPlace(place) {
    draft.pickPlace(place)
    setSearching(false)
  }

  function chooseText(text) {
    draft.changeText(text)
    setSearching(false)
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
          {!searching ? (
            <button type="button" className="sheet-back" onClick={() => setSearching(true)}>
              <span aria-hidden="true">‹ </span>Search
            </button>
          ) : <span />}
          <button type="button" className="sheet-cancel" onClick={onCancel}>Cancel</button>
        </div>
        <h2 id={titleId} className="sheet-title" tabIndex={-1}>Add to your day</h2>
      </div>

      <div className="sheet-body">
        {searching ? (
          <WhereStep query={query} onQueryChange={setQuery} onPlace={pickPlace} onText={chooseText} />
        ) : (
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
              <button type="button" className="button-text" onClick={() => setSearching(true)}>Change</button>
            </div>

            <fieldset className="add-field role-options">
              <legend className="add-section-label">What is it?</legend>
              {ROLES.map((role) => {
                const disabled = role.value !== 'event' && draft.location === null
                return (
                  <label key={role.value} className="role-option" data-checked={draft.role === role.value || undefined} data-disabled={disabled || undefined}>
                    <input
                      className="visually-hidden"
                      type="radio"
                      name={`${titleId}-role`}
                      checked={draft.role === role.value}
                      disabled={disabled}
                      onChange={() => draft.changeRole(role.value)}
                    />
                    <span className="role-option-radio" aria-hidden="true" />
                    <span className="role-option-text">
                      <span className="role-option-title">{role.title}</span>
                      <span className="role-option-note">{disabled ? 'Needs a place from search.' : role.note}</span>
                    </span>
                  </label>
                )
              })}
            </fieldset>

            {draft.role === 'event' ? (
              <div className="add-field">
                <TimeRangeInputs
                  start={draft.startTime}
                  end={draft.endTime}
                  onStartChange={draft.setStartTime}
                  onEndChange={draft.setEndTime}
                  labels={['From', 'To']}
                />
                <FitVerdict verdict={draft.checkingTravel ? { tone: 'neutral', text: 'Checking travel time…' } : verdict} />
              </div>
            ) : (
              <p className="add-hint">
                {draft.role === 'start' && 'The planner starts here and shows when to leave for your first stop.'}
                {draft.role === 'end' && 'The planner ends here. After your last stop, Go takes you here.'}
                {draft.role === 'both' && 'The planner starts and ends here. After your last stop, Go takes you back.'}
              </p>
            )}
          </>
        )}
      </div>

      {!searching && (
        <div className="sheet-footer">
          <button type="button" className="button-filled sheet-primary" disabled={!draft.canCommit} onClick={add}>
            Add to day
          </button>
        </div>
      )}
    </div>
  )
}
