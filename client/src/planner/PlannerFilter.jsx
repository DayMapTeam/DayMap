/**
 * Filters the planner's rows by stop name or location. Hiding a row never
 * removes the stop from the plan. Place search is the separate box on the map.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 */
export default function PlannerFilter({ value, onChange }) {
  return (
    <div className="planner-filter">
      <svg className="planner-filter-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <label className="visually-hidden" htmlFor="planner-filter-input">
        Filter your day
      </label>
      <input
        id="planner-filter-input"
        className="planner-filter-input"
        type="search"
        placeholder="Filter your day"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) onChange('')
        }}
      />
      {value && (
        <button type="button" className="planner-filter-clear" aria-label="Clear filter" onClick={() => onChange('')}>
          <span className="planner-filter-clear-icon" aria-hidden="true">
            <svg width="8" height="8" viewBox="0 0 8 8">
              <path d="m1 1 6 6m0-6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
