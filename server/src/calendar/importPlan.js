const sourceKey = stop => `${stop.sourceCalendarId}\0${stop.sourceEventId}`
const isCalendarStop = stop => stop.source === 'google-calendar'

/**
 * Merge one day's imported Calendar stops into the saved plan (or a new one).
 *
 * - Deduplicates by calendar ID + event ID.
 * - Updates the title and times of existing Calendar stops, keeping their ID,
 *   status, chosen travel mode and any location the user already confirmed.
 *   A stop the user made flexible keeps its DayMap times.
 * - Removes Calendar stops whose event is gone, unless already completed.
 * - Never touches manual stops.
 *
 * Returns the candidate plan with the saved plan's version (validated and
 * saved by the caller), a summary, and whether anything changed.
 */
export function mergeCalendarImport(existing, imported, { planId, date, timezone }) {
  const base = existing ?? { id: planId, date, timezone, version: 0, dataMode: 'live',
    stops: [], legs: [], conflicts: [], questions: [] }
  const incoming = new Map(imported.stops.map(stop => [sourceKey(stop), stop]))
  const importedQuestion = new Map(imported.questions.map(question => [question.stopId, question]))
  const summary = { added: 0, updated: 0, removed: 0 }
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
    const merged = { ...next, id: stop.id, location: stop.location, status: stop.status,
      ...(stop.travelMode ? { travelMode: stop.travelMode } : {}) }
    // A Calendar event the person made flexible is DayMap's to schedule; only its title follows Calendar.
    if (stop.timing.kind === 'flexible' && next.timing.kind === 'fixed') merged.timing = stop.timing
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
  const changed = existing === null || summary.added + summary.updated + summary.removed > 0
    || JSON.stringify(plan.questions) !== JSON.stringify(base.questions)
  return { plan, summary, changed }
}
