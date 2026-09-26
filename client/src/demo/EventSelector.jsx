import { usePlan } from '../app/planContext.js'
import { formatTime } from './formatTime.js'

// Temporary consumer for issue #5; Hannah's planner can use the same hook.
export function EventSelector() {
  const { plan, selectedStopId, selectStop } = usePlan()

  return (
    <section className="panel" aria-labelledby="events-heading">
      <div className="section-heading">
        <h2 id="events-heading">Sample events</h2>
        <span>{plan.stops.length} stops</span>
      </div>
      <ol className="event-list">
        {plan.stops.map((stop, index) => (
          <li key={stop.id}>
            <button
              type="button"
              className="event-button"
              aria-pressed={selectedStopId === stop.id}
              onClick={() => selectStop(stop.id)}
            >
              <span className="stop-number" aria-hidden="true">{index + 1}</span>
              <span className="event-copy">
                <span className="event-title">{stop.title}</span>
                <span>{stop.location?.label ?? 'Location not set'}</span>
                <span className="event-meta">
                  {formatTime(stop.timing.scheduledStartAt, plan.timezone)}
                  {' – '}{formatTime(stop.timing.scheduledEndAt, plan.timezone)}
                  {' · '}{stop.timing.durationMinutes} min
                  {' · '}{stop.timing.kind}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
