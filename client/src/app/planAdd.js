// Fitting a new stop into the day. Pure: the planner previews with it and the
// reducer commits with it, so the preview always equals the result.
//
// Travel is not included. The plan has no legs until routes are calculated
// (DM-07), and unknown travel is never treated as zero (ARCHITECTURE §5), so
// slots are checked on clock times only and the UI says so. Once
// POST /api/plans/:id/preview exists this belongs in server/src/planning/.

const MINUTE = 60000

/** Visit lengths offered by the add flows, in minutes. */
export const DURATION_CHOICES = [15, 20, 30, 45, 60]

const MIN_DURATION = 5
const MAX_DURATION = 480
const MAX_TITLE = 120

/**
 * @typedef {object} NewStop
 * @property {string} id
 * @property {string} title
 * @property {{ label: string, placeId: string | null, lat: number, lng: number } | null} location
 *   null adds it without a place; it then shows "Location needed" like any unresolved stop.
 * @property {'flexible' | 'fixed'} kind
 * @property {number} [durationMinutes] Flexible only.
 * @property {string | null} [startAt] Fixed only, UTC timestamp.
 * @property {string | null} [endAt] Fixed only, UTC timestamp.
 */

/**
 * @typedef {object} FitReason
 * @property {'late' | 'outside-window' | 'overlaps' | 'in-past'} code
 * @property {string} [stopId] The stop that causes it.
 * @property {number} [minutesLate] For 'late'.
 */

/**
 * @typedef {object} StopChange
 * @property {string} stopId
 * @property {'new' | 'none' | 'shifted'} type
 * @property {string} [fromStartAt] For 'shifted': the start before the change.
 */

/**
 * @typedef {object} FitOption
 * @property {string | null} afterStopId The stop the new one follows; null when it comes first.
 * @property {string} startAt
 * @property {string} endAt
 * @property {boolean} ok
 * @property {FitReason | null} reason Why it doesn't fit, when not ok.
 * @property {number | null} spareMinutes Free time before the next stop that doesn't move.
 * @property {string | null} nextStopId That stop.
 * @property {string[]} shiftedStopIds Flexible stops moved later to make room.
 * @property {StopChange[]} changes From the stop before the new one to the end of the day.
 * @property {object | null} plan The resulting plan, when ok.
 * @property {boolean} recommended
 */

function toTimestamp(ms) {
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

const startOf = (stop) => Date.parse(stop.timing.scheduledStartAt)
const endOf = (stop) => Date.parse(stop.timing.scheduledEndAt)

// All-day items and stops without times are never given a slot.
function timedStops(plan) {
  return plan.stops.filter((stop) =>
    stop.timing.kind !== 'all-day' && stop.timing.scheduledStartAt !== null && stop.timing.scheduledEndAt !== null,
  )
}

// Fixed commitments and completed or skipped stops keep their times.
function canShift(stop) {
  return stop.timing.kind === 'flexible' && stop.status === 'planned'
}

// Slots start on a five-minute boundary no earlier than now.
function roundUpToFive(ms) {
  const step = 5 * MINUTE
  return Math.ceil(ms / step) * step
}

/**
 * Check the parts of a new stop that don't depend on the day.
 *
 * @param {NewStop} newStop
 * @returns {null | 'missing-title' | 'title-too-long' | 'invalid-duration' | 'missing-time' | 'end-before-start'}
 */
export function validateNewStop(newStop) {
  const title = newStop.title.trim()
  if (title === '') return 'missing-title'
  if (title.length > MAX_TITLE) return 'title-too-long'
  let minutes = newStop.durationMinutes
  if (newStop.kind === 'fixed') {
    if (!newStop.startAt || !newStop.endAt) return 'missing-time'
    minutes = (Date.parse(newStop.endAt) - Date.parse(newStop.startAt)) / MINUTE
    if (!(minutes > 0)) return 'end-before-start'
  }
  if (!Number.isInteger(minutes) || minutes < MIN_DURATION || minutes > MAX_DURATION) return 'invalid-duration'
  return null
}

// Move flexible stops from `fromIndex` later until they start at or after
// `cursor`, keeping their durations and order. Stops that can't move are
// never touched: running into one is a conflict.
function reflow(timed, fromIndex, cursor) {
  const shifts = []
  for (let index = fromIndex; index < timed.length; index++) {
    const stop = timed[index]
    const start = startOf(stop)
    if (start >= cursor) {
      return { ok: true, reason: null, shifts, spareMinutes: Math.floor((start - cursor) / MINUTE), nextStopId: stop.id }
    }
    if (!canShift(stop)) {
      return { ok: false, reason: { code: 'late', stopId: stop.id, minutesLate: Math.ceil((cursor - start) / MINUTE) }, shifts }
    }
    const end = cursor + (endOf(stop) - start)
    const { latestEndAt } = stop.timing
    if (latestEndAt !== null && end > Date.parse(latestEndAt)) {
      return { ok: false, reason: { code: 'outside-window', stopId: stop.id }, shifts }
    }
    shifts.push({ stopId: stop.id, start: cursor, end })
    cursor = end
  }
  return { ok: true, reason: null, shifts, spareMinutes: null, nextStopId: null }
}

function makeStop(newStop, start, end) {
  const fixed = newStop.kind === 'fixed'
  return {
    id: newStop.id,
    title: newStop.title.trim(),
    source: 'manual',
    sourceEventId: null,
    sourceCalendarId: null,
    location: newStop.location === null ? null : { ...newStop.location },
    timing: {
      kind: newStop.kind,
      durationMinutes: (end - start) / MINUTE,
      fixedStartAt: fixed ? toTimestamp(start) : null,
      fixedEndAt: fixed ? toTimestamp(end) : null,
      earliestStartAt: null,
      latestEndAt: null,
      scheduledStartAt: toTimestamp(start),
      scheduledEndAt: toTimestamp(end),
    },
    status: 'planned',
  }
}

// The plan with the new stop inserted after `afterStopId` and the shifts
// applied. Legs touching a changed stop are stale until recalculated.
function buildPlan(plan, stop, afterStopId, shifts) {
  const next = structuredClone(plan)
  for (const shift of shifts) {
    const target = next.stops.find((candidate) => candidate.id === shift.stopId)
    target.timing.scheduledStartAt = toTimestamp(shift.start)
    target.timing.scheduledEndAt = toTimestamp(shift.end)
  }
  const firstTimed = timedStops(next)[0]
  const index = afterStopId !== null
    ? next.stops.findIndex((candidate) => candidate.id === afterStopId) + 1
    : firstTimed ? next.stops.indexOf(firstTimed) : next.stops.length
  next.stops.splice(index, 0, stop)
  const touched = new Set([afterStopId, ...shifts.map((shift) => shift.stopId)])
  next.legs = next.legs.map((leg) =>
    touched.has(leg.fromStopId) || touched.has(leg.toStopId) ? { ...leg, status: 'stale' } : leg,
  )
  return next
}

function listChanges(plan, preview, newStopId, afterStopId, shifts) {
  const before = new Map(plan.stops.map((stop) => [stop.id, stop]))
  const shifted = new Set(shifts.map((shift) => shift.stopId))
  const from = afterStopId === null ? 0 : preview.stops.findIndex((stop) => stop.id === afterStopId)
  return preview.stops.slice(from).map((stop) => {
    if (stop.id === newStopId) return { stopId: stop.id, type: 'new' }
    if (shifted.has(stop.id)) {
      return { stopId: stop.id, type: 'shifted', fromStartAt: before.get(stop.id).timing.scheduledStartAt }
    }
    return { stopId: stop.id, type: 'none' }
  })
}

function makeOption(plan, newStop, afterStopId, start, end, flow) {
  const base = {
    afterStopId,
    startAt: toTimestamp(start),
    endAt: toTimestamp(end),
    ok: flow.ok,
    reason: flow.reason,
    spareMinutes: flow.ok ? flow.spareMinutes : null,
    nextStopId: flow.ok ? flow.nextStopId : null,
    shiftedStopIds: flow.shifts.map((shift) => shift.stopId),
    changes: [],
    plan: null,
    recommended: false,
  }
  if (!flow.ok) return base
  const preview = buildPlan(plan, makeStop(newStop, start, end), afterStopId, flow.shifts)
  return { ...base, plan: preview, changes: listChanges(plan, preview, newStop.id, afterStopId, flow.shifts) }
}

// Flexible: straight after `timed[index]`, or from now if that stop is over.
function fitAfter(plan, timed, index, newStop, now) {
  const start = Math.max(endOf(timed[index]), roundUpToFive(now.getTime()))
  const end = start + newStop.durationMinutes * MINUTE
  return makeOption(plan, newStop, timed[index].id, start, end, reflow(timed, index + 1, end))
}

// Fixed: exactly at the given time. It may push later flexible stops back,
// but never overlaps anything that can't move or that has already started.
function fitAt(plan, timed, newStop, now) {
  const start = Date.parse(newStop.startAt)
  const end = Date.parse(newStop.endAt)
  const index = timed.findIndex((stop) => startOf(stop) >= start)
  const after = index === -1 ? timed.length : index
  const afterStopId = after > 0 ? timed[after - 1].id : null
  const fail = (reason) => makeOption(plan, newStop, afterStopId, start, end, { ok: false, reason, shifts: [] })

  if (start < now.getTime()) return fail({ code: 'in-past' })
  const blocking = timed.find((stop) =>
    startOf(stop) < end && endOf(stop) > start && (!canShift(stop) || startOf(stop) < start),
  )
  if (blocking) return fail({ code: 'overlaps', stopId: blocking.id })
  return makeOption(plan, newStop, afterStopId, start, end, reflow(timed, after, end))
}

// The soonest slot that moves the fewest stops. (Most spare time would always
// favour the end of the day, and spare time means little while travel is unknown.)
function compareOptions(a, b) {
  if (a.ok !== b.ok) return a.ok ? -1 : 1
  if (a.ok && a.shiftedStopIds.length !== b.shiftedStopIds.length) {
    return a.shiftedStopIds.length - b.shiftedStopIds.length
  }
  return Date.parse(a.startAt) - Date.parse(b.startAt)
}

/**
 * Where a new stop could go and what each choice does to the rest of the day.
 * Never changes `plan`.
 *
 * Flexible stops are tried after each timed stop that hasn't started yet
 * (or only after `afterStopId`). A fixed stop gets the single slot at its time.
 * OK options come first, best first, and the best one is `recommended`.
 *
 * @param {object} plan Accepted plan in the §5 shape.
 * @param {NewStop} newStop
 * @param {{ afterStopId?: string | null, now: Date }} options
 * @returns {{ error: ReturnType<typeof validateNewStop>, options: FitOption[] }}
 */
export function fitNewStop(plan, newStop, { afterStopId = null, now }) {
  const error = validateNewStop(newStop)
  if (error !== null) return { error, options: [] }

  const timed = timedStops(plan)
  let options
  if (newStop.kind === 'fixed') {
    options = [fitAt(plan, timed, newStop, now)]
  } else if (timed.length === 0) {
    const start = roundUpToFive(now.getTime())
    const end = start + newStop.durationMinutes * MINUTE
    const flow = { ok: true, reason: null, shifts: [], spareMinutes: null, nextStopId: null }
    options = [makeOption(plan, newStop, null, start, end, flow)]
  } else {
    options = timed
      .map((stop, index) => ({ stop, index }))
      .filter(({ stop, index }) =>
        (afterStopId === null || stop.id === afterStopId) &&
        // Never squeeze in before a stop that has already started.
        (index + 1 >= timed.length || startOf(timed[index + 1]) > now.getTime()),
      )
      .map(({ index }) => fitAfter(plan, timed, index, newStop, now))
    options.sort(compareOptions)
  }
  if (options[0]?.ok) options[0] = { ...options[0], recommended: true }
  return { error: null, options }
}

/**
 * The option a commit applies: the fixed slot, or the flexible slot after
 * `afterStopId`. Null when it doesn't fit.
 */
export function chooseOption(plan, newStop, { afterStopId, now }) {
  const { options } = fitNewStop(plan, newStop, {
    afterStopId: newStop.kind === 'flexible' ? afterStopId : null,
    now,
  })
  return options.find((option) => option.ok) ?? null
}
