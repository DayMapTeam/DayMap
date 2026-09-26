import express from 'express'
import cors from 'cors'
import healthRouter from './routes/health.js'
import demoPlanRouter from './routes/demoPlan.js'
import { notFound, errorHandler } from './middleware/errors.js'

// Configure middleware and mount route modules here; importing the app opens no port.
export function createApp({ clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' } = {}) {
  const origin = new URL(clientOrigin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== clientOrigin) {
    throw new Error('CLIENT_ORIGIN must be one exact HTTP(S) origin without a path or trailing slash')
  }
  const app = express()
  app.use(cors({ origin: [clientOrigin] }))
  app.use(express.json())
  app.use('/api/health', healthRouter)
  app.use('/api/demo-plan', demoPlanRouter)
  app.use(notFound)
  app.use(errorHandler)
  return app
}

const app = createApp()

export default app
