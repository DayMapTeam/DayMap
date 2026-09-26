import { analyzePlan } from './analyze.js'
import { planDayBounds } from './dayBounds.js'
import { planFingerprint } from './fingerprint.js'
import { buildTimeline, stopInterval } from './timeline.js'

const MINUTE = 60000
const pair = (conflict) => JSON.stringify([...conflict.stopIds].sort())
const iso = (ms) => new Date(ms).toISOString()

function lockReason(stop, now, locks) {
  if (stop.timing.kind !== 'flexible') return 'fixed'
  if (stop.status !== 'planned') return stop.status
  const interval = stopInterval(stop)
  if (!interval) return 'unscheduled'
  if (interval.start <= now) return 'started'
  if (locks.has(stop.id)) return 'your-edit'
  return null
}

// Compare exact durations rather than rounded display minutes: even an extra
// second of an existing conflict is a regression.
function magnitude(conflict, analysis, plan) {
  if (conflict.code === 'overlap') {
    const [a, b] = conflict.stopIds.map((id) => stopInterval(plan.stops.find((stop) => stop.id === id)))
    return Math.min(a.end, b.end) - Math.max(a.start, b.start)
  }
  const leg = analysis.legs.find((item) => item.fromStopId === conflict.stopIds[0] && item.toStopId === conflict.stopIds[1])
  return leg ? Math.max(0, -leg.spareSeconds * 1000) : Infinity
}

function safeCandidate(before, after, original, candidate, target) {
  if (after.conflicts.some((conflict) => pair(conflict) === pair(target))) return false
  const prior = new Map(before.conflicts.map((conflict) => [conflict.id, conflict]))
  for (const conflict of after.conflicts) {
    const old = prior.get(conflict.id)
    if (!old || magnitude(conflict, after, candidate) > magnitude(old, before, original)) return false
  }
  const unresolved = new Set(before.unresolved.map((entry) => entry.id))
  return after.unresolved.every((entry) => unresolved.has(entry.id))
}

// A time-dependent lookup is only a candidate-building estimate here. Full
// candidate analysis below still requires exact departure-time verification.
function journeyNeed(from, to, departMs, ctx) {
  if (!from || !to) return 0
  if (!from.location || !to.location) return null
  if (from.location.placeId && from.location.placeId === to.location.placeId) return 0
  const choice = ctx.modeFor?.(from, to)
  const mode = typeof choice === 'string' ? choice : choice?.mode
  const buffer = ctx.buffers?.[mode]
  if (!['walk', 'transit', 'drive'].includes(mode) || !Number.isFinite(buffer) || buffer < 0) return null
  const estimate = ctx.travel?.(from, to, { mode, departAt: iso(departMs) })
  if (estimate?.status !== 'ready' || !Number.isFinite(estimate.travelSeconds) || estimate.travelSeconds < 0) return null
  return (estimate.travelSeconds + buffer * 60) * 1000
}

function nearestStart(lo, hi, original) {
  for (const step of [5 * MINUTE, MINUTE]) {
    const first = Math.ceil(lo / step) * step
    const last = Math.floor(hi / step) * step
    if (first <= last) return Math.max(first, Math.min(last, Math.round(original / step) * step))
  }
  return null
}

/**
 * Find one verified single-stop move for a current conflict. No mutations,
 * requests, or implicit acceptance. ctx extends analyzePlan context with
 * lockedStopIds (iterable). Returns {status:'proposal', proposal},
 * {status:'needsDecision', conflictId}, or {status:'noFit', reason, blockers}.
 * This bounded search is not a proof that no other schedule exists.
 */
export function suggestFix(plan, conflictId, ctx) {
  const before = analyzePlan(plan, ctx)
  const target = before.conflicts.find((conflict) => conflict.id === conflictId)
  if (!target) return { status: 'noFit', reason: 'conflict-not-current', blockers: [] }
  if (target.needsDecision) return { status: 'needsDecision', conflictId }
  const now = ctx.now instanceof Date ? ctx.now.getTime() : ctx.now
  const locks = new Set(ctx.lockedStopIds ?? [])
  const day = planDayBounds(plan.date, plan.timezone)
  const timeline = buildTimeline(plan)
  const blockers = []
  const candidates = []

  for (const stopId of target.stopIds) {
    const moving = plan.stops.find((stop) => stop.id === stopId)
    const blocked = lockReason(moving, now, locks)
    if (blocked) { blockers.push({ stopId, reason: blocked }); continue }
    const current = stopInterval(moving)
    const duration = current.end - current.start
    if (moving.timing.durationMinutes * MINUTE !== duration) {
      blockers.push({ stopId, reason: 'invalid-duration' }); continue
    }
    const lower = moving.timing.earliestStartAt == null ? day.start : Date.parse(moving.timing.earliestStartAt)
    const upper = moving.timing.latestEndAt == null ? day.end : Date.parse(moving.timing.latestEndAt)
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
      blockers.push({ stopId, reason: 'invalid-window' }); continue
    }
    const others = timeline.filter((stop) => stop.id !== stopId)
    const originalIndex = timeline.findIndex((stop) => stop.id === stopId)
    let unknownTravel = false
    let unverified = false
    let availableWindow = false

    for (let index = 0; index <= others.length; index++) {
      const previous = others[index - 1]
      const next = others[index]
      const incoming = journeyNeed(previous, moving, previous ? stopInterval(previous).end : now, ctx)
      const outgoing = journeyNeed(moving, next, current.end, ctx)
      if (incoming === null || outgoing === null) { unknownTravel = true; continue }
      const lo = Math.max(lower, day.start, now, previous ? stopInterval(previous).end + incoming : -Infinity)
      const hi = Math.min(upper, day.end, next ? stopInterval(next).start - outgoing : Infinity) - duration
      const start = nearestStart(lo, hi, current.start)
      if (start === null || start === current.start) continue
      availableWindow = true
      const candidate = structuredClone(plan)
      const changed = candidate.stops.find((stop) => stop.id === stopId)
      changed.timing.scheduledStartAt = iso(start)
      changed.timing.scheduledEndAt = iso(start + duration)
      const analysis = analyzePlan(candidate, ctx)
      // All journeys touching the moved stop must be known, even if their old
      // unresolved IDs also existed before the move.
      if (analysis.unresolved.some((entry) => entry.stopIds.includes(stopId))) { unverified = true; continue }
      if (!safeCandidate(before, analysis, plan, candidate, target)) continue
      candidates.push({
        moving, changed, analysis, strategy: index === originalIndex ? 'slide' : 'relocate',
        shift: Math.abs(start - current.start), start,
        travel: analysis.legs.reduce((sum, leg) => sum + (leg.travelSeconds ?? 0), 0),
      })
    }
    blockers.push({ stopId, reason: unverified || unknownTravel ? 'travel-unknown' : availableWindow ? 'other-conflict' : 'window' })
  }

  candidates.sort((a, b) => Number(a.strategy === 'relocate') - Number(b.strategy === 'relocate')
    || a.shift - b.shift || a.travel - b.travel || b.start - a.start
    || (a.moving.id < b.moving.id ? -1 : a.moving.id > b.moving.id ? 1 : 0))
  const winner = candidates[0]
  if (!winner) return { status: 'noFit', reason: 'no-verified-single-stop-fix', blockers }
  const fingerprint = planFingerprint(plan)
  return {
    status: 'proposal',
    proposal: {
      id: JSON.stringify(['move', plan.id, plan.version, conflictId, winner.moving.id, winner.start]),
      planId: plan.id, baseVersion: plan.version, baseFingerprint: fingerprint,
      conflictId, strategy: winner.strategy,
      changes: [{ stopId: winner.moving.id, before: structuredClone(winner.moving), after: winner.changed }],
      legs: winner.analysis.legs,
      resolves: before.conflicts.filter((old) => !winner.analysis.conflicts.some((item) => item.id === old.id)).map((item) => item.id),
      remainingConflicts: winner.analysis.conflicts,
      freeMinutesAfter: winner.analysis.summary.freeMinutes,
    },
  }
}

/**
 * Revalidate and apply a single-stop proposal to a new snapshot. The caller
 * must supply CURRENT analysis context; a fingerprint alone is insufficient.
 * Returns null for stale/invalid/unverified proposals. Never imports proposal
 * legs or other derived provider data into the persisted plan.
 */
export function applyProposal(plan, proposal, ctx) {
  const now = ctx?.now instanceof Date ? ctx.now.getTime() : ctx?.now
  if (!Number.isFinite(now) || !proposal || proposal.planId !== plan.id
    || proposal.baseVersion !== plan.version || proposal.baseFingerprint !== planFingerprint(plan)
    || !Array.isArray(proposal.changes) || proposal.changes.length !== 1) return null
  const change = proposal.changes[0]
  const moving = plan.stops.find((stop) => stop.id === change?.stopId)
  if (!moving || lockReason(moving, now, new Set(ctx.lockedStopIds ?? []))) return null
  const original = stopInterval(moving)
  const updated = stopInterval(change.after ?? {})
  if (!updated || updated.start < now || updated.start === original.start
    || updated.end - updated.start !== original.end - original.start
    || moving.timing.durationMinutes * MINUTE !== original.end - original.start) return null

  // Only the two scheduled timestamps may differ; never trust extra fields in
  // a supplied after snapshot (including kind, window, title and location).
  const expected = structuredClone(moving)
  expected.timing.scheduledStartAt = change.after.timing.scheduledStartAt
  expected.timing.scheduledEndAt = change.after.timing.scheduledEndAt
  const stopKey = (stop) => planFingerprint({ stops: [stop] })
  if (stopKey(change.before) !== stopKey(moving) || stopKey(change.after) !== stopKey(expected)) return null
  const day = planDayBounds(plan.date, plan.timezone)
  const lower = moving.timing.earliestStartAt == null ? day.start : Date.parse(moving.timing.earliestStartAt)
  const upper = moving.timing.latestEndAt == null ? day.end : Date.parse(moving.timing.latestEndAt)
  if (!Number.isFinite(lower) || !Number.isFinite(upper)
    || updated.start < Math.max(lower, day.start) || updated.end > Math.min(upper, day.end)) return null

  const before = analyzePlan(plan, ctx)
  const target = before.conflicts.find((conflict) => conflict.id === proposal.conflictId)
  if (!target || target.needsDecision || !target.stopIds.includes(moving.id)) return null
  const candidate = structuredClone(plan)
  candidate.stops = candidate.stops.map((stop) => stop.id === moving.id ? expected : stop)
  const after = analyzePlan(candidate, ctx)
  if (after.unresolved.some((entry) => entry.stopIds.includes(moving.id))
    || !safeCandidate(before, after, plan, candidate, target)) return null
  // A relocation can also create a journey between the OLD neighbours. Keep
  // user mode choices, but invalidate all existing derived journey values.
  candidate.legs = (candidate.legs ?? []).map((leg) => ({ ...leg, status: 'stale' }))
  return candidate
}
