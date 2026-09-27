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
 * - Updates the title and times of existing Calendar stops, keeping their ID,
 *   status, chosen travel mode and any location the user already confirmed.
 *   A stop the user made flexible keeps its DayMap times, and what the person
 *   changed in DayMap (`localEdits`: 'title', 'time') keeps DayMap's value.
 * - Removes Calendar stops whose event is gone, unless already completed.
 * - Leaves out events the person removed in DayMap (`plan.removedEvents`),
 *   counted as `hidden`, unless `restoreRemoved` brings them all back or
 *   `restoreEvents` ({ sourceCalendarId, sourceEventId }[]) brings back some.
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
    const localEdits = stop.localEdits ?? []
    const merged = { ...next, id: stop.id, location: stop.location, status: stop.status,
      ...(stop.travelMode ? { travelMode: stop.travelMode } : {}),
      ...(localEdits.length ? { localEdits } : {}) }
    // A Calendar event the person made flexible is DayMap's to schedule; only its title follows Calendar.
    if (stop.timing.kind === 'flexible' && next.timing.kind === 'fixed') merged.timing = stop.timing
    // What the person changed in DayMap wins over Calendar.
    if (localEdits.includes('title')) merged.title = stop.title
    if (localEdits.includes('time')) merged.timing = stop.timing
    if (merged.title !== stop.title || JSON.stringify(merged.timing) !== JSON.stringify(stop.timing)) summary.updated++
    stops.push(merged)
    if (merged.location === null) replaceQuestion.set(stop.id, { ...importedQuestion.get(next.id), stopId: stop.id })
  }
  for (const stop of incoming.values()) {
    stops.push(stop)
    replaceQuestion.set(stop.id, importedQuestion.get(stop.id))
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
