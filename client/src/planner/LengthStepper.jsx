import { useId } from 'react'
import { usePlan } from '../app/planContext.js'
import { MIN_STOP_MINUTES, resizeBlock, resizedStopEdit } from '../app/planEdits.js'
import { formatDuration } from '../components/formatTime.js'
import { resizeBlockMessage } from './stopEditCopy.js'
import '../components/buttons.css'

const STEP_MINUTES = 15

/**
 * Quick "−15 min" and "+15 min" buttons that move a stop's end time, with its
 * length between them. Each press goes into the draft like any other edit. A
 * button that can't be used stays focusable (aria-disabled), so focus never
 * jumps away while pressing it repeatedly, and says why underneath.
 *
 * @param {object} props
 * @param {object} props.stop Editable stop in the §5 shape (from the draft when there is one).
 * @param {(edit: import('../app/planEdits.js').StopEdit) => void} props.onResize
 */
export default function LengthStepper({ stop, onResize }) {
  const id = useId()
  const { plan, draft } = usePlan()
  // The plan the stop is shown from, for its date and timezone.
  const shown = draft?.plan ?? plan
  const { scheduledStartAt, scheduledEndAt } = stop.timing
  const minutes = Math.round((Date.parse(scheduledEndAt) - Date.parse(scheduledStartAt)) / 60000)
  const [shorter, longer] = [-STEP_MINUTES, STEP_MINUTES].map((delta) => {
    const reason = resizeBlockMessage(resizeBlock(stop, delta, shown), stop, delta, shown.timezone, MIN_STOP_MINUTES)
    return { delta, reason }
  })

  function stepButton({ delta, reason }, index) {
    return (
      <button
        type="button"
        className="button-text event-length-button"
        aria-disabled={reason !== null || undefined}
        aria-describedby={reason ? `${id}-reason-${index}` : undefined}
        title={reason ?? (delta < 0 ? `End ${STEP_MINUTES} minutes earlier` : `End ${STEP_MINUTES} minutes later`)}
        onClick={() => {
          if (reason !== null) return
          const edit = resizedStopEdit(stop, delta, shown)
          if (edit !== null) onResize(edit)
        }}
      >
        {delta < 0 ? '−' : '+'}{STEP_MINUTES} min
      </button>
    )
  }

  return (
    <div className="event-length">
      <div className="event-length-row" role="group" aria-labelledby={`${id}-label`}>
        <span id={`${id}-label`} className="event-form-label">Length</span>
        <div className="event-length-controls">
          {stepButton(shorter, 0)}
          <output className="event-length-value" aria-live="polite">{formatDuration(minutes)}</output>
          {stepButton(longer, 1)}
        </div>
      </div>
      {[shorter, longer].map(({ reason }, index) => reason && (
        <p key={index} id={`${id}-reason-${index}`} className="event-form-hint">{reason}</p>
      ))}
    </div>
  )
}
