// Journeys on the 3D map: each one is a destination line from one stop to
// the next, curved and raised over the city like a flight path on a travel
// map. It never follows roads. Pure: stops in, points and styles out.

import { distanceMeters } from '../trip/tripRules.js'

// 48 segments; odd point count so the middle point is the apex.
const ARC_POINTS = 49
const HEIGHT = { perMeter: 0.15, min: 60, max: 150 }
// How far the line bows sideways at its middle, as a share of its length.
const BEND = 0.12
const METERS_PER_DEGREE = 111320

/** How high a journey's arc rises, in metres: 15% of its length, 60–150 m. */
export function arcHeight(meters) {
  const height = (Number.isFinite(meters) ? meters : 0) * HEIGHT.perMeter
  return Math.min(HEIGHT.max, Math.max(HEIGHT.min, height))
}

/**
 * The destination line from `from` to `to`: a smooth curve that bows a
 * little to the right of the direction of travel (so a trip there and back
 * draws two lines, not one) and is lifted by sin(πt) × height, so both ends
 * sit on the ground at the stops and the middle is the highest point.
 *
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 */
export function arcPath(from, to) {
  const meters = distanceMeters(from, to)
  const height = arcHeight(meters)
  // Local flat metres around the start: plenty accurate across a city.
  const perLng = METERS_PER_DEGREE * Math.cos((from.lat * Math.PI) / 180)
  const east = (to.lng - from.lng) * perLng
  const north = (to.lat - from.lat) * METERS_PER_DEGREE
  const length = Math.hypot(east, north)
  // Unit vector to the right of travel.
  const right = length === 0 ? { east: 0, north: 0 } : { east: north / length, north: -east / length }
  return Array.from({ length: ARC_POINTS }, (_, i) => {
    const t = i / (ARC_POINTS - 1)
    const lift = Math.sin(Math.PI * t)
    const side = lift * BEND * length
    return {
      lat: from.lat + (north * t + right.north * side) / METERS_PER_DEGREE,
      lng: from.lng + (east * t + right.east * side) / perLng,
      altitude: lift * height,
    }
  })
}

/** The arc's highest point, where the travel chip sits. */
export function arcApex(arc) {
  return arc[Math.floor(arc.length / 2)]
}

/** '#0a84ff' → 'rgba(10, 132, 255, 0.5)'. Other colours are returned unchanged. */
export function withAlpha(color, alpha) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color?.trim() ?? '')
  if (!hex) return color
  const value = parseInt(hex[1], 16)
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

// The glow: the line's own outer edge, in its colour at this share of the
// core's opacity. One element per journey: a separate, wider glow line on
// the same path hides the core (they sit at the same depth).
const GLOW = { alpha: 0.3, width: 3.5 }

/**
 * How a journey is drawn for its state: a bright core line inside a soft,
 * wider glow of the same colour. The current one is blue, those still to
 * come white, those done light grey and see-through.
 *
 * `width` is the whole line with its glow, in pixels; `outerWidth` is the
 * glow's share of it (0–1), as Polyline3DElement takes it.
 *
 * @param {'done' | 'current' | 'next' | 'later'} state
 * @param {Record<string, string>} colors From markerColors().
 */
export function arcStyle(state, colors) {
  const glowing = (color, core, alpha = 1) => ({
    stroke: withAlpha(color, alpha),
    outer: withAlpha(color, GLOW.alpha * alpha),
    width: core * GLOW.width,
    outerWidth: 1 - 1 / GLOW.width,
  })
  if (state === 'current') return { ...glowing(colors.accent, 7), zIndex: 4, occluded: true }
  if (state === 'done') return { ...glowing(colors.routeDone, 5, 0.5), zIndex: 1, occluded: false }
  return { ...glowing(colors.ring, 6), zIndex: state === 'next' ? 3 : 2, occluded: false }
}
