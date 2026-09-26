import { useState } from 'react'
import DraftCard from './DraftCard.jsx'
import EventList from './EventList.jsx'
import PlannerFilter from './PlannerFilter.jsx'
import PlannerPanel from './PlannerPanel.jsx'

/**
 * The planner: panel, filter, pending draft and stops. The filter text is UI
 * state and resets on refresh, so rows are never hidden without the user
 * seeing why.
 *
 * @param {object} props
 * @param {Date} props.now The planner's current time.
 */
export default function Planner({ now }) {
  const [filter, setFilter] = useState('')

  return (
    <PlannerPanel toolbar={<PlannerFilter value={filter} onChange={setFilter} />}>
      <DraftCard />
      <EventList now={now} filter={filter} />
    </PlannerPanel>
  )
}
