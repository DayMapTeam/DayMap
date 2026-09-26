// Words for the add flows. Always say what moves, what stays fixed, and why,
// and what travel was allowed for (or that it isn't known yet).
import { formatClock, formatTimeRange } from '../components/formatTime.js'


const VALIDATION = {
  'missing-title': 'Search for a place, or type a name to add it without one.',
  'title-too-long': 'Keep the name under 120 characters.',
  'invalid-duration': 'Choose a length between 5 minutes and 8 hours.',
  'missing-time': 'Enter a start and an end time.',
  'end-before-start': 'The end time needs to be after the start time.',
}

function findStop(plan, stopId) {
  return plan.stops.find((stop) => stop.id === stopId)
}

function nameWithKind(stop) {
  return stop.timing.kind === 'fixed' ? `${stop.title} (fixed)` : stop.title
}

function listNames(names) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** "Moves Library study later." (or "Moved…" once done), or "". */
function describeMoves(option, plan, verb = 'Moves') {
  if (option.shiftedStopIds.length === 0) return ''
  const names = option.shiftedStopIds.map((stopId) => findStop(plan, stopId).title)
  return `${verb} ${listNames(names)} later.`
}

/** "10 min spare before Library study." or "". */
function describeSpare(option, plan) {
  if (option.nextStopId === null) return ''
  const next = nameWithKind(findStop(plan, option.nextStopId))
  if (option.spareMinutes === 0) return `Ends just as ${next} starts.`
  return `${option.spareMinutes} min spare before ${next}.`
}

/**
 * The journeys a fit allowed for: "Allows 25 min to get there from Morning
 * lecture and 15 min to get to Library study." Unknown travel is said plainly.
 */
export function describeTravel(option, plan) {
  const legs = option.journeys ?? []
  if (legs.some((leg) => leg.status === 'pending')) return 'Checking travel time…'
  const parts = legs.filter((leg) => leg.status === 'ready' && leg.minutes > 0).map((leg) => {
    const outbound = findStop(plan, leg.toStopId)
    return outbound
      ? `${leg.minutes} min to get to ${outbound.title}`
      : `${leg.minutes} min to get there from ${findStop(plan, leg.fromStopId).title}`
  })
  const notes = []
  if (parts.length) notes.push(`Allows ${listNames(parts)}.`)
  if (legs.some((leg) => leg.status === 'no-place')) notes.push('Travel isn’t included where a stop has no place.')
  if (legs.some((leg) => leg.status === 'unavailable')) notes.push('Some travel times are unavailable and aren’t included.')
  return notes.join(' ')
}

/** Why an option doesn't fit, in one sentence. */
export function describeReason(reason, plan, kind) {
  const stop = reason.stopId ? findStop(plan, reason.stopId) : null
  switch (reason.code) {
    case 'late':
      return `${kind === 'flexible' ? 'Too long. ' : ''}You’d be ${reason.minutesLate} min late for ${nameWithKind(stop)}.`
    case 'outside-window':
      return `${stop.title} would have to finish after ${formatClock(stop.timing.latestEndAt, plan.timezone)}, the end of its window.`
    case 'overlaps': {
      const range = formatTimeRange(stop.timing.scheduledStartAt, stop.timing.scheduledEndAt, plan.timezone)
      return stop.timing.kind === 'fixed'
        ? `Overlaps ${stop.title} (${range}, fixed).`
        : `Overlaps ${stop.title} (${range}). Choose a time after it ends, or edit it first.`
    }
    case 'in-past':
      return 'That time has already passed.'
    default:
      return 'This doesn’t fit your day.'
  }
}

/** For a fixed new stop the journey there makes late: "You'd arrive about 10 min late from Morning lecture." */
function describeLateArrival(option, plan) {
  if (!option.lateArrivalMinutes) return ''
  return `You’d arrive about ${option.lateArrivalMinutes} min late from ${findStop(plan, option.afterStopId).title}.`
}

/**
 * The live line under an add form.
 *
 * @returns {{ tone: 'neutral' | 'ok' | 'bad', text: string }}
 */
export function describeVerdict(fit, option, plan, kind) {
  if (fit.error === 'missing-title') return { tone: 'neutral', text: VALIDATION['missing-title'] }
  if (fit.error !== null) return { tone: 'bad', text: VALIDATION[fit.error] }
  if (option === null) return { tone: 'bad', text: 'There’s no free time left in your day to fit this in.' }
  if (!option.ok) return { tone: 'bad', text: describeReason(option.reason, plan, kind) }
  const range = formatTimeRange(option.startAt, option.endAt, plan.timezone)
  const after = option.afterStopId === null ? '' : ` after ${findStop(plan, option.afterStopId).title}`
  return {
    tone: 'ok',
    text: [`${range}${after}.`, describeLateArrival(option, plan), describeMoves(option, plan), describeSpare(option, plan),
      describeTravel(option, plan)]
      .filter(Boolean)
      .join(' '),
  }
}

// The first fixed stop after the new one, which the user most wants to hear about.
function nextFixedStop(option, stopId) {
  const stops = option.plan.stops
  return stops.slice(stops.findIndex((stop) => stop.id === stopId) + 1).find((stop) => stop.timing.kind === 'fixed')
}

/** Toast after adding: "Added Coffee. Moved Library study later." */
export function describeAdded(option, plan, stopId, title) {
  const fixed = nextFixedStop(option, stopId)
  return [
    `Added ${title.trim()}.`,
    describeMoves(option, plan, 'Moved'),
    fixed ? `${fixed.title} still at ${formatClock(fixed.timing.scheduledStartAt, plan.timezone)}.` : '',
  ].filter(Boolean).join(' ')
}

/** "Exchange Specialty Coffee, Leigh Street, Adelaide" → name and the rest. */
export function splitPlaceLabel(label) {
  const comma = label.indexOf(',')
  if (comma === -1) return { name: label, rest: '' }
  return { name: label.slice(0, comma), rest: label.slice(comma + 1).trim() }
}
