import { useState } from 'react'
import { formatDuration, formatTimeRange } from '../components/formatTime.js'
import { WhenModeToggle } from './AddEventFields.jsx'
import EventEditForm from './EventEditForm.jsx'
import PlacePicker from './PlacePicker.jsx'
import { KIND_LABELS } from './stopLabels.js'

const KIND_NOTES = {
  fixed: 'DayMap will never move a fixed event.',
  flexible: 'DayMap may suggest changes to this, and will always ask first.',
  'all-day': 'All-day items stay visible and are never given an arrival time.',
}

/**
 * One stop in the planner. The header selects and expands it; the expanded
 * area shows details and, for flexible stops, the edit form. Colour is never
 * the only signal: kind, location status, changes and finished are written out.
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
 * @param {(stopId: string) => void} props.onDelete
 * @param {'set' | 'needed' | 'none'} props.placeState Whether the stop has a place, needs one, or needs none.
 * @param {string | null} props.calendarPlace The location text from Google Calendar, if any.
 * @param {(stopId: string, location: object | null) => void} props.onSetPlace Sets a place, or null for "no place needed".
 * @param {((stopId: string, kind: 'fixed' | 'flexible') => void) | null} props.onSetKind Null when the kind can't change now.
 * @param {string | null} props.kindHint Why the kind can't change right now, if it can't.
 */
export default function EventRow({ stop, date, timezone, selected, open, past, changed, added, flashKey, onToggle, onSave, onDelete, conflict,
  placeState, calendarPlace, onSetPlace, onSetKind, kindHint }) {
  const [picking, setPicking] = useState(false)
  if (!open && picking) setPicking(false)
  const { timing } = stop
  const placeText = placeState === 'set' ? stop.location.label : placeState === 'none' ? 'No place' : 'Location needed'
  const detailsId = `stop-details-${stop.id}`
  const hasTimes = timing.scheduledStartAt !== null && timing.scheduledEndAt !== null
  const duration = timing.kind === 'all-day' ? null : formatDuration(timing.durationMinutes)
  const details = [
    past ? 'Finished' : null,
    KIND_LABELS[timing.kind],
    placeText,
    duration,
  ].filter(Boolean)

  return (
    <div
      className="event-item"
      data-stop-id={stop.id}
      data-selected={selected || undefined}
      data-open={open || undefined}
    >
      {/* A new key restarts the highlight animation on every reveal. */}
      {flashKey !== null && <span key={flashKey} className="event-item-flash" aria-hidden="true" />}
      <button
        type="button"
        className="event-row"
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        aria-current={selected || undefined}
        data-past={past || undefined}
        onClick={() => onToggle(stop.id)}
      >
        <span className="event-row-dot" data-kind={timing.kind} aria-hidden="true" />
        <span className="event-row-text">
          <span className="event-row-name">
            {stop.title}
            {changed && <span className="event-row-changed">Changed</span>}
            {added && <span className="event-row-new">New</span>}
          </span>
          <span className="event-row-details">{details.join(' · ')}</span>
          {conflict && <span className="event-row-conflict">Schedule conflict</span>}
        </span>
        <span className="event-row-time">
          {hasTimes ? formatTimeRange(timing.scheduledStartAt, timing.scheduledEndAt, timezone) : 'Time not set'}
        </span>
        <svg className="event-row-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={detailsId} className="event-details">
          {picking ? (
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
          )}
          {timing.kind !== 'all-day' && stop.status === 'planned' && hasTimes && (
            <div className="event-kind">
              <span className="event-form-label event-kind-label">Can DayMap move this?</span>
              <WhenModeToggle
                value={timing.kind}
                onChange={(kind) => onSetKind?.(stop.id, kind)}
                options={[['fixed', 'No, fixed'], ['flexible', 'Yes, flexible']]}
                label="Can DayMap move this?"
                disabled={onSetKind === null}
              />
              {kindHint && <span className="event-place-hint">{kindHint}</span>}
            </div>
          )}
          <p className="event-details-info">
            {[duration, placeText].filter(Boolean).join(' · ')}. {KIND_NOTES[timing.kind]}
          </p>
          {timing.kind === 'flexible' ? (
            <EventEditForm
              stop={stop}
              date={date}
              timezone={timezone}
              onSave={(edit) => onSave(stop.id, edit)}
              onDelete={() => onDelete(stop.id)}
              onCancel={() => onToggle(stop.id)}
            />
          ) : (
            <p className="event-details-info">Only flexible stops can be edited here.</p>
          )}
        </div>
      )}
    </div>
  )
}
