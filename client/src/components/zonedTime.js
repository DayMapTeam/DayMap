// Convert a wall-clock time in an IANA timezone to an instant, using Intl to
// look up the offset for that date. Never hard-code an offset: Adelaide's
// changes with daylight saving.

function offsetMinutes(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant)
  const value = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]))
  const wallAsUtc = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute)
  return Math.round((wallAsUtc - instant.getTime()) / 60000)
}

/**
 * @param {string} isoDate "YYYY-MM-DD"
 * @param {string} time "HH:MM", 24-hour
 * @param {string} timeZone IANA timezone, e.g. "Australia/Adelaide"
 * @returns {Date}
 */
export function zonedTimeToDate(isoDate, time, timeZone) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  // The second pass corrects the guess when the offset differs at the result.
  const guess = wall - offsetMinutes(new Date(wall), timeZone) * 60000
  return new Date(wall - offsetMinutes(new Date(guess), timeZone) * 60000)
}

/** Same as zonedTimeToDate, as a contract timestamp: "2026-09-26T00:20:00Z". */
export function zonedTimeToTimestamp(isoDate, time, timeZone) {
  return zonedTimeToDate(isoDate, time, timeZone).toISOString().replace('.000Z', 'Z')
}
