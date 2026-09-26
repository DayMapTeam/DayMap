import { useEffect, useRef } from 'react'
import { usePlan } from '../app/planContext.js'
import { listStopChanges } from '../app/planEdits.js'
import EventRow from './EventRow.jsx'
import TravelConnector from './TravelConnector.jsx'
import './EventList.css'

function matchesFilter(stop, needle) {
  return [stop.title, stop.location?.label ?? '']
    .some((text) => text.toLocaleLowerCase().includes(needle))
}

/**
 * The day's stops in the order the user gave, with the journey between each
 * pair. Shows the draft when there is one. Selection goes through
 * PlanProvider, so the map follows it; which row is expanded is UI state
 * owned by Planner.
 *
 * @param {object} props
 * @param {Date} props.now The planner's current time; earlier stops are shown as finished.
 * @param {string} props.filter Text from the planner filter. Hides rows only.
 * @param {string | null} props.openStopId
 * @param {(stopId: string | null) => void} props.onOpenStopChange
 * @param {{ stopId: string, key: number } | null} props.revealRequest Scroll to and highlight this row.
 */
export default function EventList({ now, filter, openStopId, onOpenStopChange, revealRequest }) {
  const { plan, draft, selectedStopId, selectStop, editStopDraft } = usePlan()
  const listRef = useRef(null)
  const shown = draft?.plan ?? plan
  const needle = filter.trim().toLocaleLowerCase()
  const filtering = needle !== ''
  const stops = filtering ? shown.stops.filter((stop) => matchesFilter(stop, needle)) : shown.stops
  const changedIds = new Set(draft ? listStopChanges(plan, draft.plan).map(({ after }) => after.id) : [])

  // Scroll the panel body itself (offsetTop is relative to it); scrollIntoView
  // would also scroll the page and the map.
  useEffect(() => {
    if (revealRequest === null) return
    const item = listRef.current.querySelector(`[data-stop-id="${CSS.escape(revealRequest.stopId)}"]`)
    const body = item?.closest('.planner-body')
    if (!item || !body) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    body.scrollTo({ top: item.offsetTop - 12, behavior: reduceMotion ? 'auto' : 'smooth' })
    item.querySelector('.event-row').focus({ preventScroll: true })
  }, [revealRequest])

  function toggle(stopId) {
    if (openStopId === stopId) {
      onOpenStopChange(null)
      return
    }
    onOpenStopChange(stopId)
    selectStop(stopId)
  }

  function save(stopId, edit) {
    editStopDraft(stopId, edit)
    onOpenStopChange(null)
  }

  return (
    <>
      <p className="event-list-count" role="status">
        {filtering && (stops.length === 0 ? 'No stops match.' : `Showing ${stops.length} of ${shown.stops.length} stops`)}
      </p>
      <ol ref={listRef} className="event-list" aria-label="Stops">
        {stops.map((stop, index) => (
          <li key={stop.id}>
            {/* While filtering, neighbours in the list may not be neighbours in the day. */}
            {index > 0 && !filtering && <TravelConnector />}
            <EventRow
              stop={stop}
              date={shown.date}
              timezone={shown.timezone}
              selected={stop.id === selectedStopId}
              open={stop.id === openStopId}
              past={stop.timing.scheduledEndAt !== null && Date.parse(stop.timing.scheduledEndAt) <= now.getTime()}
              changed={changedIds.has(stop.id)}
              flashKey={revealRequest?.stopId === stop.id ? revealRequest.key : null}
              onToggle={toggle}
              onSave={save}
            />
          </li>
        ))}
      </ol>
    </>
  )
}
