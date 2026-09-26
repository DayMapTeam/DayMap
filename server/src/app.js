import express from 'express'
import cors from 'cors'
import healthRouter from './routes/health.js'
import demoPlanRouter from './routes/demoPlan.js'
import { notFound, errorHandler } from './middleware/errors.js'
import { createSupabase } from './repositories/supabase.js'
import { plansRouter } from './routes/plans.js'
import { calendarRouter } from './routes/calendar.js'
import { createCalendarService } from './calendar/service.js'

// Importing the app opens no port; tests can inject an isolated data service.
export function createApp({ clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  supabase = createSupabase(), calendar = createCalendarService() } = {}) {
  const origin = new URL(clientOrigin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== clientOrigin) {
    throw new Error('CLIENT_ORIGIN must be one exact HTTP(S) origin without a path or trailing slash')
  }
  const app = express()
  app.locals.calendar = calendar
  app.use(cors({ origin: [clientOrigin] }))
  app.use(express.json())
  app.use('/api/health', healthRouter)
  app.use('/api/demo-plan', demoPlanRouter)
  app.use('/api/plans', plansRouter(supabase))
  app.use('/api/calendar', calendarRouter({ supabase, calendar, clientOrigin }))
  app.use(notFound)
  app.use(errorHandler)
  return app
}

export default createApp()
