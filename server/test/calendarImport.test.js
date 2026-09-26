import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { mergeCalendarImport } from '../src/calendar/importPlan.js'
import { calendarStopId, eventsToStops, listCalendarEvents } from '../src/integrations/googleCalendar.js'
import { ApiError } from '../src/middleware/apiError.js'
import { createSupabase } from '../src/repositories/supabase.js'
import { validateSave } from '../src/routes/validatePlan.js'
import { planDayBounds } from '../../shared/planning/dayBounds.js'

const date = '2026-09-28'
const timezone = 'Australia/Adelaide'
const { start: dayStart, end: dayEnd } = planDayBounds(date, timezone)
const day = { calendarId: 'primary', date, dayStart, dayEnd }
const planId = '11111111-1111-4111-8111-111111111111'
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

// 09:00–10:00 and 12:30–13:15 in Adelaide (UTC+09:30 in late September).
const lecture = { id: 'lecture', status: 'confirmed', summary: 'Lecture', location: 'Napier 102, North Tce',
  start: { dateTime: '2026-09-28T09:00:00+09:30' }, end: { dateTime: '2026-09-28T10:00:00+09:30' } }
const standup = { id: 'standup_20260928', status: 'confirmed', summary: 'Team standup', hangoutLink: 'https://meet.google.com/x',
  start: { dateTime: '2026-09-28T12:30:00+09:30' }, end: { dateTime: '2026-09-28T13:15:00+09:30' } }
const holiday = { id: 'holiday', summary: 'Conference', start: { date: '2026-09-27' }, end: { date: '2026-09-30' } }

function planWith(imported, existing = null) {
  return mergeCalendarImport(existing, imported, { planId, date, timezone })
}

test('timed events become fixed stops with original UTC times and a location question', () => {
  const { stops, questions } = eventsToStops([lecture, standup], day)
  assert.equal(stops.length, 2)
  assert.deepEqual(stops[0].timing, { kind: 'fixed', durationMinutes: 60,
    fixedStartAt: '2026-09-27T23:30:00.000Z', fixedEndAt: '2026-09-28T00:30:00.000Z',
    earliestStartAt: null, latestEndAt: null,
    scheduledStartAt: '2026-09-27T23:30:00.000Z', scheduledEndAt: '2026-09-28T00:30:00.000Z' })
  assert.equal(stops[0].location, null, 'Calendar text is never guessed into a pin')
  assert.equal(stops[0].source, 'google-calendar')
  assert.equal(stops[0].sourceEventId, 'lecture')
  assert.match(questions[0].prompt, /Calendar says: "Napier 102, North Tce"/)
  assert.match(questions[1].prompt, /online meeting/)
  assert.ok(questions.every(question => question.field === 'location' && question.status === 'unanswered'))
})

test('skips cancelled, declined, other-day and invalid events; keeps all-day without invented times', () => {
  const events = [
    { ...lecture, id: 'cancelled', status: 'cancelled' },
    { ...lecture, id: 'declined', attendees: [{ self: true, responseStatus: 'declined' }] },
    { ...lecture, id: 'accepted', attendees: [{ self: true, responseStatus: 'accepted' }, { responseStatus: 'declined' }] },
    { id: 'yesterday', summary: 'Yesterday', start: { date: '2026-09-27' }, end: { date: '2026-09-28' } },
    { id: 'backwards', start: { dateTime: '2026-09-28T10:00:00+09:30' }, end: { dateTime: '2026-09-28T09:00:00+09:30' } },
    { id: 'multi-day', summary: 'Retreat', start: { dateTime: '2026-09-27T09:00:00+09:30' }, end: { dateTime: '2026-09-29T17:00:00+09:30' } },
    holiday,
    lecture, // duplicate of nothing yet
    { ...lecture }, // same ID twice in a response
    { id: 'untitled', start: { dateTime: '2026-09-28T15:00:00+09:30' }, end: { dateTime: '2026-09-28T15:30:00+09:30' } },
  ]
  const { stops } = eventsToStops(events, day)
  assert.deepEqual(stops.map(stop => stop.sourceEventId), ['accepted', 'multi-day', 'holiday', 'lecture', 'untitled'])
  const allDay = stops.filter(stop => stop.timing.kind === 'all-day')
  assert.deepEqual(allDay.map(stop => stop.sourceEventId), ['multi-day', 'holiday'])
  for (const stop of allDay) {
    assert.ok(Object.entries(stop.timing).every(([key, value]) => key === 'kind' || value === null))
  }
  assert.equal(stops.at(-1).title, 'Calendar event')
})

test('stop IDs are stable UUIDs that pass live-plan validation', () => {
  assert.equal(calendarStopId('primary', 'lecture'), calendarStopId('primary', 'lecture'))
  assert.notEqual(calendarStopId('primary', 'lecture'), calendarStopId('primary', 'lecture2'))
  const { plan } = planWith(eventsToStops([lecture, standup, holiday], day))
  assert.doesNotThrow(() => validateSave(planId, { baseVersion: 0, plan }))
})

test('day boundaries follow daylight saving (Adelaide 4 October 2026 has 23 hours)', () => {
  const { start, end } = planDayBounds('2026-10-04', timezone)
  assert.equal(end - start, 23 * 3600000)
  assert.equal(new Date(start).toISOString(), '2026-10-03T14:30:00.000Z')
})

test('listCalendarEvents expands recurrences, follows pages, and keeps the token in the header', async () => {
  const requests = []
  const pages = { '': { items: [lecture], nextPageToken: 'p2' }, p2: { items: [standup], nextPageToken: 'p3' }, p3: { items: [holiday] } }
  const events = await listCalendarEvents({ accessToken: 'access', timeMin: dayStart, timeMax: dayEnd,
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return Response.json(pages[url.searchParams.get('pageToken') ?? ''])
    } })
  assert.deepEqual(events.map(event => event.id), ['lecture', 'standup_20260928', 'holiday'])
  assert.equal(requests.length, 3)
  const first = requests[0].url
  assert.equal(first.pathname, '/calendar/v3/calendars/primary/events')
  assert.equal(first.searchParams.get('singleEvents'), 'true')
  assert.equal(first.searchParams.get('timeMin'), '2026-09-27T14:30:00.000Z')
  assert.equal(first.searchParams.get('timeMax'), '2026-09-28T14:30:00.000Z')
  assert.ok(![...first.searchParams.values()].includes('access'))
  assert.equal(requests[0].options.headers.Authorization, 'Bearer access')
})

test('listCalendarEvents maps Google failures to the shared error shape', async () => {
  const call = response => listCalendarEvents({ accessToken: 'a', timeMin: dayStart, timeMax: dayEnd,
    fetchImpl: async () => { if (response instanceof Error) throw response; return response } })
  await assert.rejects(call(new Response('', { status: 401 })), { status: 409, code: 'CALENDAR_RECONNECT_REQUIRED' })
  await assert.rejects(call(new Response('', { status: 429 })), { status: 503, retryable: true })
  await assert.rejects(call(new Response('', { status: 500 })), { status: 503, code: 'GOOGLE_UNAVAILABLE' })
  await assert.rejects(call(new Error('socket')), { status: 503, code: 'GOOGLE_UNAVAILABLE' })
  await assert.rejects(call(Response.json({ nope: true })), { status: 502, code: 'GOOGLE_CALENDAR_FAILED' })
})

test('re-import is idempotent and never duplicates stops', () => {
  const first = planWith(eventsToStops([lecture, standup], day))
  const saved = { ...first.plan, version: 1 }
  const again = planWith(eventsToStops([lecture, standup], day), saved)
  assert.equal(again.changed, false)
  assert.deepEqual(again.summary, { added: 0, updated: 0, removed: 0 })
  assert.equal(again.plan.stops.length, 2)
})

test('moved events update in place; deleted events go unless completed; manual stops stay', () => {
  const first = planWith(eventsToStops([lecture, standup, holiday], day)).plan
  const manual = { id: '22222222-2222-4222-8222-222222222222', title: 'Coffee', source: 'manual',
    sourceEventId: null, sourceCalendarId: null,
    location: { label: 'Café', placeId: null, lat: -34.92, lng: 138.6 },
    timing: { kind: 'flexible', durationMinutes: 30, fixedStartAt: null, fixedEndAt: null, earliestStartAt: null,
      latestEndAt: null, scheduledStartAt: '2026-09-28T01:00:00Z', scheduledEndAt: '2026-09-28T01:30:00Z' },
    status: 'planned' }
  const lectureId = calendarStopId('primary', 'lecture')
  const holidayId = calendarStopId('primary', 'holiday')
  const confirmed = { label: 'Napier Building', placeId: null, lat: -34.9199, lng: 138.6043 }
  const saved = {
    ...first, version: 3,
    stops: [...first.stops.map(stop => stop.id === lectureId ? { ...stop, location: confirmed }
      : stop.id === holidayId ? { ...stop, status: 'completed' } : stop), manual],
    // The lecture's location was answered; the standup's question was deferred.
    questions: first.questions.filter(q => q.stopId !== lectureId)
      .map(q => q.stopId === calendarStopId('primary', 'standup_20260928') ? { ...q, status: 'deferred' } : q),
    conflicts: [{ id: 'c1', stopIds: [calendarStopId('primary', 'standup_20260928'), manual.id], code: 'overlap', message: 'Overlap' }],
  }
  const moved = { ...lecture, start: { dateTime: '2026-09-28T11:00:00+09:30' }, end: { dateTime: '2026-09-28T12:00:00+09:30' } }
  const { plan, summary, changed } = planWith(eventsToStops([moved], day), saved)

  assert.equal(changed, true)
  assert.deepEqual(summary, { added: 0, updated: 1, removed: 1 })
  assert.equal(plan.version, 3, 'the caller saves against the loaded version')
  assert.deepEqual(plan.stops.map(stop => stop.id), [lectureId, holidayId, manual.id])
  const updated = plan.stops[0]
  assert.equal(updated.timing.fixedStartAt, '2026-09-28T01:30:00.000Z')
  assert.deepEqual(updated.location, confirmed, 'a confirmed location survives re-import')
  assert.equal(plan.stops[1].status, 'completed', 'completed history is never erased')
  assert.deepEqual(plan.stops[2], manual)
  assert.deepEqual(plan.conflicts, [], 'conflicts that mention removed stops are dropped')
  assert.ok(plan.questions.every(q => plan.stops.some(stop => stop.id === q.stopId)))
  assert.doesNotThrow(() => validateSave(plan.id, { baseVersion: plan.version, plan }))
})

test('a deferred location question stays deferred after re-import', () => {
  const first = planWith(eventsToStops([standup], day)).plan
  const saved = { ...first, version: 1, questions: first.questions.map(q => ({ ...q, status: 'deferred' })) }
  const renamed = { ...standup, summary: 'Daily standup' }
  const { plan } = planWith(eventsToStops([renamed], day), saved)
  assert.equal(plan.questions.length, 1)
  assert.equal(plan.questions[0].status, 'deferred')
  assert.match(plan.questions[0].prompt, /Daily standup/)
})

async function server(t, { events = [lecture, standup], calendar: override } = {}) {
  const rows = new Map()
  const supabase = createSupabase({ url: 'https://test.supabase.co', key: 'sb_publishable_test',
    fetchImpl: async (url, options) => {
      const parsed = new URL(url)
      if (options.headers.Authorization !== 'Bearer alice') return Response.json({}, { status: 401 })
      if (parsed.pathname === '/auth/v1/user') return Response.json({ id: alice, role: 'authenticated' })
      const body = options.body && JSON.parse(options.body)
      if (options.method === 'POST') {
        rows.set(body.id, body)
        return Response.json([body])
      }
      const matched = [...rows.values()].filter(row => ['id', 'date', 'timezone', 'version']
        .every(key => !parsed.searchParams.has(key) || parsed.searchParams.get(key) === `eq.${row[key]}`))
      if (options.method === 'PATCH') {
        for (const row of matched) rows.set(row.id, body)
        return Response.json(matched.length ? [body] : [])
      }
      return Response.json(matched)
    } })
  const ranges = []
  const calendar = override === undefined ? {
    async listDayEvents(userId, range) {
      assert.equal(userId, alice)
      ranges.push(range)
      return typeof events === 'function' ? events() : events
    },
  } : override
  const app = createApp({ supabase, calendar }).listen(0, '127.0.0.1')
  await once(app, 'listening')
  t.after(() => new Promise(resolve => app.close(resolve)))
  const post = (body, token = 'alice') => fetch(`http://127.0.0.1:${app.address().port}/api/calendar/import`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  return { post, rows, ranges }
}

test('POST /api/calendar/import creates, then re-imports without a new version', async t => {
  const { post, rows, ranges } = await server(t)
  assert.equal((await post({ date, timezone }, null)).status, 401)
  const created = await post({ date, timezone })
  assert.equal(created.status, 201)
  const first = await created.json()
  assert.deepEqual(first.summary, { added: 2, updated: 0, removed: 0 })
  assert.equal(first.plan.version, 1)
  assert.equal(first.plan.dataMode, 'live')
  assert.equal(rows.size, 1)
  assert.deepEqual(ranges[0], { timeMin: dayStart, timeMax: dayEnd })

  const again = await post({ date, timezone })
  assert.equal(again.status, 200)
  const second = await again.json()
  assert.equal(second.plan.version, 1, 'an unchanged import does not bump the version')
  assert.equal(second.plan.stops.length, 2)
})

test('import updates the saved plan through the versioned save', async t => {
  let events = [lecture, standup]
  const { post, rows } = await server(t, { events: () => events })
  await post({ date, timezone })
  events = [lecture]
  const response = await post({ date, timezone })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.summary, { added: 0, updated: 0, removed: 1 })
  assert.equal(body.plan.version, 2)
  assert.equal([...rows.values()][0].version, 2)
})

test('import validates input and keeps the saved plan when Google fails', async t => {
  let fail = false
  const { post, rows } = await server(t, { events: () => {
    if (fail) throw new ApiError(503, 'GOOGLE_UNAVAILABLE', 'Google Calendar is unavailable. Please try again.', true)
    return [lecture]
  } })
  assert.equal((await post({ date, timezone, userId: 'someone-else' })).status, 400)
  assert.equal((await post({ date: '2026-02-30', timezone })).status, 400)
  await post({ date, timezone })
  const before = structuredClone([...rows.values()][0])
  fail = true
  const failed = await post({ date, timezone })
  assert.equal(failed.status, 503)
  assert.equal((await failed.json()).error.retryable, true)
  assert.deepEqual([...rows.values()][0], before)
})

test('import is unavailable without a Calendar configuration', async t => {
  const { post } = await server(t, { calendar: null })
  const response = await post({ date, timezone })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'CALENDAR_NOT_CONFIGURED')
})
