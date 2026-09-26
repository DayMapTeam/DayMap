import { formatClock, formatDayLabel } from './formatTime.js'
import './AppHeader.css'

/**
 * Glass header that sits over the map. Weather is later backlog
 * (ARCHITECTURE §1), so it is not shown.
 *
 * @param {object} props
 * @param {string} props.date Plan date, "YYYY-MM-DD".
 * @param {string} props.timezone Plan IANA timezone.
 * @param {'demo' | 'live'} props.dataMode
 * @param {Date} props.now The planner's current time.
 * @param {boolean} props.isDemoTime Whether `now` is the fixed demo clock.
 */
export default function AppHeader({ date, timezone, dataMode, now, isDemoTime }) {
  return (
    <header className="app-header glass">
      <div className="app-header-logo">
        <span className="app-header-mark" aria-hidden="true" />
        <span className="app-header-wordmark">DayMap</span>
      </div>
      {dataMode === 'demo' && <span className="app-header-demo">Demo data</span>}
      <div className="app-header-spacer" />
      <time className="app-header-date" dateTime={date}>
        {formatDayLabel(date)}
      </time>
      <span className="app-header-dot" aria-hidden="true">·</span>
      <time className="app-header-now" dateTime={now.toISOString()}>
        {formatClock(now, timezone)}
        {isDemoTime && <span className="app-header-demo-time"> · demo time</span>}
      </time>
    </header>
  )
}
