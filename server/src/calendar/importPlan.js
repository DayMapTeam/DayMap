const sourceKey = stop => `${stop.sourceCalendarId}\0${stop.sourceEventId}`
const isCalendarStop = stop => stop.source === 'google-calendar'

/**
 * The removed events that still hide something: without the ones the person
 * brings back (all with `restoreRemoved`, or those in `restoreEvents`), and
 * without events no longer in Calendar for this day (deleted or moved), so
 * the hidden count stays true.
 */
function keptRemovedEvents(removed, imported, { restoreRemoved, restoreEvents }) {
  if (restoreRemoved === true) return []
  const restore = new Set((restoreEvents ?? []).map(sourceKey))
  const present = new Set(imported.stops.map(sourceKey))
  return removed.filter(event => !restore.has(sourceKey(event)) && present.has(sourceKey(event)))
}

/**
 * A Calendar stop as imported (`next`), keeping what DayMap owns from `stop`:
 * its ID, status, confirmed place and chosen travel mode. A stop the person
 * made flexible keeps its DayMap times, and what the person changed in DayMap
 * (`localEdits`: 'title', 'time') keeps DayMap's value.
 */
function mergeCalendarStop(stop, next) {
  const localEdits = stop.localEdits ?? []
  const merged = { ...next, id: stop.id, location: stop.location, status: stop.status,
    ...(stop.travelMode ? { travelMode: stop.travelMode } : {}),
    ...(localEdits.length ? { localEdits } : {}) }
  // A Calendar event the person made flexible is DayMap's to schedule; only its title follows Calendar.
  if (stop.timing.kind === 'flexible' && next.timing.kind === 'fixed') merged.timing = stop.timing
  // What the person changed in DayMap wins over Calendar.
  if (localEdits.includes('title')) merged.title = stop.title
  if (localEdits.includes('time')) merged.timing = stop.timing
  return merged
}

/** The stop a removed event was, from what its entry kept, to merge a brought-back event with. */
function removedAsStop(event, next) {
  return { id: next.id, title: event.title, location: event.location ?? null, status: next.status,
    timing: event.timing ?? next.timing,
    ...(event.travelMode ? { travelMode: event.travelMode } : {}),
    ...(event.localEdits ? { localEdits: event.localEdits } : {}) }
}

/** When a stop starts, or null for all-day and unscheduled stops. */
function startOf(stop) {
  if (stop.timing.kind === 'all-day') return null
  const start = Date.parse(stop.timing.scheduledStartAt ?? stop.timing.fixedStartAt)
  return Number.isFinite(start) ? start : null
}

/**
 * Add a new or brought-back stop before the first stop that starts after it,
 * so it takes its place in the day (and on the map) rather than going last.
 * Stops without a start go last, as before.
 */
function insertInTimeOrder(stops, stop) {
  const start = startOf(stop)
  const index = start === null ? -1 : stops.findIndex(other => startOf(other) !== null && startOf(other) > start)
  if (index === -1) stops.push(stop)
  else stops.splice(index, 0, stop)
}

function withRemovedEvents(plan, removedEvents) {
  const next = { ...plan }
  if (removedEvents.length) next.removedEvents = removedEvents
  else delete next.removedEvents
  return next
}

/**
 * Merge one day's imported Calendar stops into the saved plan (or a new one).
 *
 * - Deduplicates by calendar ID + event ID.
 * - Updates the title and times of existing Calendar stops (see mergeCalendarStop).
 * - Adds new and brought-back events at their place in the day's time order.
 * - Removes Calendar stops whose event is gone, unless already completed.
 * - Leaves out events the person removed in DayMap (`plan.removedEvents`),
 *   counted as `hidden`, unless `restoreRemoved` brings them all back or
 *   `restoreEvents` ({ sourceCalendarId, sourceEventId }[]) brings back some.
 *   A brought-back event gets back what the person had set for it in DayMap
 *   (place, travel mode, edited title or times), by the same rules.
 *   Removed events no longer in Calendar for this day are forgotten.
 * - Never touches manual stops.
 *
 * Returns the candidate plan with the saved plan's version (validated and
 * saved by the caller), a summary, and whether anything changed.
 */
export function mergeCalendarImport(existing, imported,
  { planId, date, timezone, restoreRemoved = false, restoreEvents = [] }) {
  const saved = existing ?? { id: planId, date, timezone, version: 0, dataMode: 'live',
    stops: [], legs: [], conflicts: [], questions: [] }
  const removedBefore = saved.removedEvents ?? []
  const removedAfter = keptRemovedEvents(removedBefore, imported, { restoreRemoved, restoreEvents })
  // Entries are only ever dropped, so a different length means a different list.
  const removedChanged = removedAfter.length !== removedBefore.length
  // What the person had set in DayMap for the events being brought back.
  const stillRemoved = new Set(removedAfter.map(sourceKey))
  const restored = new Map(removedBefore
    .filter(event => !stillRemoved.has(sourceKey(event)))
    .map(event => [sourceKey(event), event]))
  const base = removedChanged ? withRemovedEvents(saved, removedAfter) : saved
  const removedKeys = new Set((base.removedEvents ?? []).map(sourceKey))
  const existingKeys = new Set(base.stops.filter(isCalendarStop).map(sourceKey))
  const summary = { added: 0, updated: 0, removed: 0, hidden: 0 }
  const incoming = new Map()
  for (const stop of imported.stops) {
    const key = sourceKey(stop)
    if (removedKeys.has(key) && !existingKeys.has(key)) summary.hidden++
    else incoming.set(key, stop)
  }
  const importedQuestion = new Map(imported.questions.map(question => [question.stopId, question]))
  const stops = []
  // Questions to (re)place, keyed by stop ID.
  const replaceQuestion = new Map()

  for (const stop of base.stops) {
    if (!isCalendarStop(stop)) {
      stops.push(stop)
      continue
    }
    const next = incoming.get(sourceKey(stop))
    if (!next) {
      if (stop.status === 'completed') stops.push(stop)
      else summary.removed++
      continue
    }
    incoming.delete(sourceKey(stop))
    const merged = mergeCalendarStop(stop, next)
    if (merged.title !== stop.title || JSON.stringify(merged.timing) !== JSON.stringify(stop.timing)) summary.updated++
    stops.push(merged)
    if (merged.location === null) replaceQuestion.set(stop.id, { ...importedQuestion.get(next.id), stopId: stop.id })
  }
  for (const next of incoming.values()) {
    const event = restored.get(sourceKey(next))
    const stop = event ? mergeCalendarStop(removedAsStop(event, next), next) : next
    const question = importedQuestion.get(next.id)
    insertInTimeOrder(stops, stop)
    replaceQuestion.set(stop.id, stop.location && question ? { ...question, status: 'answered' } : question)
    summary.added++
  }

  const kept = new Set(stops.map(stop => stop.id))
  const questions = []
  for (const question of base.questions) {
    if (!kept.has(question.stopId)) continue
    const replacement = question.field === 'location' ? replaceQuestion.get(question.stopId) : undefined
    if (replacement) {
      // A person who chose to answer later keeps that choice after a re-import.
      questions.push({ ...replacement, status: question.status === 'deferred' ? 'deferred' : replacement.status })
      replaceQuestion.delete(question.stopId)
    } else {
      questions.push(question)
    }
  }
  questions.push(...replaceQuestion.values())

  const plan = {
    ...base,
    stops,
    legs: base.legs.filter(leg => kept.has(leg.fromStopId) && kept.has(leg.toStopId)),
    conflicts: base.conflicts.filter(conflict => conflict.stopIds.every(id => kept.has(id))),
    questions,
  }
  const changed = existing === null || removedChanged || summary.added + summary.updated + summary.removed > 0
    || JSON.stringify(plan.questions) !== JSON.stringify(base.questions)
  return { plan, summary, changed }
}
