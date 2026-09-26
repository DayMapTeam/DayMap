import { useId } from 'react'

const WHEN_OPTIONS = [
  ['flexible', 'Fit it in for me'],
  ['fixed', 'At a set time'],
]

/**
 * Flexible ("Fit it in for me") or fixed ("At a set time"), as a segmented
 * control built from radio buttons.
 *
 * @param {object} props
 * @param {'flexible' | 'fixed'} props.value
 * @param {(kind: 'flexible' | 'fixed') => void} props.onChange
 * @param {[string, string][]} [props.options] [kind, label] pairs, in order.
 * @param {string} [props.label] Accessible name of the group.
 * @param {boolean} [props.disabled]
 */
export function WhenModeToggle({ value, onChange, options = WHEN_OPTIONS, label: groupLabel = 'When', disabled = false }) {
  const name = useId()
  return (
    <div className="segmented" role="radiogroup" aria-label={groupLabel} aria-disabled={disabled || undefined}>
      {options.map(([kind, label]) => (
        <label key={kind} className="segmented-option">
          <input
            className="visually-hidden"
            type="radio"
            name={name}
            value={kind}
            checked={value === kind}
            disabled={disabled}
            onChange={() => onChange(kind)}
          />
          <span className="segmented-label">{label}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * @param {object} props
 * @param {string} props.start "HH:MM"
 * @param {string} props.end "HH:MM"
 * @param {(value: string) => void} props.onStartChange
 * @param {(value: string) => void} props.onEndChange
 * @param {[string, string]} [props.labels]
 */
export function TimeRangeInputs({ start, end, onStartChange, onEndChange, labels = ['Start', 'End'] }) {
  const id = useId()
  return (
    <div className="time-range">
      <label className="time-range-field" htmlFor={`${id}-start`}>
        <span className="time-range-label">{labels[0]}</span>
        <input
          id={`${id}-start`}
          className="time-range-input"
          type="time"
          value={start}
          onChange={(event) => onStartChange(event.target.value)}
        />
      </label>
      <label className="time-range-field" htmlFor={`${id}-end`}>
        <span className="time-range-label">{labels[1]}</span>
        <input
          id={`${id}-end`}
          className="time-range-input"
          type="time"
          value={end}
          onChange={(event) => onEndChange(event.target.value)}
        />
      </label>
    </div>
  )
}
