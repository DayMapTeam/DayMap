import './buttons.css'
import './CalendarSection.css'
import RemovedCalendarEvents from './RemovedCalendarEvents.jsx'

const STATUS = {
  checking: 'Checking…',
  connected: 'Connected',
  disconnected: 'Not connected',
  'not-configured': 'Not set up on this server',
  error: 'Status unavailable',
}

/**
 * Google Calendar controls for the account menu. Calendar access is separate
 * from DayMap sign-in (ARCHITECTURE §8) and is read-only.
 *
 * @param {object} props
 * @param {ReturnType<import('../app/useCalendar.js').useCalendar>} props.calendar
 */
export default function CalendarSection({ calendar }) {
  const { state, busy } = calendar
  return (
    <section className="calendar-section" aria-labelledby="calendar-section-title">
      <div className="calendar-section-head">
        <h3 id="calendar-section-title" className="calendar-section-title">Google Calendar</h3>
        <span className={`calendar-section-status calendar-section-status-${state}`}>{STATUS[state]}</span>
      </div>
      {state === 'connected' && (
        <>
          <p className="calendar-section-text">Today’s events are imported when DayMap opens. DayMap never changes your Calendar.</p>
          <div className="calendar-section-actions">
            <button
              type="button"
              className="button-filled calendar-section-import"
              disabled={!calendar.canImport}
              title={calendar.importHint ?? undefined}
              onClick={() => calendar.importDay()}
            >
              {busy === 'import' ? 'Importing…' : 'Import today’s events'}
            </button>
            <button type="button" className="button-text calendar-section-disconnect" disabled={busy !== null} onClick={calendar.disconnect}>
              Disconnect
            </button>
          </div>
          {calendar.importHint && busy === null && <p className="calendar-section-text">{calendar.importHint}</p>}
          <RemovedCalendarEvents calendar={calendar} returnFocusSelector=".calendar-section-import" />
        </>
      )}
      {state === 'disconnected' && (
        <>
          <p className="calendar-section-text">Bring today’s classes and meetings onto the map. Read-only access.</p>
          <button type="button" className="button-filled" disabled={busy !== null} onClick={calendar.connect}>
            {busy === 'connect' ? 'Opening Google…' : 'Connect Google Calendar'}
          </button>
        </>
      )}
      {state === 'not-configured' && (
        <p className="calendar-section-text">
          Add the Google OAuth and database settings to <code>server/.env</code> (see <code>server/CALENDAR.md</code>) and restart the server.
        </p>
      )}
      {state === 'error' && <p className="calendar-section-text">DayMap couldn’t reach its server. Check that it is running.</p>}
    </section>
  )
}
