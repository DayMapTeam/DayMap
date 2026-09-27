import { useEffect, useState } from 'react'
import { usePlan } from '../app/planContext.js'
import AddEventSheet from './AddEventSheet.jsx'
import AddToast from './AddToast.jsx'
import RemovedCalendarEvents from '../components/RemovedCalendarEvents.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import DraftCard from './DraftCard.jsx'
import PlanningFeedback from './PlanningFeedback.jsx'
import EventList from './EventList.jsx'
import PlannerFilter from './PlannerFilter.jsx'
import PlannerPanel from './PlannerPanel.jsx'
import { usePlannerOpen } from './usePlannerOpen.js'
import './AddEvent.css'
import { deleteFocusSelectors, deleteMessage } from './deleteStop.js'

const TOAST_MS = 5000
const NEW_LABEL_MS = 4000

function isTyping(target) {
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]') !== null
}

/**
 * The planner: panel, filter, pending draft, stops, and the add sheet. The
 * filter text is UI state and resets on refresh, so rows are never hidden
 * without the user seeing why. Adding is unavailable while an edit is
 * waiting to be accepted. Deleting asks first and can be undone from a toast
 * while nothing else has changed the day.
 *
 * @param {object} props
 * @param {Date} props.now The planner's current time.
 * @param {{ stopId: string, key: number } | null} props.revealRequest Set by "View in planner" in the map popup.
 * @param {import('react').ReactNode} [props.emptyState] Shown when the day has no stops.
 * @param {ReturnType<import('../app/useCalendar.js').useCalendar> | null} [props.calendar] Connected Calendar, for bringing back removed events; null when signed out.
 */
export default function Planner({ now, revealRequest, planning, emptyState, calendar = null }) {
  const { plan, draft, undoAdd, removeStop, undoRemove, lastRemove = null } = usePlan()
  const [filter, setFilter] = useState('')
  const [open, setOpen] = usePlannerOpen()
  const [openStopId, setOpenStopId] = useState(null)
  const [handledReveal, setHandledReveal] = useState(null)
  const [reveal, setReveal] = useState(null)
  // Changes each time the add sheet opens, so it starts empty: a number, or null when closed.
  const [sheetKey, setSheetKey] = useState(null)
  // { stopId, message, key, showNew }
  const [recentAdd, setRecentAdd] = useState(null)
  // The stop waiting for "Are you sure?": { stopId, returnFocus }, or null.
  const [pendingDelete, setPendingDelete] = useState(null)
  // The removal whose Undo toast has timed out or been used.
  const [doneRemoveKey, setDoneRemoveKey] = useState(null)
  const shownStops = (draft?.plan ?? plan).stops
  const pendingStop = pendingDelete && (shownStops.find((stop) => stop.id === pendingDelete.stopId) ?? null)
  // The stop went away some other way (undo, import): there is nothing left to ask about.
  if (pendingDelete !== null && pendingStop === null) setPendingDelete(null)
  const canAdd = draft === null && pendingDelete === null

  // Open the panel and the row in the same render as the request, so EventList
  // can scroll to a row that is already visible. The filter is cleared in case
  // it hides the row.
  if (revealRequest !== handledReveal) {
    setHandledReveal(revealRequest)
    if (revealRequest !== null) {
      setOpen(true)
      setOpenStopId(revealRequest.stopId)
      setFilter('')
      setSheetKey(null)
      setReveal(revealRequest)
    }
  }

  // Opening the sheet closes any expanded row. N opens it too, unless the user is typing.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'n' && event.key !== 'N') return
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || isTyping(event.target)) return
      if (!canAdd) return
      event.preventDefault()
      setOpen(true)
      setOpenStopId(null)
      setSheetKey((previous) => previous ?? Date.now())
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [canAdd, setOpen])

  const recentKey = recentAdd?.key ?? null
  useEffect(() => {
    if (recentKey === null) return
    const hideNew = setTimeout(() => {
      setRecentAdd((current) => (current?.key === recentKey ? { ...current, showNew: false } : current))
    }, NEW_LABEL_MS)
    const dismiss = setTimeout(() => {
      setRecentAdd((current) => (current?.key === recentKey ? null : current))
    }, TOAST_MS)
    return () => {
      clearTimeout(hideNew)
      clearTimeout(dismiss)
    }
  }, [recentKey])

  const removeKey = lastRemove ? `${lastRemove.stopId}@${lastRemove.version}` : null
  useEffect(() => {
    if (removeKey === null) return undefined
    const dismiss = setTimeout(() => setDoneRemoveKey(removeKey), TOAST_MS)
    return () => clearTimeout(dismiss)
  }, [removeKey])

  function openSheet() {
    setOpen(true)
    setOpenStopId(null)
    setSheetKey(Date.now())
  }

  function committed({ stopId, message }) {
    setSheetKey(null)
    setFilter('')
    // Where the day starts or ends is shown at the ends of the planner; there is no row to reveal.
    if (stopId === null) return
    setRecentAdd((previous) => ({ stopId, message, key: (previous?.key ?? 0) + 1, showNew: true }))
    setReveal({ stopId, key: `added-${stopId}` })
  }

  function undo() {
    undoAdd(recentAdd.stopId)
    setRecentAdd(null)
    document.querySelector('.planner-add')?.focus()
  }

  // The return-focus selectors are worked out once, so they stay the same while the dialog is open.
  function requestDelete(stopId) {
    setPendingDelete({ stopId, returnFocus: deleteFocusSelectors(shownStops, stopId) })
  }

  function confirmDelete() {
    removeStop(pendingDelete.stopId)
    setOpenStopId(null)
    setPendingDelete(null)
    // Only one toast at a time; undoing the add would no longer apply anyway.
    setRecentAdd(null)
  }

  // Undo puts the stop back and moves focus to its row, since the toast goes away.
  function undoRemoval() {
    const { stopId } = removed
    undoRemove(stopId)
    setDoneRemoveKey(removeKey)
    setFilter('')
    setOpen(true)
    setReveal({ stopId, key: `restored-${removeKey}` })
  }

  // The toast only confirms a stop that is actually in the plan.
  const added = recentAdd !== null && plan.stops.some((stop) => stop.id === recentAdd.stopId) ? recentAdd : null
  // The Undo toast only shows while undoing can still work: nothing else has changed the day.
  const removed = lastRemove !== null && lastRemove.version === plan.version && doneRemoveKey !== removeKey ? lastRemove : null

  return (
    <>
      <PlannerPanel
        analysis={planning.analysis}
        open={open}
        onOpenChange={setOpen}
        toolbar={<PlannerFilter value={filter} onChange={setFilter} />}
        headerAction={
          <button
            type="button"
            className="planner-add"
            aria-label="Add to your day"
            aria-keyshortcuts="N"
            disabled={!canAdd}
            title={canAdd ? 'Add to your day (N)' : 'Accept or keep your pending changes first'}
            onClick={openSheet}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        }
        overlay={pendingStop && (
          <ConfirmDialog
            title="Delete event"
            message={deleteMessage(pendingStop)}
            confirmLabel="Delete"
            returnFocusSelector={pendingDelete.returnFocus}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
        takeover={sheetKey !== null && (
          <AddEventSheet
            key={sheetKey}
            now={now}
            planning={planning}
            returnFocusSelector=".planner-add"
            onCommitted={committed}
            onCancel={() => setSheetKey(null)}
          />
        )}
      >
        <DraftCard planning={planning} />
        <PlanningFeedback planning={planning} />
        <EventList
          planning={planning}
          onGapPreview={() => setFilter('')}
          now={now}
          filter={filter}
          openStopId={openStopId}
          onOpenStopChange={setOpenStopId}
          revealRequest={reveal}
          newStopId={added?.showNew ? added.stopId : null}
          onRequestDelete={requestDelete}
          emptyState={emptyState}
        />
        {/* The empty day shows its own copy of this. */}
        {calendar && shownStops.length > 0 && (
          <RemovedCalendarEvents calendar={calendar} returnFocusSelector=".planner-add" />
        )}
      </PlannerPanel>
      {removed ? (
        <AddToast key={removeKey} message={`Removed ‘${removed.title}’`} onUndo={undoRemoval} />
      ) : added && <AddToast key={added.key} message={added.message} onUndo={undo} />}
    </>
  )
}
