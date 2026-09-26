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

function validateImport(body) {
  const valid = body !== null && typeof body === 'object' && !Array.isArray(body)
    && Object.keys(body).every(key => ['date', 'timezone'].includes(key))
  if (!valid) throw new ApiError(400, 'INVALID_IMPORT', 'Send only a date and timezone.')
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
  router.post('/import', requireAuth(supabase), async (req, res) => {
    const { date, timezone } = validateImport(req.body)
    const service = configured()
    const { start, end } = planDayBounds(date, timezone)
    const events = await service.listDayEvents(req.auth.userId, { timeMin: start, timeMax: end })
    const imported = eventsToStops(events, { calendarId: CALENDAR_ID, date, dayStart: start, dayEnd: end })
    const plans = planRepository(supabase, req.auth)
    const [existing = null] = await plans.list(date, timezone)
    const { plan, summary, changed } = mergeCalendarImport(existing, imported, { planId: randomUUID(), date, timezone })
    if (!changed) return res.json({ plan: existing, summary })
    // The same rules as PUT /api/plans/:id; the versioned save rejects a concurrent change with 409.
    validateSave(plan.id, { baseVersion: plan.version, plan })
    const saved = await plans.save(plan.id, plan.version, plan)
    res.status(existing ? 200 : 201).json({ plan: saved, summary })
  })
  router.get('/callback', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const outcome = await configured().callback(req.query)
    const target = new URL(clientOrigin)
    target.searchParams.set('calendar', outcome)
    res.redirect(303, target.toString())
  })
  return router
}
