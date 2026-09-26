import { useMemo } from 'react'
import { useNow } from './useNow.js'
import { zonedTimeToDate } from './zonedTime.js'

// Demo mode shows a fixed morning on the plan date, so past and upcoming
// stops look the same whenever the demo runs.
const DEMO_LOCAL_TIME = '09:50'

/**
 * The time the planner treats as "now".
 *
 * @param {{ date: string, timezone: string, dataMode: 'demo' | 'live' }} plan
 * @returns {{ now: Date, isDemoTime: boolean }}
 */
export function usePlanClock(plan) {
  const liveNow = useNow()
  const demoNow = useMemo(
    () => zonedTimeToDate(plan.date, DEMO_LOCAL_TIME, plan.timezone),
    [plan.date, plan.timezone],
  )
  return plan.dataMode === 'demo'
    ? { now: demoNow, isDemoTime: true }
    : { now: liveNow, isDemoTime: false }
}
