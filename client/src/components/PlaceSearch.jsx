import { useRef, useState } from 'react'
import './PlaceSearch.css'

/**
 * Top place search (ARCHITECTURE §4). Finds geographic places only; the
 * planner's filter is separate. Results arrive with the Places service
 * (DM-07), so for now it says so instead of pretending to search.
 */
export default function PlaceSearch() {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  function clear() {
    setQuery('')
    inputRef.current.focus()
  }

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
          aria-describedby="place-search-note"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) clear()
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
      <p id="place-search-note" className="place-search-note glass" role="status" hidden={!query}>
        Place results aren’t available in this demo yet.
      </p>
    </div>
  )
}
