import { formatClock, formatTimeRange } from '../components/formatTime.js'

/**
 * The rest of the day after the add: which stop is new, which moved, and
 * which stay as they are. Fixed stops never move, so they never show a shift.
 *
 * @param {object} props
 * @param {import('../app/planAdd.js').FitOption} props.option An OK option.
 */
export default function ChangeList({ option }) {
  const { plan: preview, changes } = option
  const byId = new Map(preview.stops.map((stop, index) => [stop.id, { stop, number: index + 1 }]))

  return (
    <ol className="inset-group change-list" aria-label="Your day after this change">
      {changes.map((change) => {
        const { stop, number } = byId.get(change.stopId)
        const { scheduledStartAt, scheduledEndAt } = stop.timing
        return (
          <li key={change.stopId} className="change-row" data-type={change.type}>
            <span className="change-row-badge" aria-hidden="true">{change.type === 'new' ? '+' : number}</span>
            <span className="change-row-text">
              <span className="change-row-name">{stop.title}</span>
              <span className="change-row-sub">{stop.location?.label ?? 'Location needed'}</span>
            </span>
            <span className="change-row-when">
              <span className="change-row-time">{formatTimeRange(scheduledStartAt, scheduledEndAt, preview.timezone)}</span>
              <span className="change-row-label">
                {change.type === 'new' && 'New'}
                {change.type === 'none' && 'No change'}
                {change.type === 'shifted' && `was ${formatClock(change.fromStartAt, preview.timezone)}`}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
