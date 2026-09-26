import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { api } from '../services/supabase.js'
import { usePlan } from './planContext.js'
import {
  browserTimezone, createPlanSaver, emptyLivePlan, localDate, readDemoPlan, sessionStore, writeDemoPlan,
} from './planPersistence.js'

const noSubscription = () => () => {}

/**
 * Keeps the accepted plan in the database while someone is signed in, and the
 * demo day in this browser session while they are not. Drafts are never
 * saved; only the accepted plan is.
 *
 * Returns `{ state, error, retry, loadLatest, keepMine }` where state is
 * 'demo' | 'loading' | 'load-error' | 'saved' | 'saving' | 'error' | 'conflict'.
 *
 * @param {string | null} userId The signed-in DayMap user, or null.
 */
export function usePlanSync(userId) {
  const { plan, loadPlan } = usePlan()
  const planRef = useRef(plan)
  useEffect(() => {
    planRef.current = plan
  })
  // { userId, saver, planId, date, timezone } once loaded, or { userId, error }.
  const [loaded, setLoaded] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) {
      // Signed out (or the session expired): back to the demo day.
      if (planRef.current.dataMode === 'live') loadPlan(readDemoPlan(sessionStore(), demoPlan))
      return undefined
    }
    const controller = new AbortController()
    const timezone = browserTimezone()
    const date = localDate(new Date(), timezone)
    let saver = null
    api.getDayPlan(date, timezone, { signal: controller.signal }).then((saved) => {
      const initial = saved ?? emptyLivePlan({ id: crypto.randomUUID(), date, timezone })
      saver = createPlanSaver({ save: (next, version) => api.savePlan(next, version), plan: initial, version: saved?.version ?? 0 })
      loadPlan(initial)
      setLoaded({ userId, saver, planId: initial.id, date, timezone })
    }, (error) => {
      if (error?.name !== 'AbortError') setLoaded({ userId, error })
    })
    return () => {
      controller.abort()
      saver?.dispose()
      setLoaded(null)
    }
  }, [userId, attempt, loadPlan])

  const saver = loaded?.userId === userId ? loaded.saver ?? null : null
  const subscribe = useCallback((listener) => saver?.subscribe(listener) ?? noSubscription(), [saver])
  const saverStatus = useSyncExternalStore(subscribe, () => saver?.getStatus() ?? null)

  useEffect(() => {
    if (saver && plan.id === loaded.planId) saver.sync(plan)
    else if (!userId && plan.dataMode === 'demo') writeDemoPlan(sessionStore(), plan)
  }, [plan, saver, loaded, userId])

  // Coming back online retries a failed save.
  useEffect(() => {
    if (!saver) return undefined
    const retry = () => saver.retry()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [saver])

  let status
  if (!userId) status = { state: 'demo', error: null }
  else if (loaded?.userId !== userId) status = { state: 'loading', error: null }
  else if (loaded.error) status = { state: 'load-error', error: loaded.error }
  else status = saverStatus

  // Warn before closing the tab while a change is not yet saved.
  const unsaved = status.state === 'saving' || status.state === 'error'
  useEffect(() => {
    if (!unsaved) return undefined
    const warn = (event) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const retry = useCallback(() => {
    if (saver) saver.retry()
    else setAttempt((count) => count + 1)
  }, [saver])

  // After a conflict, reload the server's copy, or keep this one and save it over the server's.
  const resolve = useCallback(async (keepMine) => {
    if (!saver) return
    const latest = await api.getDayPlan(loaded.date, loaded.timezone)
    if (keepMine || latest === null) {
      const mine = { ...planRef.current, id: latest?.id ?? planRef.current.id }
      if (mine.id !== planRef.current.id) loadPlan(mine)
      setLoaded((current) => (current?.saver === saver ? { ...current, planId: mine.id } : current))
      saver.reset({ plan: mine, version: latest?.version ?? 0, dirty: true })
      return
    }
    loadPlan(latest)
    setLoaded((current) => (current?.saver === saver ? { ...current, planId: latest.id } : current))
    saver.reset({ plan: latest, version: latest.version, dirty: false })
  }, [saver, loaded, loadPlan])
  const loadLatest = useCallback(() => resolve(false), [resolve])
  const keepMine = useCallback(() => resolve(true), [resolve])

  return { ...status, retry, loadLatest, keepMine }
}
