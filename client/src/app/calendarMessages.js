const PARAMS = ['calendar', 'reason']

/** The `?calendar=…&reason=…` the server adds when Google sends the person back, or null. */
export function readCalendarReturn(search) {
  const params = new URLSearchParams(search)
  const outcome = params.get('calendar')
  if (!['connected', 'denied', 'error'].includes(outcome)) return null
  return { outcome, reason: params.get('reason') }
}

/** The same address without the Calendar return parameters. */
export function withoutCalendarReturn(href) {
  const url = new URL(href)
  for (const name of PARAMS) url.searchParams.delete(name)
  return url.toString()
}

const REASONS = {
  INVALID_OAUTH_STATE: 'The Calendar connection took too long or was already used. Connect again.',
  CALENDAR_CONNECTION_CANCELLED: 'That Calendar connection was replaced or cancelled. Connect again.',
  CALENDAR_RECONNECT_REQUIRED: 'Google didn’t grant offline Calendar access. Connect again and allow access.',
  CALENDAR_NOT_CONFIGURED: 'Google Calendar isn’t set up on this DayMap server yet.',
  GOOGLE_AUTH_FAILED: 'Google refused the Calendar connection. Connect again.',
  GOOGLE_UNAVAILABLE: 'Google Calendar is unavailable right now. Try again in a moment.',
}

/** What to tell the person after Google sends them back. */
export function calendarReturnMessage({ outcome, reason }) {
  if (outcome === 'connected') return { tone: 'success', text: 'Google Calendar connected. Importing today’s events…' }
  if (outcome === 'denied') return { tone: 'info', text: 'Calendar access wasn’t granted. Nothing was imported.' }
  return { tone: 'error', text: REASONS[reason] ?? 'Google Calendar couldn’t be connected. Try again.' }
}

/** A one-line result for an import. */
export function importSummaryMessage({ added, updated, removed }) {
  const parts = []
  if (added) parts.push(`${added} added`)
  if (updated) parts.push(`${updated} updated`)
  if (removed) parts.push(`${removed} removed`)
  if (!parts.length) return 'Your day is up to date with Google Calendar.'
  const events = added + updated + removed === 1 ? 'event' : 'events'
  return `Calendar ${events} imported: ${parts.join(', ')}.`
}

/** What to tell the person when an import or status request fails. */
export function calendarErrorMessage(error) {
  if (error?.code === 'CALENDAR_RECONNECT_REQUIRED') return 'Google Calendar access expired. Reconnect to import events.'
  if (error?.code === 'CALENDAR_NOT_CONFIGURED') return REASONS.CALENDAR_NOT_CONFIGURED
  if (error?.code === 'VERSION_CONFLICT') return 'Your day changed while importing. Import again.'
  return error?.message ?? 'Google Calendar couldn’t be reached. Try again.'
}
