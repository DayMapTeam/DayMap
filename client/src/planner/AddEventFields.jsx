import { useId } from 'react'

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
