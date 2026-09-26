import { usePlan } from '../app/planContext.js'
import { formatTime } from './formatTime.js'

// A second independent consumer proves selection is shared across components.
export function SelectionPreview() {
  const { plan, selectedStop, selectedStopId, clearSelection } = usePlan()

  return (
    <section className="panel preview" aria-labelledby="selection-heading">
      <div className="section-heading">
        <h2 id="selection-heading">Shared selection</h2>
        <button type="button" className="clear-button" onClick={clearSelection} disabled={!selectedStop}>
          Clear selection
        </button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="selection-summary">
        <p className="selection-title">{selectedStop?.title ?? 'No event selected'}</p>
        <p>{selectedStop ? selectedStop.location?.label ?? 'Location not set' : 'Choose a sample event to see it here.'}</p>
      </div>
      {selectedStop && (
        <dl className="selection-details">
          <div><dt>Selected ID</dt><dd><code>{selectedStopId}</code></dd></div>
          <div><dt>Planned visit</dt><dd>
            {formatTime(selectedStop.timing.scheduledStartAt, plan.timezone)}
            {' – '}{formatTime(selectedStop.timing.scheduledEndAt, plan.timezone)}
          </dd></div>
          <div><dt>Duration</dt><dd>{selectedStop.timing.durationMinutes} minutes</dd></div>
          <div><dt>Timing</dt><dd>{selectedStop.timing.kind}</dd></div>
          <div><dt>Coordinates</dt><dd>{selectedStop.location
            ? `${selectedStop.location.lat}, ${selectedStop.location.lng}`
            : 'Location not set'}</dd></div>
        </dl>
      )}
      <p className="preview-note">The map and planner will share this selection. This temporary preview does not display a map or calculate travel.</p>
    </section>
  )
}
