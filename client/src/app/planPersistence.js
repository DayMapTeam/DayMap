const STOP_FIELDS = ['id', 'title', 'source', 'sourceEventId', 'sourceCalendarId', 'status', 'travelMode']
const TIMING_FIELDS = ['kind', 'durationMinutes', 'fixedStartAt', 'fixedEndAt',
  'earliestStartAt', 'latestEndAt', 'scheduledStartAt', 'scheduledEndAt']
const DEMO_KEY = 'daymap:demo-plan'

/** The browser's IANA timezone, used for the signed-in user's "today". */
export function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** "YYYY-MM-DD" for an instant in an IANA timezone. */
export function localDate(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** The "YYYY-MM-DD" before another. */
export function previousDate(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
}

/**
 * Where a new day starts, from the day before: where it ended (home, or the
 * hotel you stayed at). If it started and ended at the same place, the new
 * day ends there too.
 */
export function carryOverPlaces(previous) {
  const end = previous?.endPlace ?? null
  const start = previous?.startPlace ?? null
  const same = end && start && end.lat === start.lat && end.lng === start.lng
  return { startPlace: end, endPlace: same ? end : null }
}

/** A day with nothing planned yet. It is only saved once something is added. */
export function emptyLivePlan({ id, date, timezone }) {
  return { id, date, timezone, version: 0, dataMode: 'live', stops: [], legs: [], conflicts: [], questions: [] }
}

export function locationQuestion(stop) {
  return { id: `location:${stop.id}`, stopId: stop.id, field: 'location', prompt: `Where is “${stop.title}”?`, status: 'unanswered' }
}

/**
 * The plan as the server stores it. Journeys are recalculated on load, and
 * Google place IDs wait for the provider-retention decision (ARCHITECTURE §12),
 * so neither is saved; coordinates are. Every unlocated stop keeps a location
 * question, and a located stop's question is marked answered.
 */
export function toSavedPlan(plan) {
  const stops = plan.stops.map((stop) => ({
    ...Object.fromEntries(STOP_FIELDS.map((field) => [field, stop[field] ?? null])),
    location: stop.location
      ? { label: stop.location.label, placeId: null, lat: stop.location.lat, lng: stop.location.lng }
      : null,
    timing: Object.fromEntries(TIMING_FIELDS.map((field) => [field, stop.timing[field] ?? null])),
  }))
  const byStop = new Map(stops.map((stop) => [stop.id, stop]))
  const questions = (plan.questions ?? [])
    .filter((question) => byStop.has(question.stopId))
    .map((question) => question.field === 'location' && byStop.get(question.stopId).location !== null
      ? { ...question, status: 'answered' } : question)
  for (const stop of stops) {
    if (stop.location === null && !questions.some((q) => q.stopId === stop.id && q.field === 'location')) {
      questions.push(locationQuestion(stop))
    }
  }
  const place = (value) => (value ? { label: value.label, placeId: null, lat: value.lat, lng: value.lng } : null)
  return {
    id: plan.id, date: plan.date, timezone: plan.timezone, version: plan.version,
    dataMode: plan.dataMode, stops, legs: [], conflicts: [], questions,
    startPlace: place(plan.startPlace), endPlace: place(plan.endPlace),
  }
}

// Version is the server's business; two plans that differ only by it are the same save.
const contentKey = (plan) => JSON.stringify({ ...toSavedPlan(plan), version: null })

/**
 * Saves the accepted plan one request at a time, always against the version
 * the server last confirmed, so a later edit never races an earlier one.
 * A version conflict stops saving until the person chooses what to keep.
 *
 * @param {object} options
 * @param {(plan: object, baseVersion: number) => Promise<object>} options.save
 * @param {object} options.plan The plan as loaded (or the empty new day).
 * @param {number} options.version The server's version; 0 when nothing is saved yet.
 */
export function createPlanSaver({ save, plan, version }) {
  let serverVersion = version
  let savedKey = contentKey(plan)
  let latest = plan
  let inFlight = false
  let disposed = false
  let status = { state: 'saved', error: null }
  const listeners = new Set()

  const setStatus = (next) => {
    status = next
    for (const listener of listeners) listener()
  }

  async function pump() {
    if (inFlight || disposed || status.state === 'conflict') return
    const key = contentKey(latest)
    if (key === savedKey) {
      if (status.state !== 'saved') setStatus({ state: 'saved', error: null })
      return
    }
    inFlight = true
    setStatus({ state: 'saving', error: null })
    try {
      const saved = await save(toSavedPlan(latest), serverVersion)
      if (disposed) return
      serverVersion = saved.version
      savedKey = key
      inFlight = false
      pump()
    } catch (error) {
      inFlight = false
      if (disposed) return
      setStatus({ state: error?.code === 'VERSION_CONFLICT' ? 'conflict' : 'error', error })
    }
  }

  return {
    /** Call with each new accepted plan. Unchanged content sends nothing. */
    sync(next) {
      latest = next
      if (status.state !== 'error') pump()
    },
    retry() {
      if (status.state === 'error') {
        setStatus({ state: 'saving', error: null })
        pump()
      }
    },
    /**
     * After a conflict: adopt the server's copy (`dirty: false`), or keep the
     * local plan and save it over `version` (`dirty: true`).
     */
    reset({ plan: next, version: nextVersion, dirty }) {
      latest = next
      serverVersion = nextVersion
      savedKey = dirty ? null : contentKey(next)
      setStatus({ state: 'saved', error: null })
      pump()
    },
    get version() { return serverVersion },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      disposed = true
      listeners.clear()
    },
  }
}

/** This tab's sessionStorage, or undefined where the browser blocks it. */
export function sessionStore() {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

/** Signed-out demo edits survive a refresh for this browser session only. */
export function readDemoPlan(storage, fixture) {
  try {
    const plan = JSON.parse(storage?.getItem(DEMO_KEY) ?? 'null')
    return plan?.id === fixture.id && plan.dataMode === 'demo' && Array.isArray(plan.stops) ? plan : fixture
  } catch {
    return fixture
  }
}

export function writeDemoPlan(storage, plan) {
  try {
    if (plan === null) storage?.removeItem(DEMO_KEY)
    else storage?.setItem(DEMO_KEY, JSON.stringify(plan))
  } catch {
    // Storage can be full, blocked or unavailable; the demo still works.
  }
}
