// Words for editing a stop in the planner: why a length button can't be used,
// and which stops this one overlaps.

import { formatClock } from '../components/formatTime.js'

/**
 * Why a stop can't be made `deltaMinutes` longer or shorter.
 *
 * @param {ReturnType<import('../app/planEdits.js').resizeBlock>} code
 * @param {object} stop Stop in the §5 shape.
 * @param {number} deltaMinutes
 * @param {string} timezone Plan IANA timezone.
 * @param {number} minMinutes The shortest a stop can be (MIN_STOP_MINUTES).
 * @returns {string | null} Null when nothing blocks it.
 */
export function resizeBlockMessage(code, stop, deltaMinutes, timezone, minMinutes) {
  switch (code) {
    case null:
    case undefined:
      return null
    case 'too-short':
      return `Can’t be shorter than ${minMinutes} minutes.`
    case 'too-long':
      return 'Can’t be longer than 24 hours.'
    case 'past-day-end':
      return 'Can’t run past the end of the day.'
    case 'outside-window':
      return stop.timing.latestEndAt
        ? `Can’t be longer: it has to end by ${formatClock(stop.timing.latestEndAt, timezone)}.`
        : 'Can’t be longer: it has to stay inside its time window.'
    default:
      return deltaMinutes < 0 ? 'Can’t be shorter here.' : 'Can’t be longer here.'
  }
}

/**
 * "Overlaps ‘Morning lecture’ by 15 min.", naming every stop whose time
 * overlaps this one, or null when none does.
 *
 * @param {object[]} conflicts From the plan analysis.
 * @param {string} stopId
 * @param {object[]} stops The shown plan's stops, to look up names.
 */
export function overlapNote(conflicts, stopId, stops) {
  const overlaps = conflicts.filter((conflict) => conflict.code === 'overlap' && conflict.stopIds.includes(stopId))
  const names = overlaps.map((conflict) => {
    const otherId = conflict.stopIds.find((id) => id !== stopId)
    const other = stops.find((stop) => stop.id === otherId)
    return other ? `‘${other.title}’ by ${conflict.minutes} min` : null
  }).filter(Boolean)
  if (names.length === 0) return null
  return `Overlaps ${names.join(' and ')}.`
}
