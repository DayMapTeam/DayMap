import { useEffect, useState } from 'react'
import { usePlan } from '../app/planContext.js'
import AddEventSheet from './AddEventSheet.jsx'
import AddToast from './AddToast.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import DraftCard from './DraftCard.jsx'
import PlanningFeedback from './PlanningFeedback.jsx'
import EventList from './EventList.jsx'
import PlannerFilter from './PlannerFilter.jsx'
import PlannerPanel from './PlannerPanel.jsx'
import { usePlannerOpen } from './usePlannerOpen.js'
import './AddEvent.css'

const TOAST_MS = 5000
const NEW_LABEL_MS = 4000

function isTyping(target) {
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]') !== null
}

/**
 * The planner: panel, filter, pending draft, stops, and the add sheet. The
 * filter text is UI state and resets on refresh, so rows are never hidden
 * without the user seeing why. Adding is unavailable while an edit is
 * waiting to be accepted.
 *
 * @param {object} props
 * @param {Date} props.now The planner's current time.
 * @param {{ stopId: string, key: number } | null} props.revealRequest Set by "View in planner" in the map popup.
 * @param {import('react').ReactNode} [props.emptyState] Shown when the day has no stops.
 */
export default function Planner({ now, revealRequest, planning, emptyState }) {
  const { plan, draft, undoAdd, removeStop } = usePlan()
  const [filter, setFilter] = useState('')
  const [open, setOpen] = usePlannerOpen()
  const [openStopId, setOpenStopId] = useState(null)
  const [handledReveal, setHandledReveal] = useState(null)
  const [reveal, setReveal] = useState(null)
  // Changes each time the add sheet opens, so it starts empty: a number, or null when closed.
  const [sheetKey, setSheetKey] = useState(null)
  // { stopId, message, key, showNew }
  const [recentAdd, setRecentAdd] = useState(null)
  // The stop waiting for "Are you sure?", or null.
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const canAdd = draft === null && pendingDeleteId === null

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

  function openSheet() {
    setOpen(true)
    setOpenStopId(null)
    setSheetKey(Date.now())
  }

  function committed({ stopId, message }) {
    setSheetKey(null)
    setFilter('')
    setRecentAdd((previous) => ({ stopId, message, key: (previous?.key ?? 0) + 1, showNew: true }))
    setReveal({ stopId, key: `added-${stopId}` })
  }

  function undo() {
    undoAdd(recentAdd.stopId)
    setRecentAdd(null)
    document.querySelector('.planner-add')?.focus()
  }

  function confirmDelete() {
    removeStop(pendingDeleteId)
    setOpenStopId(null)
    setPendingDeleteId(null)
  }

  // The toast only confirms a stop that is actually in the plan.
  const added = recentAdd !== null && plan.stops.some((stop) => stop.id === recentAdd.stopId) ? recentAdd : null

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
            aria-label="Add event"
            aria-keyshortcuts="N"
            disabled={!canAdd}
            title={canAdd ? 'Add event (N)' : 'Accept or keep your pending changes first'}
            onClick={openSheet}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        }
        overlay={pendingDeleteId !== null && (
          <ConfirmDialog
            title="Delete event"
            message="Are you sure you want to delete this event?"
            confirmLabel="Confirm"
            returnFocusSelector={`[data-delete-stop="${CSS.escape(pendingDeleteId)}"] || .planner-add`}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDeleteId(null)}
          />
        )}
        takeover={sheetKey !== null && (
          <AddEventSheet
            key={sheetKey}
            now={now}
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
          onRequestDelete={setPendingDeleteId}
          emptyState={emptyState}
        />
      </PlannerPanel>
      {added && <AddToast key={added.key} message={added.message} onUndo={undo} />}
    </>
  )
}
