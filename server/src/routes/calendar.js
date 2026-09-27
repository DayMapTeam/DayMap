import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { planDayBounds } from '../../../shared/planning/dayBounds.js'
import { mergeCalendarImport } from '../calendar/importPlan.js'
import { eventsToStops } from '../integrations/googleCalendar.js'
import { ApiError } from '../middleware/apiError.js'
import { requireAuth } from '../middleware/auth.js'
import { planRepository } from '../repositories/plans.js'
import { validateDay, validateSave } from './validatePlan.js'

const CALENDAR_ID = 'primary'

const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500
// A removed Calendar event to bring back: exactly its calendar and event IDs.
const eventRef = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 2 && text(value.sourceCalendarId) && text(value.sourceEventId)

function validateImport(body) {
  const valid = body !== null && typeof body === 'object' && !Array.isArray(body)
    && Object.keys(body).every(key => ['date', 'timezone', 'restoreRemoved', 'restoreEvents'].includes(key))
    && (body.restoreRemoved === undefined || typeof body.restoreRemoved === 'boolean')
    && (body.restoreEvents === undefined
      || (Array.isArray(body.restoreEvents) && body.restoreEvents.length <= 500 && body.restoreEvents.every(eventRef)))
  if (!valid) throw new ApiError(400, 'INVALID_IMPORT', 'Send only a date, timezone, restoreRemoved and restoreEvents.')
  validateDay(body.date, body.timezone)
  return body
}

export function calendarRouter({ supabase, calendar, clientOrigin }) {
  const router = Router()
  const configured = () => {
    if (!calendar) throw new ApiError(503, 'CALENDAR_NOT_CONFIGURED', 'Calendar connection is not configured.')
    return calendar
  }
  router.post('/connect', requireAuth(supabase), async (req, res) => {
    const url = await configured().begin(req.auth.userId)
    res.json({ url })
  })
  router.get('/status', requireAuth(supabase), async (req, res) => {
    res.json(await configured().status(req.auth.userId))
  })
  router.post('/disconnect', requireAuth(supabase), async (req, res) => {
    res.json(await configured().disconnect(req.auth.userId))
  })
  // Read-only import of one local day from the primary calendar into the
  // signed-in user's saved plan. Nothing is written back to Google.
  // `restoreRemoved: true` brings back every event the person removed in
  // DayMap; `restoreEvents` ({ sourceCalendarId, sourceEventId }[]) brings back some.
  router.post('/import', requireAuth(supabase), async (req, res) => {
    const { date, timezone, restoreRemoved = false, restoreEvents = [] } = validateImport(req.body)
    const service = configured()
    const { start, end } = planDayBounds(date, timezone)
    const events = await service.listDayEvents(req.auth.userId, { timeMin: start, timeMax: end })
    const imported = eventsToStops(events, { calendarId: CALENDAR_ID, date, dayStart: start, dayEnd: end })
    const plans = planRepository(supabase, req.auth)
    const [existing = null] = await plans.list(date, timezone)
    const { plan, summary, changed } = mergeCalendarImport(existing, imported,
      { planId: randomUUID(), date, timezone, restoreRemoved, restoreEvents })
    if (!changed) return res.json({ plan: existing, summary })
    // The same rules as PUT /api/plans/:id; the versioned save rejects a concurrent change with 409.
    validateSave(plan.id, { baseVersion: plan.version, plan })
    const saved = await plans.save(plan.id, plan.version, plan)
    res.status(existing ? 200 : 201).json({ plan: saved, summary })
  })
  // Google sends the browser here. Every outcome returns to the app, which
  // explains it; the person never sees an error page on the API origin.
  router.get('/callback', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const target = new URL(clientOrigin)
    try {
      target.searchParams.set('calendar', await configured().callback(req.query))
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Calendar callback failed:', error?.code ?? '', error?.message)
      target.searchParams.set('calendar', 'error')
      target.searchParams.set('reason', error instanceof ApiError ? error.code : 'CALENDAR_CONNECTION_FAILED')
    }
    res.redirect(303, target.toString())
  })
  return router
}
