import '../components/buttons.css'
import RemovedCalendarEvents from '../components/RemovedCalendarEvents.jsx'

/**
 * Shown in the planner when the day has no stops. Offers Calendar when it can
 * help, including Calendar events the person removed; the + button in the
 * header adds events by hand.
 *
 * @param {object} props
 * @param {ReturnType<import('../app/useCalendar.js').useCalendar> | null} props.calendar Null when signed out.
 */
export default function EmptyDay({ calendar }) {
  return (
    <div className="empty-day">
      <p className="empty-day-title">Nothing planned yet</p>
      <p className="empty-day-text">Add an event with + (or press N), or bring in today’s classes and meetings.</p>
      {calendar?.state === 'connected' && (
        <>
          <button type="button" className="button-filled empty-day-import" disabled={!calendar.canImport} onClick={() => calendar.importDay()}>
            {calendar.busy === 'import' ? 'Importing…' : 'Import from Google Calendar'}
          </button>
          <RemovedCalendarEvents calendar={calendar} returnFocusSelector=".empty-day-import || .planner-add" />
        </>
      )}
      {calendar?.state === 'disconnected' && (
        <button type="button" className="button-filled" disabled={calendar.busy !== null} onClick={calendar.connect}>
          Connect Google Calendar
        </button>
      )}
    </div>
  )
}
