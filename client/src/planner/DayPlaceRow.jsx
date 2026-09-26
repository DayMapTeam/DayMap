/**
 * Where the day starts or ends (home, a hotel): a place without times.
 *
 * @param {object} props
 * @param {'start' | 'end'} props.which
 * @param {{ label: string }} props.place
 * @param {() => void} props.onRemove
 */
export default function DayPlaceRow({ which, place, onRemove }) {
  return (
    <div className="day-place" data-which={which}>
      <span className="day-place-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M2.5 7.5 8 3l5.5 4.5M4 6.5v6.5h8V6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="day-place-text">
        <span className="day-place-label">{which === 'start' ? 'Day starts' : 'Day ends'}</span>
        <span className="day-place-name">{place.label}</span>
      </span>
      <button type="button" className="day-place-remove" aria-label={`Remove where the day ${which === 'start' ? 'starts' : 'ends'}`} onClick={onRemove}>×</button>
    </div>
  )
}
