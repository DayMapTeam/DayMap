import { createHash } from 'node:crypto'
import { ApiError } from '../middleware/apiError.js'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars'
const FIELDS = 'nextPageToken,items(id,status,summary,location,start,end,attendees(self,responseStatus),hangoutLink,conferenceData(entryPoints(entryPointType)))'
// 10 × 250 events is far beyond one person's day; stop rather than loop forever.
const MAX_PAGES = 10
const MAX_TITLE = 200
const MAX_QUOTED = 200

/**
 * Read one day of a calendar. Recurring events arrive as single occurrences
 * (singleEvents) and every page is followed. The access token stays on the server.
 */
export async function listCalendarEvents({ accessToken, calendarId = 'primary', timeMin, timeMax, fetchImpl = fetch }) {
  const items = []
  let pageToken
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${CALENDAR_API}/${encodeURIComponent(calendarId)}/events`)
    url.search = new URLSearchParams({
      singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', maxResults: '250',
      timeMin: new Date(timeMin).toISOString(), timeMax: new Date(timeMax).toISOString(),
      fields: FIELDS, ...(pageToken ? { pageToken } : {}),
    }).toString()
    let response
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      })
    } catch {
      throw new ApiError(503, 'GOOGLE_UNAVAILABLE', 'Google Calendar is unavailable. Please try again.', true)
    }
    if (response.status === 401) {
      throw new ApiError(409, 'CALENDAR_RECONNECT_REQUIRED', 'Calendar access expired. Reconnect.')
    }
    if (response.status === 403 || response.status === 429 || response.status >= 500) {
      throw new ApiError(503, 'GOOGLE_UNAVAILABLE', 'Google Calendar is busy. Please try again.', true)
    }
    if (!response.ok) throw new ApiError(502, 'GOOGLE_CALENDAR_FAILED', 'Google Calendar could not list events.')
    let body
    try { body = await response.json() } catch {
      throw new ApiError(502, 'GOOGLE_CALENDAR_FAILED', 'Google Calendar returned an invalid response.')
    }
    if (!Array.isArray(body?.items)) throw new ApiError(502, 'GOOGLE_CALENDAR_FAILED', 'Google Calendar returned an invalid response.')
    items.push(...body.items)
    pageToken = typeof body.nextPageToken === 'string' && body.nextPageToken ? body.nextPageToken : null
    if (!pageToken) return items
  }
  throw new ApiError(502, 'GOOGLE_CALENDAR_FAILED', 'Too many Calendar events for one day.')
}

/** The same calendar event always maps to the same UUID, so re-imports update in place. */
export function calendarStopId(calendarId, eventId) {
  const hex = createHash('sha256').update(`google-calendar\0${calendarId}\0${eventId}`).digest('hex')
  // RFC 9562 version 8 (custom) with the RFC variant bits.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const nextDate = date => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
const quote = value => (value.length > MAX_QUOTED ? `${value.slice(0, MAX_QUOTED - 1)}…` : value).replace(/\s+/g, ' ')
const isOnline = event => Boolean(event.hangoutLink)
  || Boolean(event.conferenceData?.entryPoints?.some(entry => entry.entryPointType === 'video'))

function timingFor(event, { date, dayStart, dayEnd }) {
  const allDay = { kind: 'all-day', durationMinutes: null, fixedStartAt: null, fixedEndAt: null,
    earliestStartAt: null, latestEndAt: null, scheduledStartAt: null, scheduledEndAt: null }
  if (typeof event.start?.date === 'string') {
    // Date-only events have an exclusive end date and no clock time to invent.
    const end = typeof event.end?.date === 'string' ? event.end.date : nextDate(event.start.date)
    return event.start.date <= date && date < end ? allDay : null
  }
  const start = Date.parse(event.start?.dateTime)
  const end = Date.parse(event.end?.dateTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= dayStart || start >= dayEnd) return null
  const minutes = (end - start) / 60000
  // A timed event longer than a day (a conference, a trip) blocks the whole day.
  if (minutes > 1440) return allDay
  const startAt = new Date(start).toISOString()
  const endAt = new Date(end).toISOString()
  return { kind: 'fixed', durationMinutes: minutes, fixedStartAt: startAt, fixedEndAt: endAt,
    earliestStartAt: null, latestEndAt: null, scheduledStartAt: startAt, scheduledEndAt: endAt }
}

/**
 * Normalise Google events into DayMap stops for one local day. Calendar
 * location text is never turned into a guessed pin: every imported stop starts
 * unlocated, with a question that quotes what the Calendar says.
 */
export function eventsToStops(events, { calendarId, date, dayStart, dayEnd }) {
  const stops = []
  const questions = []
  const seen = new Set()
  for (const event of events) {
    if (typeof event?.id !== 'string' || !event.id || seen.has(event.id)) continue
    if (event.status === 'cancelled') continue
    if (event.attendees?.some(attendee => attendee.self && attendee.responseStatus === 'declined')) continue
    const timing = timingFor(event, { date, dayStart, dayEnd })
    if (!timing) continue
    seen.add(event.id)
    const id = calendarStopId(calendarId, event.id)
    const summary = typeof event.summary === 'string' ? event.summary.trim() : ''
    const title = summary ? summary.slice(0, MAX_TITLE) : 'Calendar event'
    stops.push({ id, title, source: 'google-calendar', sourceEventId: event.id, sourceCalendarId: calendarId,
      location: null, timing, status: 'planned' })
    const where = typeof event.location === 'string' ? event.location.trim() : ''
    questions.push({
      id: `location:${id}`, stopId: id, field: 'location', status: 'unanswered',
      prompt: where
        ? `Confirm where "${quote(title)}" is. Calendar says: "${quote(where)}".`
        : isOnline(event)
          ? `"${quote(title)}" is an online meeting. Add a place only if you will attend somewhere in person.`
          : `Where is "${quote(title)}"?`,
    })
  }
  return { stops, questions }
}
