// Rules for user edits to a stop. Shared by the reducer (which rejects invalid
// edits) and the planner form (which explains them).

/** Manual all-day items are notes, using the existing persisted stop shape. */
export const isDayNote = (stop) => stop.source === 'manual' && stop.timing.kind === 'all-day'

/**
 * @typedef {object} StopEdit
 * @property {string} title
 * @property {string} scheduledStartAt UTC timestamp
 * @property {string} scheduledEndAt UTC timestamp
 */

/**
 * Check an edit to a flexible stop.
 *
 * @param {object} stop Stop in the §5 shape.
 * @param {StopEdit} edit
 * @returns {null | 'not-editable' | 'missing-title' | 'end-before-start' | 'outside-window'}
 */
export function validateStopEdit(stop, edit) {
  if (stop.timing.kind !== 'flexible' && !isDayNote(stop)) return 'not-editable'
  if (edit.title.trim() === '') return 'missing-title'
  if (isDayNote(stop)) return edit.scheduledStartAt === null && edit.scheduledEndAt === null ? null : 'not-editable'
  const start = Date.parse(edit.scheduledStartAt)
  const end = Date.parse(edit.scheduledEndAt)
  if (!(end > start)) return 'end-before-start'
  const { earliestStartAt, latestEndAt } = stop.timing
  if (earliestStartAt !== null && start < Date.parse(earliestStartAt)) return 'outside-window'
  if (latestEndAt !== null && end > Date.parse(latestEndAt)) return 'outside-window'
  return null
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
