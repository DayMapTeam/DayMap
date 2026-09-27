import { useEffect, useId, useRef, useState } from 'react'
import '../components/buttons.css'
import { describeVerdict, splitPlaceLabel } from './addEventCopy.js'
import { TimeRangeInputs } from './AddEventFields.jsx'
import FitVerdict from './FitVerdict.jsx'
import PlacePicker from './PlacePicker.jsx'
import { matchingDayPlaces } from './addPlaces.js'
import { useAddEventDraft } from './useAddEventDraft.js'
import { placeStatusMessage, usePlaceSuggestions } from './usePlaceSuggestions.js'
import { useReturnFocus } from './useReturnFocus.js'

const ROLES = [
  { value: 'event', title: 'Activity' },
  { value: 'note', title: 'Note' },
  { value: 'day-place', title: 'Day start/end' },
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
function WhereStep({ plan, query, onQueryChange, onPlace, onText }) {
  const inputId = useId()
  const labelId = useId()
  const { state, search, select } = usePlaceSuggestions(onPlace)
  const typed = query.trim()
  const knownPlaces = matchingDayPlaces(plan, query)

  useEffect(() => { search(query) }, [query, search])
  const results = state.status === 'results' ? state.results : []
  const message = placeStatusMessage(state.status)

  return (
    <>
      <label className="visually-hidden" htmlFor={inputId}>Place, activity or note</label>
      <div className="add-search add-search-large">
        <svg className="add-search-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id={inputId}
          className="add-search-input sheet-autofocus"
          type="text"
          placeholder="Place, activity or note"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value)
          }}
        />
      </div>
      {typed === '' ? (
        <p className="add-hint">Try “Home”, “Read a book”, or a reminder. You can add a location later.</p>
      ) : (
        <>
          <p id={labelId} className="add-section-label">Results</p>
          <ul className="inset-group sheet-rows" aria-labelledby={labelId}>
            {knownPlaces.map((place) => (
              <li key={`${place.label}|${place.lat}|${place.lng}`}>
                <button type="button" className="sheet-row" onClick={() => onPlace(place)}>
                  <span className="sheet-row-thumb" aria-hidden="true"><PinIcon /></span>
                  <span className="sheet-row-text">
                    <span className="sheet-row-name">{place.label}</span>
                    <span className="sheet-row-sub">Already in your day</span>
                  </span>
                  <ChevronIcon />
                </button>
              </li>
            ))}
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
                  <span className="sheet-row-sub">Choose a type next. Location is optional.</span>
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
 * it is: an activity, a note, or an explicit day endpoint. Add is the accept.
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
  const [pickingLocation, setPickingLocation] = useState(false)
  const draft = useAddEventDraft({ now, planning })
  const { plan, option } = draft
  const verdict = draft.role === 'event' ? describeVerdict(draft.fit, option, plan, 'fixed') : null

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
          if (pickingLocation) setPickingLocation(false)
          else onCancel()
        }
      }}
    >
      <div className="sheet-header">
        <div className="sheet-nav">
          {!searching ? (
            <button type="button" className="sheet-back" onClick={() => { setPickingLocation(false); setSearching(true) }}>
              <span aria-hidden="true">‹ </span>Search
            </button>
          ) : <span />}
          <button type="button" className="sheet-cancel" onClick={onCancel}>Cancel</button>
        </div>
        <h2 id={titleId} className="sheet-title" tabIndex={-1}>Add to your day</h2>
      </div>

      <div className="sheet-body">
        {searching ? (
          <WhereStep plan={plan} query={query} onQueryChange={setQuery} onPlace={pickPlace} onText={chooseText} />
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
                  maxLength={120}
                  value={draft.title}
                  onChange={(event) => draft.setTitle(event.target.value)}
                />
                <span className="sheet-row-sub">
                  {draft.location === null ? (draft.role === 'note' ? 'No location needed' : 'Location not set') : draft.location.label}
                </span>
              </span>
              <button type="button" className="button-text" onClick={() => setPickingLocation(true)}>
                {draft.location ? 'Change place' : 'Add place'}
              </button>
            </div>

            {pickingLocation && (
              <PlacePicker
                initialQuery={draft.location ? '' : draft.title}
                knownPlaces={matchingDayPlaces(plan, '', Infinity)}
                noPlaceLabel="Remove place"
                onPick={(place) => { draft.attachPlace(place); setPickingLocation(false) }}
                onNoPlace={draft.location ? () => { draft.attachPlace(null); setPickingLocation(false) } : null}
                onCancel={() => setPickingLocation(false)}
              />
            )}

            <fieldset className="add-field role-options">
              <legend className="add-section-label">Add as</legend>
              <div className="add-kind-options">
                {ROLES.map((role) => (
                  <label key={role.value} className="segmented-option">
                    <input className="visually-hidden" type="radio" name={`${titleId}-role`}
                      checked={draft.role === role.value} onChange={() => draft.changeRole(role.value)} />
                    <span className="segmented-label">{role.title}</span>
                  </label>
                ))}
              </div>
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
            ) : draft.role === 'note' ? (
              <p className="add-hint">A note for today. No set time, and it won’t change your schedule.</p>
            ) : (
              <div className="add-field">
                <label className="add-section-label" htmlFor={`${titleId}-day-role`}>Use this place for</label>
                <select id={`${titleId}-day-role`} className="time-range-input" value={draft.dayRole}
                  onChange={(event) => draft.setDayRole(event.target.value)}>
                  <option value="both">Start and end of day</option>
                  <option value="start">Start of day</option>
                  <option value="end">End of day</option>
                </select>
                <p className="add-hint">Use Activity for a visit home or reading afterwards. These places sit before and after all your activities.</p>
                {!draft.location && <p className="add-hint" role="status">Add a place to confirm the address. We won’t guess where “{draft.title || 'this'}” is.</p>}
                {draft.dayRole !== 'end' && plan.startPlace && <p className="add-hint">Replaces day start: {plan.startPlace.label}.</p>}
                {draft.dayRole !== 'start' && plan.endPlace && <p className="add-hint">Replaces day end: {plan.endPlace.label}.</p>}
              </div>
            )}
            {!draft.title.trim() && <p className="add-hint" role="status">Enter a name or note.</p>}
            {draft.title.trim().length > 120 && <p className="add-hint" role="status">Keep the name or note to 120 characters.</p>}
          </>
        )}
      </div>

      {!searching && (
        <div className="sheet-footer">
          <button type="button" className="button-filled sheet-primary" disabled={!draft.canCommit || pickingLocation} onClick={add}>
            {draft.role === 'day-place' ? 'Save day place' : draft.role === 'note' ? 'Add note' : 'Add to day'}
          </button>
        </div>
      )}
    </div>
  )
}
