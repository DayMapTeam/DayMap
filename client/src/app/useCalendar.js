import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/supabase.js'
import {
  calendarErrorMessage, calendarReturnMessage, importSummaryMessage, readCalendarReturn, withoutCalendarReturn,
} from './calendarMessages.js'

const NOTICE_MS = 6000

/**
 * Google Calendar for the signed-in user: connection status, connect and
 * disconnect, and importing the loaded day. When Calendar is connected, each
 * day is imported once automatically after it loads, so opening DayMap in the
 * morning shows the day's events. Import runs only when every local change is
 * saved and no draft is pending, and it never replaces a change made while it
 * was running.
 *
 * @param {object} options
 * @param {string | null} options.userId
 * @param {ReturnType<import('./usePlanSync.js').usePlanSync>} options.sync
 * @param {object} options.plan The accepted plan.
 * @param {object | null} options.draft
 */
export function useCalendar({ userId, sync, plan, draft }) {
  // { userId, state: 'connected' | 'disconnected' | 'not-configured' | 'error' }
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(null) // 'connect' | 'import' | 'disconnect' | null
  const [returned] = useState(() => readCalendarReturn(window.location.search))
  const [notice, setNotice] = useState(() => (returned ? calendarReturnMessage(returned) : null))
  const planRef = useRef(plan)
  const autoImportedRef = useRef(null)
  useEffect(() => {
    planRef.current = plan
  })

  // Google sends the person back with ?calendar=…; keep the message, drop the parameters.
  useEffect(() => {
    if (returned) window.history.replaceState(window.history.state, '', withoutCalendarReturn(window.location.href))
  }, [returned])

  useEffect(() => {
    if (!userId) return undefined
    const controller = new AbortController()
    api.calendarStatus({ signal: controller.signal }).then(
      ({ connected }) => setStatus({ userId, state: connected ? 'connected' : 'disconnected' }),
      (error) => {
        if (error?.name === 'AbortError') return
        setStatus({ userId, state: error?.code === 'CALENDAR_NOT_CONFIGURED' ? 'not-configured' : 'error' })
      },
    )
    return () => controller.abort()
  }, [userId])

  const noticeKey = notice?.text ?? null
  const noticeTone = notice?.tone ?? null
  useEffect(() => {
    if (noticeKey === null || noticeTone === 'error' || noticeTone === 'progress') return undefined
    const timer = setTimeout(() => setNotice((current) => (current?.text === noticeKey ? null : current)), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [noticeKey, noticeTone])

  const state = !userId ? 'signed-out' : status?.userId === userId ? status.state : 'checking'
  const ready = state === 'connected' && sync.state === 'saved' && sync.day !== null && draft === null && busy === null

  const connect = useCallback(async () => {
    setBusy('connect')
    try {
      window.location.assign(await api.connectCalendar())
    } catch (error) {
      setBusy(null)
      setNotice({ tone: 'error', text: calendarErrorMessage(error) })
    }
  }, [])

  const importDay = useCallback(async ({ quiet = false, restoreRemoved = false, restoreEvents } = {}) => {
    const base = planRef.current
    const { date, timezone } = sync.day
    setBusy('import')
    if (!quiet) setNotice({ tone: 'progress', text: 'Importing today’s events from Google Calendar…' })
    try {
      const { plan: saved, summary } = await api.importCalendarDay(date, timezone, { restoreRemoved, restoreEvents })
      if (!sync.adopt(saved, base)) {
        setNotice({ tone: 'info', text: calendarErrorMessage({ code: 'VERSION_CONFLICT' }) })
        return
      }
      const changed = summary.added + summary.updated + summary.removed > 0
      if (!quiet || changed) setNotice({ tone: 'success', text: importSummaryMessage(summary) })
      else setNotice(null)
    } catch (error) {
      if (error?.code === 'CALENDAR_RECONNECT_REQUIRED') setStatus({ userId, state: 'disconnected' })
      setNotice({ tone: 'error', text: calendarErrorMessage(error), reconnect: error?.code === 'CALENDAR_RECONNECT_REQUIRED' })
    } finally {
      setBusy(null)
    }
  }, [sync, userId])

  const disconnect = useCallback(async () => {
    setBusy('disconnect')
    try {
      await api.disconnectCalendar()
      setStatus({ userId, state: 'disconnected' })
      setNotice({ tone: 'info', text: 'Google Calendar disconnected. Events already imported stay in your day.' })
    } catch (error) {
      setNotice({ tone: 'error', text: calendarErrorMessage(error) })
    } finally {
      setBusy(null)
    }
  }, [userId])

  // Once per loaded day: straight after connecting (with a message), or
  // quietly on load (a message only if something changed).
  const dayKey = sync.day ? `${userId}\0${sync.day.date}\0${sync.day.timezone}` : null
  useEffect(() => {
    if (!ready || autoImportedRef.current === dayKey) return
    autoImportedRef.current = dayKey
    importDay({ quiet: returned?.outcome !== 'connected' })
  }, [ready, dayKey, importDay, returned])

  let importHint = null
  if (draft !== null) importHint = 'Accept or keep your pending changes first.'
  else if (sync.state !== 'saved') importHint = 'Waiting for your changes to save.'
  return {
    state,
    busy,
    notice,
    canImport: ready,
    importHint,
    connect,
    // Click handlers pass an event here, so only an explicit `restoreRemoved: true`
    // or a `restoreEvents` array ({ sourceCalendarId, sourceEventId }[]) restores.
    importDay: (options) => importDay({
      restoreRemoved: options?.restoreRemoved === true,
      restoreEvents: Array.isArray(options?.restoreEvents) ? options.restoreEvents : undefined,
    }),
    disconnect,
    dismissNotice: () => setNotice(null),
  }
}
