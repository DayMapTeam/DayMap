import { useId, useRef, useState } from 'react'
import { usePlan } from '../app/planContext.js'
import { focusKeysAfterRestore, removedEventKey, removedEventsSummary } from './removedEvents.js'
import './buttons.css'
import './RemovedCalendarEvents.css'

/**
 * "2 removed Calendar events", opening to the list with a Bring back
 * button for each and Bring back all. Calendar events the person removed stay
 * out of later imports until brought back here, which imports the day again
 * with them included, as they are in Google Calendar. Shows only while
 * Calendar is connected and something is hidden.
 *
 * @param {object} props
 * @param {ReturnType<import('../app/useCalendar.js').useCalendar>} props.calendar
 * @param {string} props.returnFocusSelector Focused once nothing here is left to focus: selectors separated by " || ", tried in order.
 */
export default function RemovedCalendarEvents({ calendar, returnFocusSelector }) {
  const id = useId()
  const { plan } = usePlan()
  const listRef = useRef(null)
  const summaryRef = useRef(null)
  // What is being brought back: an event's key, 'all', or null.
  const [restoring, setRestoring] = useState(null)
  const removed = plan.removedEvents ?? []
  if (calendar?.state !== 'connected' || removed.length === 0) return null
  const count = removed.length
  const keys = removed.map(removedEventKey)
  const blocked = !calendar.canImport
  const reason = blocked ? calendar.importHint ?? (calendar.busy === 'import' ? 'Importing from Google Calendar…' : 'Importing isn’t available right now.') : null

  // The button that was pressed goes away (or is disabled while importing),
  // so put focus on the next event, the one before, this summary, or the fallback.
  function restoreFocus(focusKeys) {
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body && active.isConnected) return
      const candidates = [
        ...focusKeys.map((key) => listRef.current?.querySelector(`[data-restore-key="${CSS.escape(key)}"]`)),
        summaryRef.current?.isConnected ? summaryRef.current : null,
        ...returnFocusSelector.split(' || ').map((selector) => document.querySelector(selector)),
      ]
      candidates.find((element) => element && !element.disabled)?.focus()
    })
  }

  async function bringBack(what, options, focusKeys) {
    setRestoring(what)
    try {
      await calendar.importDay(options)
    } finally {
      setRestoring(null)
      restoreFocus(focusKeys)
    }
  }

  const busy = (what) => restoring === what && calendar.busy === 'import'

  return (
    <details className="removed-events">
      <summary ref={summaryRef} className="removed-events-summary">{removedEventsSummary(count)}</summary>
      <div className="removed-events-body">
        <p className="removed-events-text">
          Bringing an event back adds it again as it is in Google Calendar now. Your Google Calendar isn’t changed.
        </p>
        {reason && <p id={`${id}-reason`} className="removed-events-reason">{reason}</p>}
        <ul ref={listRef} className="removed-events-list">
          {removed.map((event, index) => (
            <li key={keys[index]} className="removed-events-item">
              <span className="removed-events-title">{event.title}</span>
              <button
                type="button"
                className="button-text"
                data-restore-key={keys[index]}
                aria-label={`Bring back ${event.title}`}
                aria-describedby={reason ? `${id}-reason` : undefined}
                disabled={blocked}
                onClick={() => bringBack(keys[index],
                  { restoreEvents: [{ sourceCalendarId: event.sourceCalendarId, sourceEventId: event.sourceEventId }] },
                  focusKeysAfterRestore(keys, keys[index]))}
              >
                {busy(keys[index]) ? 'Bringing back…' : 'Bring back'}
              </button>
            </li>
          ))}
        </ul>
        {count > 1 && (
          <button
            type="button"
            className="button-text removed-events-all"
            aria-describedby={reason ? `${id}-reason` : undefined}
            disabled={blocked}
            onClick={() => bringBack('all', { restoreRemoved: true }, [])}
          >
            {busy('all') ? 'Bringing back…' : `Bring back all ${count}`}
          </button>
        )}
      </div>
    </details>
  )
}
