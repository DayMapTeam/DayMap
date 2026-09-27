// Rules for user edits to a stop. Shared by the reducer (which rejects invalid
// edits) and the planner form (which explains them).

import { toTimeInputValue } from '../components/formatTime.js'
import { zonedTimeToTimestamp } from '../components/zonedTime.js'
import { planDayBounds } from '../../../shared/planning/dayBounds.js'
import { localDate } from './planPersistence.js'

/** Manual all-day items are notes, using the existing persisted stop shape. */
export const isDayNote = (stop) => stop.source === 'manual' && stop.timing.kind === 'all-day'

/**
 * @typedef {object} StopEdit
 * @property {string} title
 * @property {string} scheduledStartAt UTC timestamp
 * @property {string} scheduledEndAt UTC timestamp
 */

/** The shortest visit a resize can leave, in minutes. */
export const MIN_STOP_MINUTES = 5
const MAX_STOP_MINUTES = 1440
const MINUTE = 60000
const LOCAL_EDITS = ['title', 'time']
const sameInstant = (a, b) => (a === null || b === null ? a === b : Date.parse(a) === Date.parse(b))

/**
 * Whether the person can change a stop's title and times: planned fixed or
 * flexible stops with planned times. All-day and finished stops stay as they are.
 *
 * @param {object} stop Stop in the §5 shape.
 */
export function canEditStop(stop) {
  const { timing } = stop
  return stop.status === 'planned' && ['fixed', 'flexible'].includes(timing.kind)
    && timing.scheduledStartAt !== null && timing.scheduledEndAt !== null
}

/**
 * Check an edit to a stop. Fixed stops take any times up to a day long; a
 * flexible stop with a window must stay inside it.
 *
 * @param {object} stop Stop in the §5 shape.
 * @param {StopEdit} edit
 * @returns {null | 'not-editable' | 'missing-title' | 'end-before-start' | 'too-long' | 'outside-window'}
 */
export function validateStopEdit(stop, edit) {
  if (!canEditStop(stop) && !isDayNote(stop)) return 'not-editable'
  if (edit.title.trim() === '') return 'missing-title'
  if (isDayNote(stop)) return edit.scheduledStartAt === null && edit.scheduledEndAt === null ? null : 'not-editable'
  const start = Date.parse(edit.scheduledStartAt)
  const end = Date.parse(edit.scheduledEndAt)
  if (!(end > start)) return 'end-before-start'
  if (end - start > MAX_STOP_MINUTES * MINUTE) return 'too-long'
  if (stop.timing.kind !== 'flexible') return null
  const { earliestStartAt, latestEndAt } = stop.timing
  if (earliestStartAt !== null && start < Date.parse(earliestStartAt)) return 'outside-window'
  if (latestEndAt !== null && end > Date.parse(latestEndAt)) return 'outside-window'
  return null
}

const nextDate = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)

/**
 * The times an edit form means, from its "HH:MM" start and end inputs. A field
 * left at the stop's current time keeps its exact timestamp, so a name-only
 * edit never moves a stop (even one that starts the day before, or at 09:00:30).
 * A changed start is on the plan's date. A changed end is on the start's
 * local date. Only a stop that already crosses midnight (10:00pm–1:00am from
 * Calendar) rolls an end at or before its start to the next day; elsewhere
 * that is a typo and fails validation, the same as the length buttons never
 * pushing a stop past midnight.
 *
 * @param {object} stop Stop in the §5 shape, with scheduled times.
 * @param {{ start: string, end: string }} inputs "HH:MM", 24-hour.
 * @param {{ date: string, timezone: string }} day The plan's date and IANA timezone.
 * @returns {{ scheduledStartAt: string, scheduledEndAt: string }}
 */
export function timesFromInputs(stop, { start, end }, { date, timezone }) {
  const { scheduledStartAt, scheduledEndAt } = stop.timing
  const startAt = scheduledStartAt !== null && start === toTimeInputValue(scheduledStartAt, timezone)
    ? scheduledStartAt
    : zonedTimeToTimestamp(date, start, timezone)
  if (scheduledEndAt !== null && end === toTimeInputValue(scheduledEndAt, timezone)) {
    return { scheduledStartAt: startAt, scheduledEndAt }
  }
  const startDate = localDate(new Date(startAt), timezone)
  const crossesMidnight = scheduledStartAt !== null && scheduledEndAt !== null
    && localDate(new Date(scheduledEndAt), timezone) !== localDate(new Date(scheduledStartAt), timezone)
  let endAt = zonedTimeToTimestamp(startDate, end, timezone)
  if (crossesMidnight && Date.parse(endAt) <= Date.parse(startAt)) endAt = zonedTimeToTimestamp(nextDate(startDate), end, timezone)
  return { scheduledStartAt: startAt, scheduledEndAt: endAt }
}

/**
 * Why a stop's length can't change by `deltaMinutes` (its end moves, its
 * start stays), or null when it can. 'past-day-end' means the end would newly
 * pass midnight at the end of the plan's day; a stop that already crosses it
 * may still grow or shrink.
 *
 * @param {object} stop Stop in the §5 shape.
 * @param {number} deltaMinutes
 * @param {{ date: string, timezone: string }} plan
 * @returns {null | 'not-editable' | 'too-short' | 'too-long' | 'outside-window' | 'past-day-end'}
 */
export function resizeBlock(stop, deltaMinutes, plan) {
  if (!canEditStop(stop) || !Number.isFinite(deltaMinutes)) return 'not-editable'
  const start = Date.parse(stop.timing.scheduledStartAt)
  const oldEnd = Date.parse(stop.timing.scheduledEndAt)
  const end = oldEnd + deltaMinutes * MINUTE
  if (end - start < MIN_STOP_MINUTES * MINUTE) return 'too-short'
  if (end - start > MAX_STOP_MINUTES * MINUTE) return 'too-long'
  const { latestEndAt } = stop.timing
  if (stop.timing.kind === 'flexible' && latestEndAt !== null && end > Date.parse(latestEndAt)) return 'outside-window'
  const dayEnd = planDayBounds(plan.date, plan.timezone).end
  if (end > dayEnd && oldEnd <= dayEnd) return 'past-day-end'
  return null
}

/**
 * The edit that keeps a stop's title and start and moves its end by
 * `deltaMinutes`, or null exactly when resizeBlock gives a reason.
 *
 * @param {object} stop Stop in the §5 shape.
 * @param {number} deltaMinutes
 * @param {{ date: string, timezone: string }} plan
 * @returns {StopEdit | null}
 */
export function resizedStopEdit(stop, deltaMinutes, plan) {
  if (resizeBlock(stop, deltaMinutes, plan) !== null) return null
  const { scheduledStartAt, scheduledEndAt } = stop.timing
  return {
    title: stop.title,
    scheduledStartAt,
    scheduledEndAt: deltaMinutes === 0
      ? scheduledEndAt
      : new Date(Date.parse(scheduledEndAt) + deltaMinutes * MINUTE).toISOString(),
  }
}

/**
 * `after` with 'time' added to the `localEdits` of every Google Calendar stop
 * whose planned times differ from `before`, however they changed (an edit, an
 * accepted suggestion, a stop added in front). Re-import then keeps DayMap's
 * times. Returns `after` itself when nothing needs marking.
 */
export function withLocalTimeMarks(before, after) {
  const beforeById = new Map(before.stops.map((stop) => [stop.id, stop]))
  const moved = (stop) => {
    const old = beforeById.get(stop.id)
    if (stop.source !== 'google-calendar' || old === undefined || stop.localEdits?.includes('time')) return false
    return !sameInstant(old.timing.scheduledStartAt, stop.timing.scheduledStartAt)
      || !sameInstant(old.timing.scheduledEndAt, stop.timing.scheduledEndAt)
  }
  if (!after.stops.some(moved)) return after
  return {
    ...after,
    stops: after.stops.map((stop) => (moved(stop)
      ? { ...stop, localEdits: LOCAL_EDITS.filter((field) => field === 'time' || stop.localEdits?.includes(field)) }
      : stop)),
  }
}

/**
 * Stops whose user-visible fields differ between two versions of a plan.
 *
 * @returns {{ before: object, after: object }[]} In the order of `after`.
 */
export function listStopChanges(before, after) {
  const beforeById = new Map(before.stops.map((stop) => [stop.id, stop]))
  return after.stops
    .map((stop) => ({ before: beforeById.get(stop.id), after: stop }))
    .filter(({ before: old, after: next }) =>
      old === undefined ||
      old.title !== next.title ||
      old.timing.scheduledStartAt !== next.timing.scheduledStartAt ||
      old.timing.scheduledEndAt !== next.timing.scheduledEndAt,
    )
}

/**
 * The stop with a different kind, or null when it can't change: all-day and
 * finished stops, and stops without planned times. Fixed → flexible keeps the
 * planned times with no window limit; flexible → fixed pins them.
 *
 * @param {object} stop Stop in the §5 shape.
 * @param {'fixed' | 'flexible'} kind
 */
export function withStopKind(stop, kind) {
  const { timing } = stop
  if (!['fixed', 'flexible'].includes(kind) || !['fixed', 'flexible'].includes(timing.kind) || timing.kind === kind) return null
  if (stop.status !== 'planned' || timing.scheduledStartAt === null || timing.scheduledEndAt === null) return null
  const pinned = kind === 'fixed'
  return {
    ...stop,
    timing: {
      ...timing,
      kind,
      fixedStartAt: pinned ? timing.scheduledStartAt : null,
      fixedEndAt: pinned ? timing.scheduledEndAt : null,
      earliestStartAt: null,
      latestEndAt: null,
    },
  }
}

const TRAVEL_MODES = ['walk', 'transit', 'drive']

/**
 * The stop with a chosen way of getting to it ('walk' | 'transit' | 'drive'),
 * or null for automatic. Returns null when nothing would change.
 */
export function withTravelMode(stop, mode) {
  const next = TRAVEL_MODES.includes(mode) ? mode : null
  if ((stop.travelMode ?? null) === next) return null
  return { ...stop, travelMode: next }
}

/**
 * The plan with where the day starts and/or ends ('start' | 'end' | 'both'),
 * or without it (location null). Returns the same plan when nothing changes.
 */
export function withDayPlace(plan, which, location) {
  const place = location ? { label: location.label, placeId: location.placeId ?? null, lat: location.lat, lng: location.lng } : null
  const fields = which === 'both' ? ['startPlace', 'endPlace'] : which === 'start' ? ['startPlace'] : which === 'end' ? ['endPlace'] : []
  const same = (a, b) => (a ?? null) === null ? b === null : b !== null && a.lat === b.lat && a.lng === b.lng && a.label === b.label
  if (fields.every((field) => same(plan[field], place))) return plan
  return { ...plan, ...Object.fromEntries(fields.map((field) => [field, place])) }
}
