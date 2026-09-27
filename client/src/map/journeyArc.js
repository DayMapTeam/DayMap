// Journeys on the 3D map: each one is an arc raised over the route it
// follows. Pure: paths in, points, styles and chip SVG out.

import { distanceMeters } from '../trip/tripRules.js'

// 48 segments along the route; odd point count so the middle point is the apex.
const ARC_POINTS = 49
const HEIGHT = { perMeter: 0.15, min: 60, max: 150 }

/** How high a journey's arc rises, in metres: 15% of its length, 60–150 m. */
export function arcHeight(meters) {
  const height = (Number.isFinite(meters) ? meters : 0) * HEIGHT.perMeter
  return Math.min(HEIGHT.max, Math.max(HEIGHT.min, height))
}

/** `count` points spaced evenly by distance along `path` (at least 2 points). */
export function samplePath(path, count) {
  const along = [0]
  for (let i = 1; i < path.length; i++) along.push(along[i - 1] + distanceMeters(path[i - 1], path[i]))
  const total = along.at(-1)
  if (total === 0) return Array.from({ length: count }, () => ({ lat: path[0].lat, lng: path[0].lng }))
  const points = []
  let segment = 1
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1)
    while (segment < path.length - 1 && along[segment] < target) segment++
    const a = path[segment - 1]
    const b = path[segment]
    const length = along[segment] - along[segment - 1]
    const t = length === 0 ? 0 : Math.min(1, Math.max(0, (target - along[segment - 1]) / length))
    points.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
  }
  return points
}

/**
 * The arc over a route: points along it, lifted by sin(πt) × height, so both
 * ends sit on the ground at the stops and the middle is the highest point.
 */
export function arcPath(path, meters) {
  const height = arcHeight(meters)
  return samplePath(path, ARC_POINTS).map((point, i) => ({
    ...point,
    altitude: Math.sin((Math.PI * i) / (ARC_POINTS - 1)) * height,
  }))
}

/** The arc's highest point, where the travel chip sits. */
export function arcApex(arc) {
  return arc[Math.floor(arc.length / 2)]
}

// Walking dashes, in metres along the arc: the same size on every journey.
const DASH = { on: 12, gap: 12 }

/**
 * A walking arc cut into short dashes of the same length, whatever the
 * journey's length. The 3D map can't dash a line, and walking must read
 * differently from riding without colour.
 */
export function dashes(points, { on = DASH.on, gap = DASH.gap } = {}) {
  const along = [0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    along.push(along[i - 1] + Math.hypot(distanceMeters(a, b), (b.altitude ?? 0) - (a.altitude ?? 0)))
  }
  const total = along.at(-1)
  let segment = 1
  // The point `meters` along the arc; `segment` only moves forward.
  const at = (meters) => {
    while (segment < points.length - 1 && along[segment] < meters) segment++
    const a = points[segment - 1]
    const b = points[segment]
    const length = along[segment] - along[segment - 1]
    const t = length === 0 ? 0 : Math.min(1, Math.max(0, (meters - along[segment - 1]) / length))
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t,
      altitude: (a.altitude ?? 0) + ((b.altitude ?? 0) - (a.altitude ?? 0)) * t }
  }
  const result = []
  for (let start = 0; start < total; start += on + gap) {
    const end = Math.min(total, start + on)
    const first = at(start)
    const firstSegment = segment
    const last = at(end)
    // Keep the arc's own points inside the dash, so it still curves.
    const inside = points.slice(firstSegment, segment).filter((_, i) => along[firstSegment + i] > start && along[firstSegment + i] < end)
    result.push([first, ...inside, last])
  }
  return result
}

/** '#0a84ff' → 'rgba(10, 132, 255, 0.5)'. Other colours are returned unchanged. */
export function withAlpha(color, alpha) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color?.trim() ?? '')
  if (!hex) return color
  const value = parseInt(hex[1], 16)
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

/**
 * How a journey is drawn for its state: the current one blue, those still
 * to come white, those done grey. `ground` is the faint route on the ground
 * under the current journey; the others are only their arc.
 *
 * @param {'done' | 'current' | 'next' | 'later'} state
 * @param {Record<string, string>} colors From markerColors().
 */
export function arcStyle(state, colors) {
  if (state === 'current') {
    return {
      stroke: colors.accent, width: 10, outer: colors.ring, outerWidth: 0.3,
      ground: withAlpha(colors.accent, 0.55), zIndex: 4, occluded: true,
    }
  }
  if (state === 'done') {
    return {
      stroke: withAlpha(colors.routeDone, 0.55), width: 8, outer: null, outerWidth: 0,
      ground: null, zIndex: 1, occluded: false,
    }
  }
  return {
    stroke: withAlpha(colors.ring, 0.88), width: 8, outer: 'rgba(0, 0, 0, 0.25)', outerWidth: 0.3,
    ground: null, zIndex: state === 'next' ? 3 : 2, occluded: false,
  }
}

const CHIP = { fontSize: 10, padX: 7, height: 17, margin: 3, gap: 5 }

/** The CSS font a chip's text is drawn in, for measuring it. */
export function chipFont(colors) {
  return `600 ${CHIP.fontSize}px ${colors.font}`
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The travel chip over a journey's arc: a white pill with how you travel and
 * for how long. 3D markers anchor the SVG's bottom-centre to the position,
 * so the pill floats a little above the arc's apex. Done journeys are faded.
 *
 * @param {{ label: string, faded?: boolean }} chip
 * @param {Record<string, string>} colors From markerColors().
 * @param {number} textWidth The label's measured width in pixels.
 */
export function travelChipSvg({ label, faded = false }, colors, textWidth) {
  const { fontSize, padX, height, margin, gap } = CHIP
  const pill = Math.ceil(textWidth) + 2 * padX
  const width = pill + 2 * margin
  const svgHeight = margin + height + margin + gap
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${svgHeight}" viewBox="0 0 ${width} ${svgHeight}">`,
    `<defs><filter id="dm-chip-shadow" x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0, 0, 0, 0.16)"/></filter></defs>`,
    `<g${faded ? ' opacity="0.6"' : ''}>`,
    `<rect x="${margin}" y="${margin}" width="${pill}" height="${height}" rx="${height / 2}" fill="${withAlpha(colors.ring, 0.92)}" filter="url(#dm-chip-shadow)"/>`,
    `<text x="${width / 2}" y="${margin + height / 2 + fontSize * 0.35}" text-anchor="middle" fill="${colors.label}" font-family="${escapeText(colors.font).replace(/"/g, '&quot;')}" font-size="${fontSize}" font-weight="600" style="font-variant-numeric: tabular-nums">${escapeText(label)}</text>`,
    '</g>',
    '</svg>',
  ].join('')
}
