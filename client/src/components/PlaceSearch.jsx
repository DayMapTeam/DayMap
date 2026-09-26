import { useEffect, useRef, useState } from 'react'
import { createPlacesProvider } from '../services/places.js'
import { createPlaceSearchController } from '../services/placeSearchController.js'
import './PlaceSearch.css'

/** Search previews never modify the accepted plan or its selected stop. */
export default function PlaceSearch({ onPlaceSelect }) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ status: 'idle', results: [] })
  const [activeIndex, setActiveIndex] = useState(-1)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const controllerRef = useRef(null)

  useEffect(() => {
    const controller = createPlaceSearchController({
      provider: createPlacesProvider(), onState: setState, onSelect: onPlaceSelect,
    })
    controllerRef.current = controller
    return () => controller.dispose()
  }, [onPlaceSelect])

  function change(value) {
    setQuery(value)
    setActiveIndex(-1)
    controllerRef.current.search(value)
  }

  function select(result) {
    setQuery(result.label)
    setActiveIndex(-1)
    controllerRef.current.select(result)
  }

  function clear() {
    change('')
    inputRef.current.focus()
  }

  const expanded = focused && state.status === 'results'
  const message = {
    idle: query ? 'Type at least two characters.' : '',
    loading: 'Searching places…',
    resolving: 'Finding this location…',
    empty: 'No places found. Try another name.',
    error: 'Place search is unavailable. Check Places API (New) is enabled and allowed for your key, then try again.',
    selected: 'Location previewed on the map. It has not been added to your day.',
    results: `${state.results.length} suggestions available. Use the arrow keys to choose.`,
  }[state.status]

  return (
    <div className="place-search" role="search">
      <div className="place-search-field glass">
        <svg className="place-search-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <label className="visually-hidden" htmlFor="place-search-input">
          Search places
        </label>
        <input
          ref={inputRef}
          id="place-search-input"
          className="place-search-input"
          type="search"
          placeholder="Search places"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls="place-search-results"
          aria-activedescendant={expanded && activeIndex >= 0 ? `place-result-${activeIndex}` : undefined}
          aria-describedby="place-search-note"
          value={query}
          onChange={(event) => change(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); clear() }
            if (expanded && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
              event.preventDefault()
              setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + state.results.length) % state.results.length)
            }
            if (expanded && event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault()
              select(state.results[activeIndex])
            }
          }}
        />
        {query && (
          <button type="button" className="place-search-clear" aria-label="Clear search" onClick={clear}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="m1.5 1.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <ul id="place-search-results" className="place-search-results glass" role="listbox" aria-label="Place suggestions" hidden={!expanded}>
        {state.results.map((result, index) => (
          <li key={result.id} id={`place-result-${index}`} role="option"
            aria-selected={activeIndex === index}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => select(result)}>
            {result.label}
          </li>
        ))}
      </ul>
      <p id="place-search-note" className="place-search-note glass" role="status" hidden={!query}>
        {message}
      </p>
    </div>
  )
}
