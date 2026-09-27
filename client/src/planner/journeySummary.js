import { formatClock } from '../components/formatTime.js'

const SPOKEN = { walk: 'Walk', drive: 'Drive', transit: 'Public transport' }

const CHANGE_WORTH_MS = 10 * 60000
const rides = (option) => option.steps.filter((step) => step.kind === 'ride').length

/**
 * The service a journey summary shows: the one the user picked, otherwise,
 * among those arriving within 10 minutes of the earliest, the one with the
 * fewest changes (then the earliest).
 */
export function pickService(services) {
  if (services?.status !== 'ready' || !services.options.length) return null
  const chosen = services.chosenId != null && services.options.find((option) => option.id === services.chosenId)
  if (chosen) return chosen
  const earliest = Math.min(...services.options.map((option) => Date.parse(option.arriveAt)))
  return services.options
    .filter((option) => Date.parse(option.arriveAt) - earliest <= CHANGE_WORTH_MS)
    .sort((a, b) => rides(a) - rides(b) || Date.parse(a.arriveAt) - Date.parse(b.arriveAt))[0]
}

/**
 * A Google Maps–style summary of one journey: the steps as icons and line
 * badges, and when to leave. Null when the journey has no verified estimate.
 *
 * @param {object | undefined} leg The analysed leg.
 * @param {object | null} service A public-transport option (transitOptions.js), if known.
 * @param {string} timezone
 * @returns {{ steps: object[], leaveAt: string, label: string } | null}
 */
export function journeySummary(leg, service, timezone) {
  if (leg?.status !== 'ready' || leg.provider === 'same-place') return null
  let steps
  let leaveAt = leg.departAt
  if (leg.mode === 'transit' && service) {
    steps = service.steps.map((step) => (step.kind === 'walk'
      ? { kind: 'walk' }
      : { kind: 'ride', name: step.name, vehicle: step.vehicle, color: step.color, textColor: step.textColor }))
    leaveAt = service.leaveAt
  } else {
    steps = [{ kind: leg.mode }]
  }
  const words = steps.map((step) => (step.kind === 'ride' ? `${step.vehicle.toLowerCase()} ${step.name}` : SPOKEN[step.kind]?.toLowerCase() ?? step.kind))
  const spoken = words.join(', ')
  const leave = `Leave ${formatClock(leaveAt, timezone)}`
  return { steps, leaveAt, leave, label: `${spoken.charAt(0).toUpperCase()}${spoken.slice(1)}. ${leave}` }
}
