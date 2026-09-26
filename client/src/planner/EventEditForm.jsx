import { useId, useState } from 'react'
import { validateStopEdit } from '../app/planEdits.js'
import { formatClock, toTimeInputValue } from '../components/formatTime.js'
import { zonedTimeToTimestamp } from '../components/zonedTime.js'
import '../components/buttons.css'

function errorMessage(code, stop, timezone) {
  switch (code) {
    case 'missing-title':
      return 'Give this stop a name.'
    case 'missing-time':
      return 'Enter a start and an end time.'
    case 'end-before-start':
      return 'The end time needs to be after the start time.'
    case 'outside-window':
      return `This stop can move between ${formatClock(stop.timing.earliestStartAt, timezone)} and ${formatClock(stop.timing.latestEndAt, timezone)}. Choose times inside that window.`
    default:
      return 'This stop can’t be edited here.'
  }
}

const ERROR_FIELDS = {
  'missing-title': ['title'],
  'missing-time': ['start', 'end'],
  'end-before-start': ['end'],
  'outside-window': ['start', 'end'],
}

/**
 * Edit form for a flexible stop. Saving puts the change in a draft; the
 * accepted plan only changes when the user accepts the draft.
 *
 * @param {object} props
 * @param {object} props.stop Flexible stop in the §5 shape.
 * @param {string} props.date Plan date, "YYYY-MM-DD".
 * @param {string} props.timezone Plan IANA timezone.
 * @param {(edit: import('../app/planEdits.js').StopEdit) => void} props.onSave
 * @param {() => void} props.onCancel
 * @param {() => void} props.onDelete Asks to delete the stop; nothing changes until the user confirms.
 */
export default function EventEditForm({ stop, date, timezone, onSave, onCancel, onDelete }) {
  const id = useId()
  const [title, setTitle] = useState(stop.title)
  const [start, setStart] = useState(toTimeInputValue(stop.timing.scheduledStartAt, timezone))
  const [end, setEnd] = useState(toTimeInputValue(stop.timing.scheduledEndAt, timezone))
  const [error, setError] = useState(null)
  const errorId = `${id}-error`
  const invalid = (field) => ERROR_FIELDS[error]?.includes(field) || undefined

  function handleSubmit(event) {
    event.preventDefault()
    if (!start || !end) {
      setError('missing-time')
      return
    }
    const edit = {
      title: title.trim(),
      scheduledStartAt: zonedTimeToTimestamp(date, start, timezone),
      scheduledEndAt: zonedTimeToTimestamp(date, end, timezone),
    }
    const code = validateStopEdit(stop, edit)
    if (code !== null) {
      setError(code)
      return
    }
    onSave(edit)
  }

  const { earliestStartAt, latestEndAt } = stop.timing

  return (
    <form className="event-form" onSubmit={handleSubmit} noValidate>
      <div className="event-form-group">
        <label className="event-form-field" htmlFor={`${id}-title`}>
          <span className="event-form-label">Event</span>
          <input
            id={`${id}-title`}
            className="event-form-input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={invalid('title')}
            aria-describedby={invalid('title') && errorId}
          />
        </label>
        <div className="event-form-field">
          <span className="event-form-label">Place</span>
          <span className="event-form-value">{stop.location?.label ?? 'Location needed'}</span>
        </div>
        <label className="event-form-field" htmlFor={`${id}-start`}>
          <span className="event-form-label">Starts</span>
          <input
            id={`${id}-start`}
            className="event-form-input"
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            aria-invalid={invalid('start')}
            aria-describedby={invalid('start') && errorId}
          />
        </label>
        <label className="event-form-field" htmlFor={`${id}-end`}>
          <span className="event-form-label">Ends</span>
          <input
            id={`${id}-end`}
            className="event-form-input"
            type="time"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            aria-invalid={invalid('end')}
            aria-describedby={invalid('end') && errorId}
          />
        </label>
      </div>
      {earliestStartAt !== null && latestEndAt !== null && (
        <p className="event-form-hint">
          Can move between {formatClock(earliestStartAt, timezone)} and {formatClock(latestEndAt, timezone)}. Changing the
          place comes with place search.
        </p>
      )}
      {error !== null && (
        <p id={errorId} className="event-form-error" role="alert">
          {errorMessage(error, stop, timezone)}
        </p>
      )}
      <div className="event-form-actions">
        <button type="button" className="button-destructive" data-delete-stop={stop.id} onClick={onDelete}>
          Delete
        </button>
        <button type="button" className="button-text" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button-filled">
          Save
        </button>
      </div>
    </form>
  )
}
