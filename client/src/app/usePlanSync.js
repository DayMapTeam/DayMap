import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNow } from '../components/useNow.js'
import { api } from '../services/supabase.js'
import { usePlan } from './planContext.js'
import {
  browserTimezone, carryOverPlaces, createPlanSaver, emptyLivePlan, localDate, previousDate, sessionStore,
} from './planPersistence.js'
import { isDemoRequested, localPlanId, readLocalPlan, writeLocalPlan } from './localPlan.js'

const noSubscription = () => () => {}

/**
 * Keeps the accepted plan in the database while someone is signed in, and the
 * local day (or explicitly requested demo) in this browser session while they are not. Drafts are never
 * saved; only the accepted plan is.
 *
 * Returns `{ state, error, day, retry, loadLatest, keepMine, adopt }` where state is
 * 'local' | 'demo' | 'loading' | 'load-error' | 'saved' | 'saving' | 'error' | 'conflict'.
 *
 * At midnight the next day is loaded (after any trip in progress, `hold`).
 * A new day starts where the day before ended.
 *
 * @param {string | null} userId The signed-in DayMap user, or null.
 * @param {{ hold?: boolean }} [options] While true, stay on the current day.
 */
export function usePlanSync(userId, { hold = false } = {}) {
  const { plan, loadPlan } = usePlan()
  const timezone = browserTimezone()
  const today = localDate(useNow(), timezone)
  const [planDay, setPlanDay] = useState(today)
  if (!hold && planDay !== today) setPlanDay(today)
  const planRef = useRef(plan)
  useEffect(() => {
    planRef.current = plan
  })
  // { userId, saver, planId, date, timezone } once loaded, or { userId, error }.
  const [loaded, setLoaded] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) {
      // Restore only this tab's own day on sign-out, never an account's data.
      const current = planRef.current
      const demo = isDemoRequested()
      if (demo ? current.dataMode !== 'demo' : current.id !== localPlanId(planDay, timezone)) {
        loadPlan(readLocalPlan(sessionStore(), { demo, date: planDay, timezone }))
      }
      return undefined
    }
    const controller = new AbortController()
    const date = planDay
    let saver = null
    const load = async () => {
      const saved = await api.getDayPlan(date, timezone, { signal: controller.signal })
      if (saved) return { saved, initial: saved }
      // Nothing saved yet: start where yesterday ended.
      const yesterday = await api.getDayPlan(previousDate(date), timezone, { signal: controller.signal }).catch((error) => {
        if (error?.name === 'AbortError') throw error
        return null
      })
      return { saved: null, initial: { ...emptyLivePlan({ id: crypto.randomUUID(), date, timezone }), ...carryOverPlaces(yesterday) } }
    }
    load().then(({ saved, initial }) => {
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
  }, [userId, attempt, loadPlan, planDay, timezone])

  const saver = loaded?.userId === userId ? loaded.saver ?? null : null
  const subscribe = useCallback((listener) => saver?.subscribe(listener) ?? noSubscription(), [saver])
  const saverStatus = useSyncExternalStore(subscribe, () => saver?.getStatus() ?? null)

  useEffect(() => {
    if (saver && plan.id === loaded.planId) saver.sync(plan)
    else if (!userId) writeLocalPlan(sessionStore(), plan)
  }, [plan, saver, loaded, userId])

  // Coming back online retries a failed save.
  useEffect(() => {
    if (!saver) return undefined
    const retry = () => saver.retry()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [saver])

  let status
  if (!userId) status = { state: plan.dataMode === 'demo' ? 'demo' : 'local', error: null }
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

  /**
   * Replace the local day with a plan the server has already saved (for
   * example a Calendar import), but only if the day is still exactly
   * `basePlan` and fully saved. Otherwise nothing changes and it returns false,
   * so a local edit is never lost; the next save then reports the conflict.
   */
  const adopt = useCallback((serverPlan, basePlan) => {
    if (!saver || planRef.current !== basePlan || saver.getStatus().state !== 'saved') return false
    loadPlan(serverPlan)
    setLoaded((current) => (current?.saver === saver ? { ...current, planId: serverPlan.id } : current))
    saver.reset({ plan: serverPlan, version: serverPlan.version, dirty: false })
    return true
  }, [saver, loadPlan])

  const day = saver ? { date: loaded.date, timezone: loaded.timezone } : null
  return { ...status, day, retry, loadLatest, keepMine, adopt }
}
