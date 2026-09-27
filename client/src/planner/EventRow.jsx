import { useId, useState } from 'react'
import { canEditStop, moveBounds, movedStopEdit } from '../app/planEdits.js'
import { formatDuration, formatTimeRange } from '../components/formatTime.js'
import EventEditForm from './EventEditForm.jsx'
import LengthStepper from './LengthStepper.jsx'
import PlacePicker from './PlacePicker.jsx'
import { KIND_LABELS } from './stopLabels.js'
import { useVerticalDrag } from './useVerticalDrag.js'
import { isDayNote } from '../app/planEdits.js'

const KIND_NOTES = {
  fixed: 'Starred — DayMap will never move this or suggest changes to it.',
  flexible: 'Not starred — DayMap may suggest moving this into free time, and always asks first. Star it to keep it where it is.',
  'all-day': 'All-day items stay visible and are never given an arrival time.',
}

const EDITED_FIELDS = { title: 'name', time: 'time' }

const MINUTE = 60000
/** Moves snap to five-minute marks; dragging this far moves one mark. */
const MOVE_STEP = 5 * MINUTE
const PX_PER_STEP = 8
const KEY_STEPS = { ArrowUp: -1, ArrowDown: 1 }

/** The start `ms` rounded to a five-minute mark, kept within `bounds`. */
function snapStart(ms, bounds) {
  return Math.min(bounds.latest, Math.max(bounds.earliest, Math.round(ms / MOVE_STEP) * MOVE_STEP))
}

/** Why a stop has no edit form, for the few stops that can't be edited. */
function notEditableReason(stop, hasTimes) {
  if (stop.timing.kind === 'all-day') return 'All-day items have no times to change. You can still delete this.'
  if (stop.status !== 'planned') return 'This stop is finished, so it can’t be edited. You can still delete it.'
  if (!hasTimes) return 'This stop doesn’t have a time yet, so it can’t be edited. You can still delete it.'
  return 'This stop can’t be edited here. You can still delete it.'
}

/** "You changed the name and time in DayMap…", or null for stops not from Google Calendar. */
function calendarNote(stop) {
  if (stop.source !== 'google-calendar') return null
  const fields = (stop.localEdits ?? []).map((field) => EDITED_FIELDS[field]).filter(Boolean)
  if (fields.length === 0) return 'From Google Calendar. Importing again updates it with any changes made there.'
  return `From Google Calendar. You changed the ${fields.join(' and ')} in DayMap, so importing again keeps your version.`
}

function StarIcon({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 1.9l2.13 4.46 4.9.64-3.58 3.4.9 4.86L9 12.9l-4.35 2.36.9-4.86-3.58-3.4 4.9-.64Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * One stop in the planner. The header selects and expands it, and a star
 * beside it (a separate button, never inside the header) makes the stop fixed
 * (starred) or flexible. The expanded area shows details, quick length
 * controls and the edit form for every stop that can be edited, and Delete
 * for every stop. Colour is never the only signal: kind, location status,
 * changes and finished are written out.
 *
 * @param {object} props
 * @param {object} props.stop Stop in the §5 shape (from the draft when there is one).
 * @param {string} props.date Plan date, "YYYY-MM-DD".
 * @param {string} props.timezone Plan IANA timezone.
 * @param {boolean} props.selected
 * @param {boolean} props.open
 * @param {boolean} props.past Whether the stop has already ended.
 * @param {boolean} props.changed Whether the draft changes this stop.
 * @param {boolean} props.added Whether the stop was just added.
 * @param {number | null} props.flashKey Changes each time "View in planner" reveals this row.
 * @param {(stopId: string) => void} props.onToggle
 * @param {(stopId: string, edit: object) => void} props.onSave
 * @param {(stopId: string, edit: object) => void} props.onResize Puts a longer or shorter stop in the draft; the row stays open.
 * @param {(stopId: string) => void} props.onDelete
 * @param {'set' | 'needed' | 'none'} props.placeState Whether the stop has a place, needs one, or needs none.
 * @param {string | null} props.calendarPlace The location text from Google Calendar, if any.
 * @param {(stopId: string, location: object | null) => void} props.onSetPlace Sets a place, or null for "no place needed".
 * @param {((stopId: string, kind: 'fixed' | 'flexible') => void) | null} props.onSetKind Null when the kind can't change now.
 * @param {string | null} props.kindHint Why the kind can't change right now, if it can't.
 * @param {string | null} [props.overlap] Which stops this one overlaps, e.g. "Overlaps ‘Lecture’ by 15 min.", while open.
 * @param {((stopId: string, edit: object) => void) | null} [props.onMove] Puts the stop at new times of the same length in
 *   the draft. Dragging the row (or Alt+↑/↓) moves it; null when it can't move.
 */
export default function EventRow({ stop, date, timezone, selected, open, past, changed, added, flashKey, onToggle, onSave, onResize, onDelete, conflict,
  placeState, calendarPlace, onSetPlace, onSetKind, kindHint, overlap = null, onMove = null }) {
  const id = useId()
  const [picking, setPicking] = useState(false)
  if (!open && picking) setPicking(false)
  const { timing } = stop
  const placeText = placeState === 'set' ? stop.location.label : placeState === 'none' ? 'No place' : 'Location needed'
  const detailsId = `stop-details-${stop.id}`
  const hasTimes = timing.scheduledStartAt !== null && timing.scheduledEndAt !== null
  const duration = timing.kind === 'all-day' ? null : formatDuration(timing.durationMinutes)
  const editedInDayMap = stop.source === 'google-calendar' && (stop.localEdits?.length ?? 0) > 0
  const sourceNote = calendarNote(stop)
  const note = isDayNote(stop)
  const editable = canEditStop(stop) || note
  // The star is for stops DayMap could still move: not all-day, finished or unscheduled.
  const showStar = editable && !past && !note
  const fixed = timing.kind === 'fixed'
  const kindLocked = onSetKind === null
  // Dragging keeps the length and changes the time; journeys follow from the new times.
  const bounds = onMove && editable && !note && !past ? moveBounds(stop, { date, timezone }) : null
  const startMs = hasTimes ? Date.parse(timing.scheduledStartAt) : NaN
  const lengthMs = hasTimes ? Date.parse(timing.scheduledEndAt) - startMs : NaN
  const draggedStart = (offset) => snapStart(startMs + Math.round(offset / PX_PER_STEP) * MOVE_STEP, bounds)
  function moveTo(start) {
    const edit = movedStopEdit(stop, start, { date, timezone })
    if (edit) onMove(stop.id, edit)
  }
  const { ref: dragRef, offset, dragging, handlers } = useVerticalDrag({
    enabled: bounds !== null, onDrop: (dropOffset) => moveTo(draggedStart(dropOffset)),
  })
  const shownStart = dragging && bounds ? draggedStart(offset) : startMs
  const timeText = note ? '' : hasTimes
    ? formatTimeRange(new Date(shownStart).toISOString(), new Date(shownStart + lengthMs).toISOString(), timezone)
    : timing.kind === 'all-day' ? 'All day' : 'Time not set'

  function onKeyDown(event) {
    const direction = KEY_STEPS[event.key]
    if (!bounds || !event.altKey || !direction) return
    event.preventDefault()
    moveTo(snapStart(startMs + direction * (event.shiftKey ? 6 : 1) * MOVE_STEP, bounds))
  }
  const details = [
    past ? 'Finished' : null,
    isDayNote(stop) ? 'Note' : KIND_LABELS[timing.kind],
    note ? stop.location?.label : placeText,
    duration,
    editedInDayMap ? 'Edited in DayMap' : null,
  ].filter(Boolean)
  const starTitle = kindLocked && kindHint
    ? kindHint
    : fixed
      ? 'Fixed: DayMap won’t move this. Select to make it flexible.'
      : 'Flexible: DayMap may suggest moving this. Select to keep it fixed.'

  function toggleStar() {
    if (kindLocked) return
    onSetKind(stop.id, fixed ? 'flexible' : 'fixed')
  }

  return (
    <div
      className="event-item"
      data-stop-id={stop.id}
      data-selected={selected || undefined}
      data-open={open || undefined}
      data-dragging={dragging || undefined}
      style={dragging ? { transform: `translateY(${offset}px)` } : undefined}
    >
      {/* A new key restarts the highlight animation on every reveal. */}
      {flashKey !== null && <span key={flashKey} className="event-item-flash" aria-hidden="true" />}
      {/* A sibling of the row button, drawn over the dot's column, so it never toggles the row. */}
      {showStar && (
        <button
          type="button"
          className="event-star"
          data-kind={timing.kind}
          aria-label={`Keep ${stop.title} fixed`}
          aria-pressed={fixed}
          aria-disabled={kindLocked || undefined}
          aria-describedby={kindLocked && kindHint ? `${id}-kind-hint` : undefined}
          title={starTitle}
          onClick={toggleStar}
        >
          <StarIcon filled={fixed} />
        </button>
      )}
      {showStar && kindLocked && kindHint && <span id={`${id}-kind-hint`} className="visually-hidden">{kindHint}</span>}
      {bounds && <span id={`${id}-move-hint`} className="visually-hidden">Drag, or press Alt with the up or down arrow, to move it 5 minutes. Add Shift for 30.</span>}
      <button
        ref={dragRef}
        type="button"
        className="event-row"
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        aria-current={selected || undefined}
        aria-describedby={bounds ? `${id}-move-hint` : undefined}
        aria-keyshortcuts={bounds ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
        data-past={past || undefined}
        data-movable={bounds ? '' : undefined}
        onClick={() => onToggle(stop.id)}
        onKeyDown={onKeyDown}
        {...handlers}
      >
        {showStar ? <span aria-hidden="true" /> : <span className="event-row-dot" data-kind={timing.kind} aria-hidden="true" />}
        <span className="event-row-text">
          <span className="event-row-name">
            {stop.title}
            {changed && <span className="event-row-changed">Changed</span>}
            {added && <span className="event-row-new">New</span>}
          </span>
          <span className="event-row-details">{details.join(' · ')}</span>
          {conflict && <span className="event-row-conflict">Schedule conflict</span>}
        </span>
        <span className="event-row-time" data-moving={dragging && shownStart !== startMs ? '' : undefined}>{timeText}</span>
        <svg className="event-row-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={detailsId} className="event-details">
          {!note && (picking ? (
            <PlacePicker
              initialQuery={placeState === 'set' ? '' : calendarPlace ?? ''}
              onPick={(place) => { setPicking(false); onSetPlace(stop.id, place) }}
              onNoPlace={placeState === 'none' ? null : () => { setPicking(false); onSetPlace(stop.id, null) }}
              onCancel={() => setPicking(false)}
            />
          ) : (
            <div className="event-place">
              <span className="event-place-label"><strong>Place:</strong> {placeText}</span>
              <button type="button" className="button-text" onClick={() => setPicking(true)}>
                {placeState === 'set' ? 'Change place' : 'Set place'}
              </button>
              {placeState === 'needed' && calendarPlace && (
                <span className="event-place-hint">Google Calendar says “{calendarPlace}”.</span>
              )}
            </div>
          ))}
          <p className="event-details-info">
            {note ? 'A note for today. It does not affect your schedule or travel.' : `${[duration, placeText].filter(Boolean).join(' · ')}. ${KIND_NOTES[timing.kind]}`}
          </p>
          {showStar && kindLocked && kindHint && <p className="event-details-info">{kindHint}</p>}
          {sourceNote && <p className="event-details-info">{sourceNote}</p>}
          {editable ? (
            <>
              {!isDayNote(stop) && overlap && <p className="event-overlap-note">{overlap}</p>}
              {!isDayNote(stop) && <LengthStepper stop={stop} onResize={(edit) => onResize(stop.id, edit)} />}
              <EventEditForm
                stop={stop}
                date={date}
                timezone={timezone}
                onSave={(edit) => onSave(stop.id, edit)}
                onDelete={() => onDelete(stop.id)}
                onCancel={() => onToggle(stop.id)}
              />
            </>
          ) : (
            <>
              <p className="event-details-info">{notEditableReason(stop, hasTimes)}</p>
              <div className="event-form-actions">
                <button type="button" className="button-destructive" data-delete-stop={stop.id} onClick={() => onDelete(stop.id)}>
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
