import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { planRepository } from '../repositories/plans.js'
import { validateDay, validateSave } from './validatePlan.js'

export function plansRouter(supabase) {
  const router = Router()
  router.use(requireAuth(supabase))
  router.get('/', async (req, res) => {
    const { date, timezone } = req.query
    validateDay(date, timezone)
    const plans = await planRepository(supabase, req.auth).list(date, timezone)
    res.json({ plans })
  })
  router.put('/:id', async (req, res) => {
    const { baseVersion, plan } = validateSave(req.params.id, req.body)
    const saved = await planRepository(supabase, req.auth).save(req.params.id, baseVersion, plan)
    res.status(baseVersion === 0 ? 201 : 200).json(saved)
  })
  return router
}
