import { locationQuestion } from './planPersistence.js'

/** The stop's location question, if it has one. */
export function locationQuestionFor(plan, stopId) {
  return plan.questions?.find((question) => question.stopId === stopId && question.field === 'location') ?? null
}

/** The location text a Calendar import quoted in its question, or null. */
export function calendarLocationText(question) {
  const match = /Calendar says: "(.+)"\.$/.exec(question?.prompt ?? '')
  return match ? match[1] : null
}

/** 'set' | 'needed' | 'none' (the person said no place is needed). */
export function placeStatus(plan, stop) {
  if (stop.location !== null) return 'set'
  return locationQuestionFor(plan, stop.id)?.status === 'deferred' ? 'none' : 'needed'
}

function withQuestion(plan, stop, status) {
  const existing = locationQuestionFor(plan, stop.id)
  const question = { ...(existing ?? locationQuestion(stop)), status }
  return existing
    ? plan.questions.map((q) => (q === existing ? question : q))
    : [...(plan.questions ?? []), question]
}

/**
 * Give a stop a place (`location`) or record that it needs none (`null`).
 * Times never change. Returns the same plan when the stop is missing or
 * nothing would change.
 *
 * @param {object} plan
 * @param {string} stopId
 * @param {{ label: string, placeId: string | null, lat: number, lng: number } | null} location
 */
export function setStopLocation(plan, stopId, location) {
  const stop = plan.stops.find((candidate) => candidate.id === stopId)
  if (!stop) return plan
  if (location === null) {
    if (placeStatus(plan, stop) === 'none') return plan
    return {
      ...plan,
      stops: plan.stops.map((s) => (s.id === stopId ? { ...s, location: null } : s)),
      legs: (plan.legs ?? []).filter((leg) => leg.fromStopId !== stopId && leg.toStopId !== stopId),
      questions: withQuestion(plan, stop, 'deferred'),
    }
  }
  const same = stop.location && stop.location.lat === location.lat && stop.location.lng === location.lng
    && stop.location.label === location.label
  if (same) return plan
  const next = { label: location.label, placeId: location.placeId ?? null, lat: location.lat, lng: location.lng }
  return {
    ...plan,
    stops: plan.stops.map((s) => (s.id === stopId ? { ...s, location: next } : s)),
    legs: (plan.legs ?? []).filter((leg) => leg.fromStopId !== stopId && leg.toStopId !== stopId),
    questions: locationQuestionFor(plan, stopId) ? withQuestion(plan, stop, 'answered') : plan.questions,
  }
}
