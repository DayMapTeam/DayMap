// Rules for user edits to a stop. Shared by the reducer (which rejects invalid
// edits) and the planner form (which explains them).

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
  if (stop.timing.kind !== 'flexible') return 'not-editable'
  if (edit.title.trim() === '') return 'missing-title'
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
