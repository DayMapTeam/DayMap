import { ApiError } from '../middleware/apiError.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500
function check(condition, message) {
  if (!condition) throw new ApiError(400, 'INVALID_PLAN', message)
}
function keys(value, allowed) {
  check(object(value) && Object.keys(value).every(key => allowed.includes(key)), 'Unexpected or invalid fields.')
}

export function validateDay(date, timezone) {
  check(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date, 'Use a valid YYYY-MM-DD date.')
  check(typeof timezone === 'string' && timezone.length <= 100 && !/^[+-]/.test(timezone), 'Use an IANA timezone.')
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format() } catch {
    check(false, 'Use an IANA timezone.')
  }
}

export function validateSave(id, body) {
  check(uuid.test(id), 'Plan ID must be a UUID.')
  keys(body, ['baseVersion', 'plan'])
  const { baseVersion, plan } = body
  check(Number.isInteger(baseVersion) && baseVersion >= 0 && baseVersion < 2147483647, 'Invalid baseVersion.')
  keys(plan, ['id', 'date', 'timezone', 'version', 'dataMode', 'stops', 'legs', 'conflicts', 'questions', 'startPlace', 'endPlace', 'removedEvents'])
  check(plan.id === id && plan.version === baseVersion, 'Plan ID and version must match the request.')
  validateDay(plan.date, plan.timezone)
  check(['demo', 'live'].includes(plan.dataMode), 'Invalid dataMode.')
  for (const field of ['stops', 'legs', 'conflicts', 'questions']) {
    check(Array.isArray(plan[field]) && plan[field].length <= 200, `Invalid ${field}.`)
  }
  // DM-07 will define provider retention and journey validation before persisting routes.
  check(plan.legs.length === 0, 'Journey persistence is not enabled yet; omit provider route data.')
  // Where the day starts and ends (home, a hotel): a place without times, or absent/null.
  for (const field of ['startPlace', 'endPlace']) {
    const place = plan[field]
    if (place === undefined || place === null) continue
    keys(place, ['label', 'placeId', 'lat', 'lng'])
    check(text(place.label) && place.placeId === null && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90
      && Number.isFinite(place.lng) && Math.abs(place.lng) <= 180, `Invalid ${field}.`)
  }
  // Calendar events the person removed, so re-import leaves them out: absent, or up to 500.
  if (plan.removedEvents !== undefined) {
    check(Array.isArray(plan.removedEvents) && plan.removedEvents.length <= 500, 'Invalid removedEvents.')
    for (const event of plan.removedEvents) {
      keys(event, ['sourceCalendarId', 'sourceEventId', 'title'])
      check(text(event.sourceCalendarId) && text(event.sourceEventId) && text(event.title), 'Invalid removed event.')
    }
  }
  const ids = new Set()
  for (const stop of plan.stops) {
    keys(stop, ['id', 'title', 'source', 'sourceEventId', 'sourceCalendarId', 'location', 'timing', 'status', 'travelMode', 'localEdits'])
    // How the person chose to travel to this stop; absent or null means automatic.
    check(stop.travelMode === undefined || stop.travelMode === null || ['walk', 'transit', 'drive'].includes(stop.travelMode),
      'Invalid travelMode.')
    check(text(stop.id) && (plan.dataMode === 'demo' || uuid.test(stop.id)) && !ids.has(stop.id), 'Stop IDs must be unique; live IDs must be UUIDs.')
    ids.add(stop.id)
    check(text(stop.title) && ['manual', 'google-calendar'].includes(stop.source)
      && ['planned', 'completed', 'skipped'].includes(stop.status), 'Invalid stop.')
    for (const field of ['sourceEventId', 'sourceCalendarId']) {
      check(stop[field] === null || text(stop[field]), `Invalid ${field}.`)
    }
    check(stop.source !== 'google-calendar' || (text(stop.sourceEventId) && text(stop.sourceCalendarId)), 'Calendar stops need source identifiers.')
    // What the person changed on a Calendar event, kept on re-import: absent, or distinct 'title' / 'time'.
    check(stop.localEdits === undefined || (stop.source === 'google-calendar' && Array.isArray(stop.localEdits)
      && stop.localEdits.length > 0 && stop.localEdits.every(field => ['title', 'time'].includes(field))
      && new Set(stop.localEdits).size === stop.localEdits.length), 'Invalid localEdits.')
    if (stop.location !== null) {
      keys(stop.location, ['label', 'placeId', 'lat', 'lng'])
      const { label, placeId, lat, lng } = stop.location
      check(text(label) && (placeId === null || text(placeId))
        && Number.isFinite(lat) && Math.abs(lat) <= 90
        && Number.isFinite(lng) && Math.abs(lng) <= 180, 'Invalid location.')
      check(placeId === null, 'Place-provider persistence awaits the retention decision.')
    }
    const timing = stop.timing
    const times = ['fixedStartAt', 'fixedEndAt', 'earliestStartAt', 'latestEndAt', 'scheduledStartAt', 'scheduledEndAt']
    keys(timing, ['kind', 'durationMinutes', ...times])
    check(['fixed', 'flexible', 'all-day'].includes(timing.kind), 'Invalid timing kind.')
    check((timing.kind === 'all-day' && timing.durationMinutes === null)
      || (Number.isFinite(timing.durationMinutes) && timing.durationMinutes > 0 && timing.durationMinutes <= 1440), 'Invalid visit duration in minutes.')
    for (const field of times) {
      const value = timing[field]
      check(value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)
        && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z')), 'Times must be valid UTC timestamps or null.')
    }
    for (const [start, end] of [['fixedStartAt', 'fixedEndAt'], ['scheduledStartAt', 'scheduledEndAt']]) {
      check((timing[start] === null && timing[end] === null)
        || (timing[start] !== null && timing[end] !== null && Date.parse(timing[start]) < Date.parse(timing[end])), 'Invalid time range.')
    }
    if (timing.kind === 'fixed') {
      check(timing.fixedStartAt !== null && timing.fixedEndAt !== null, 'Fixed commitments need start and end times.')
      check(timing.scheduledStartAt === null || (timing.scheduledStartAt === timing.fixedStartAt && timing.scheduledEndAt === timing.fixedEndAt), 'Fixed commitments cannot be rescheduled.')
    } else {
      check(timing.fixedStartAt === null && timing.fixedEndAt === null, 'Only fixed stops have fixed timestamps.')
    }
    if (timing.kind === 'all-day') {
      check(times.every(field => timing[field] === null), 'All-day stops cannot have invented arrival times.')
    }
  }
  // These are user-visible annotations, never provider payloads or credentials.
  for (const question of plan.questions) {
    keys(question, ['id', 'stopId', 'field', 'prompt', 'status'])
    check(ids.has(question.stopId) && text(question.field) && text(question.prompt)
      && ['unanswered', 'deferred', 'answered'].includes(question.status), 'Invalid planner question.')
  }
  for (const conflict of plan.conflicts) {
    keys(conflict, ['id', 'stopIds', 'code', 'message'])
    check(text(conflict.id) && Array.isArray(conflict.stopIds) && conflict.stopIds.every(id => ids.has(id))
      && text(conflict.code) && text(conflict.message), 'Invalid conflict.')
  }
  for (const stop of plan.stops) {
    check(stop.location !== null || plan.questions.some(q => q.stopId === stop.id && q.field === 'location'), 'Unlocated stops need a location question.')
  }
  return { baseVersion, plan }
}
