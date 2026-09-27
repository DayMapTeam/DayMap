// Labels and focus order for Calendar events the person removed from DayMap.

/** A stable key for a removed Calendar event. */
export function removedEventKey({ sourceCalendarId, sourceEventId }) {
  return `${sourceCalendarId}\u0000${sourceEventId}`
}

/** "1 removed Calendar event", "3 removed Calendar events". */
export function removedEventsSummary(count) {
  return `${count} removed Calendar ${count === 1 ? 'event' : 'events'}`
}

/**
 * After one event is brought back and its row goes away, the keys to try
 * focusing, in order: the next event's button, then the one before.
 *
 * @param {string[]} keys The listed events' keys, in order.
 * @param {string} key The event brought back.
 */
export function focusKeysAfterRestore(keys, key) {
  const index = keys.indexOf(key)
  if (index === -1) return []
  return [keys[index + 1], keys[index - 1]].filter((candidate) => candidate !== undefined)
}
