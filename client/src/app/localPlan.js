import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { browserTimezone, emptyLivePlan, localDate, readDemoPlan, toSavedPlan, writeDemoPlan } from './planPersistence.js'

const LOCAL_KEY = 'daymap:local-plan'

export function isDemoRequested(search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).get('demo') === '1'
}

export function localPlanId(date, timezone) {
  return `local:${date}:${timezone}`
}

/** Demo data is opt-in. A normal signed-out visit starts with today's empty plan. */
export function readLocalPlan(storage, { demo = isDemoRequested(), timezone = browserTimezone(), date = localDate(new Date(), timezone) } = {}) {
  if (demo) return readDemoPlan(storage, demoPlan)
  const id = localPlanId(date, timezone)
  try {
    const plan = JSON.parse(storage?.getItem(LOCAL_KEY) ?? 'null')
    if (plan?.id === id && plan.dataMode === 'live' && plan.date === date && plan.timezone === timezone && Array.isArray(plan.stops)) return plan
  } catch {
    // Blocked or invalid storage still leaves a usable empty day.
  }
  return emptyLivePlan({ id, date, timezone })
}

/** Never copy a signed-in account's plan into the signed-out session. */
export function writeLocalPlan(storage, plan) {
  if (plan.dataMode === 'demo') return writeDemoPlan(storage, plan)
  if (plan.id !== localPlanId(plan.date, plan.timezone)) return
  try {
    storage?.setItem(LOCAL_KEY, JSON.stringify(toSavedPlan(plan)))
  } catch {
    // Session storage is optional; changes remain available in memory.
  }
}
