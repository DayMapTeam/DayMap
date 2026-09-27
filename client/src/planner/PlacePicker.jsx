import { useEffect, useId, useRef, useState } from 'react'
import '../components/buttons.css'
import { splitPlaceLabel } from './addEventCopy.js'
import { usePlaceSuggestions } from './usePlaceSuggestions.js'

const STATUS = {
  loading: 'Searching places…',
  resolving: 'Finding this location…',
  empty: 'No places found. Try a shorter name or the street.',
  error: 'Place search is unavailable right now.',
}

/**
 * Place search inside an event's details. Choosing a result is the accept;
 * Esc or Cancel leaves the event unchanged.
 *
 * @param {object} props
 * @param {string} [props.initialQuery] Starts searching straight away (for example the Calendar's location text).
 * @param {object[]} [props.knownPlaces] Confirmed places the person can explicitly reuse.
 * @param {string} [props.noPlaceLabel] Label for the optional clear-location action.
 * @param {(place: { label: string, placeId: string | null, lat: number, lng: number }) => void} props.onPick
 * @param {(() => void) | null} props.onNoPlace Records that the event needs no place; null hides the option.
 * @param {() => void} props.onCancel
 */
export default function PlacePicker({ initialQuery = '', knownPlaces = [], noPlaceLabel = 'No place needed', onPick, onNoPlace, onCancel }) {
  const id = useId()
  const inputRef = useRef(null)
  const [query, setQuery] = useState(initialQuery)
  const { state, search, select } = usePlaceSuggestions(onPick)
  const results = state.status === 'results' ? state.results : []
  const known = knownPlaces.filter((place) => place.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  useEffect(() => {
    inputRef.current?.focus()
    if (initialQuery) search(initialQuery)
  }, [initialQuery, search])

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <div className="place-picker" onKeyDown={onKeyDown}>
      <label className="event-form-label" htmlFor={`${id}-search`}>Find the place</label>
      <div className="add-search">
        <svg className="add-search-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          id={`${id}-search`}
          className="add-search-input"
          type="text"
          placeholder="Search places"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            search(event.target.value)
          }}
        />
      </div>
      {(results.length > 0 || known.length > 0) && (
        <ul className="inset-group sheet-rows" aria-label="Places">
          {known.map((place) => (
            <li key={`${place.label}|${place.lat}|${place.lng}`}>
              <button type="button" className="sheet-row" onClick={() => onPick(place)}>
                <span className="sheet-row-text">
                  <span className="sheet-row-name">{place.label}</span>
                  <span className="sheet-row-sub">Already in your day</span>
                </span>
              </button>
            </li>
          ))}
          {results.map((result) => {
            const { name, rest } = splitPlaceLabel(result.label)
            return (
              <li key={result.id}>
                <button type="button" className="sheet-row" onClick={() => select(result)}>
                  <span className="sheet-row-text">
                    <span className="sheet-row-name">{name}</span>
                    {rest && <span className="sheet-row-sub">{rest}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {STATUS[state.status] && <p className="add-hint" role="status">{STATUS[state.status]}</p>}
      <div className="event-form-actions">
        {onNoPlace && (
          <button type="button" className="button-text place-picker-none" onClick={onNoPlace}>
            {noPlaceLabel}
          </button>
        )}
        <button type="button" className="button-text" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
