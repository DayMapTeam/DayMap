import { useMemo } from 'react'
import { buildJourneyLegs } from './journeyLegs.js'

/**
 * The shown plan's journeys for the map: each one's two stops, its state at
 * `now` and its travel chip text. Nothing is requested from Google: the map
 * draws a direct destination line, not the roads.
 *
 * @param {ReturnType<import('./usePlanAnalysis.js').usePlanAnalysis>} planning
 * @param {Date} now
 * @returns {{ id: string, state: string, path: object[], label: string }[]}
 */
export function useJourneyLegs(planning, now) {
  const { analysis: { legs }, shown: { stops } } = planning
  return useMemo(() => buildJourneyLegs(legs, stops, now), [legs, stops, now])
}
