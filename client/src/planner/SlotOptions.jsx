import { useId } from 'react'
import { formatTimeRange } from '../components/formatTime.js'
import { describeReason, describeSlot } from './addEventCopy.js'

const MAX_SHOWN = 3

/**
 * Where a flexible stop could go, best first.
 *
 * @param {object} props
 * @param {import('../app/planAdd.js').FitOption[]} props.options
 * @param {string | null} props.value The chosen option's afterStopId.
 * @param {(afterStopId: string | null) => void} props.onChange
 * @param {object} props.plan Accepted plan.
 */
export default function SlotOptions({ options, value, onChange, plan }) {
  const name = useId()
  const labelId = useId()
  const shown = options.slice(0, MAX_SHOWN)

  return (
    <div className="add-field">
      <p id={labelId} className="add-section-label">Best time</p>
      <div className="inset-group" role="radiogroup" aria-labelledby={labelId}>
        {shown.map((option) => (
          <label key={option.afterStopId ?? 'first'} className="slot-option" data-ok={option.ok || undefined}>
            <input
              className="visually-hidden"
              type="radio"
              name={name}
              checked={option.afterStopId === value}
              onChange={() => onChange(option.afterStopId)}
            />
            <span className="slot-option-radio" aria-hidden="true" />
            <span className="slot-option-text">
              <span className="slot-option-time">
                {formatTimeRange(option.startAt, option.endAt, plan.timezone)}
                {option.recommended && <span className="slot-option-tag">Best fit</span>}
              </span>
              <span className="slot-option-reason">
                {option.ok ? describeSlot(option, plan) : describeReason(option.reason, plan, 'flexible')}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
