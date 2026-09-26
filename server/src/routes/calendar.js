import { Router } from 'express'
import { ApiError } from '../middleware/apiError.js'
import { requireAuth } from '../middleware/auth.js'

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
  router.get('/callback', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const outcome = await configured().callback(req.query)
    const target = new URL(clientOrigin)
    target.searchParams.set('calendar', outcome)
    res.redirect(303, target.toString())
  })
  return router
}
