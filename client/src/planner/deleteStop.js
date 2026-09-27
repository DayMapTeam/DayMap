// What the planner says and does around deleting a stop.

import { sortStopsForDisplay } from '../../../shared/planning/timeline.js'

/** What the delete dialog says: Calendar events are only removed from DayMap. */
export function deleteMessage(stop) {
  if (stop.source === 'google-calendar') {
    return `“${stop.title}” will be removed from DayMap only. Your Google Calendar won’t change, and importing again won’t bring it back. You can bring it back from the bottom of the planner.`
  }
  return `“${stop.title}” will be removed from your day. You can undo this straight after.`
}

/**
 * Where focus goes once the delete dialog closes, as selectors separated by
 * " || " for useReturnFocus: back to Delete if it is still there, else the
 * next stop, the one before, or the + button.
 *
 * @param {object[]} stops The shown plan's stops.
 * @param {string} stopId The stop being deleted.
 * @param {(value: string) => string} [escape] CSS.escape in the browser.
 */
export function deleteFocusSelectors(stops, stopId, escape = globalThis.CSS?.escape) {
  const ordered = sortStopsForDisplay(stops)
  const index = ordered.findIndex((stop) => stop.id === stopId)
  const neighbours = index === -1 ? [] : [ordered[index + 1], ordered[index - 1]].filter(Boolean)
  return [
    `[data-delete-stop="${escape(stopId)}"]`,
    ...neighbours.map((stop) => `[data-stop-id="${escape(stop.id)}"] .event-row`),
    '.planner-add',
  ].join(' || ')
}
