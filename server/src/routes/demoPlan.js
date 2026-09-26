import { Router } from 'express'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'

const router = Router()
router.get('/', (req, res) => {
  res.json(demoPlan)
})

export default router
