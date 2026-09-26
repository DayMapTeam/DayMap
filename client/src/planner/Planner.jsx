import { useState } from 'react'
import DraftCard from './DraftCard.jsx'
import EventList from './EventList.jsx'
import PlannerFilter from './PlannerFilter.jsx'
import PlannerPanel from './PlannerPanel.jsx'
import { usePlannerOpen } from './usePlannerOpen.js'

/**
 * The planner: panel, filter, pending draft and stops. The filter text is UI
 * state and resets on refresh, so rows are never hidden without the user
 * seeing why.
 *
 * @param {object} props
 * @param {Date} props.now The planner's current time.
 * @param {{ stopId: string, key: number } | null} props.revealRequest Set by "View in planner" in the map popup.
 */
export default function Planner({ now, revealRequest }) {
  const [filter, setFilter] = useState('')
  const [open, setOpen] = usePlannerOpen()
  const [openStopId, setOpenStopId] = useState(null)
  const [handledReveal, setHandledReveal] = useState(null)

  // Open the panel and the row in the same render as the request, so EventList
  // can scroll to a row that is already visible. The filter is cleared in case
  // it hides the row.
  if (revealRequest !== handledReveal) {
    setHandledReveal(revealRequest)
    if (revealRequest !== null) {
      setOpen(true)
      setOpenStopId(revealRequest.stopId)
      setFilter('')
    }
  }

  return (
    <PlannerPanel
      open={open}
      onOpenChange={setOpen}
      toolbar={<PlannerFilter value={filter} onChange={setFilter} />}
    >
      <DraftCard />
      <EventList
        now={now}
        filter={filter}
        openStopId={openStopId}
        onOpenStopChange={setOpenStopId}
        revealRequest={revealRequest}
      />
    </PlannerPanel>
  )
}
