// The one map pin: a numbered head on a stem above a ground dot. The ground
// dot (bottom-centre of the SVG) is the stop's exact position.
//
// 3D markers draw their SVG as an image, so it cannot read CSS variables. The
// colours are read from the tokens once (markerColors) and passed in.

const WIDTH = 44
const HEAD = { cx: 22, cy: 26, r: 18 }
const STEM_TOP = 46
const STEM_HEIGHT = { normal: 40, steep: 28 } // shorter above 45° tilt
const DOT_RADIUS = 5
const SELECTED_SCALE = 0.85

// Token name → key used by stopMarkerSvg.
const COLOR_TOKENS = {
  fixed: '--label',
  flexible: '--blue',
  allDay: '--label-2',
  accent: '--blue',
  ring: '--solid',
  clash: '--red',
  shifted: '--orange',
  halo: '--marker-halo',
  dotHalo: '--marker-dot-halo',
  shadow: '--marker-shadow-color',
  font: '--font-sans',
  label: '--label',
  routeDone: '--route-done',
}

/** Read marker colours from the design tokens. Browser only. */
export function markerColors(element = document.documentElement) {
  const style = getComputedStyle(element)
  return Object.fromEntries(
    Object.entries(COLOR_TOKENS).map(([key, token]) => [key, style.getPropertyValue(token).trim()]),
  )
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function headContent({ type, number }, colors, radius) {
  const { cx, cy } = HEAD
  if (type === 'search') {
    return `<circle cx="${cx}" cy="${cy}" r="4" fill="${colors.accent}"/>`
  }
  if (type === 'ghost') {
    const arm = radius * 0.4
    return `<path d="M${cx - arm} ${cy}h${arm * 2}M${cx} ${cy - arm}v${arm * 2}" stroke="${colors.accent}" stroke-width="2.5" stroke-linecap="round"/>`
  }
  return `<text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="${colors.ring}" font-family="${escapeAttribute(colors.font)}" font-size="15" font-weight="700" style="font-variant-numeric: tabular-nums">${Number(number)}</text>`
}

/**
 * SVG markup for a pin.
 *
 * @param {object} input
 * @param {number} [input.number] Stop number, for fixed/flexible/all-day pins.
 * @param {'fixed' | 'flexible' | 'all-day' | 'search' | 'ghost'} input.type
 * @param {{ selected?: boolean, clash?: boolean, past?: boolean, previewShifted?: boolean }} [input.state]
 * @param {boolean} [input.steep] Camera tilted above 45°: shorter stem.
 * @param {Record<string, string>} colors From markerColors().
 */
export function stopMarkerSvg({ number, type, state = {}, steep = false }, colors) {
  const { cx, cy } = HEAD
  const stemHeight = steep ? STEM_HEIGHT.steep : STEM_HEIGHT.normal
  const dotY = STEM_TOP + stemHeight + 1
  const height = dotY + DOT_RADIUS + 2
  const radius = state.selected ? Math.round(HEAD.r * SELECTED_SCALE * 10) / 10 : HEAD.r
  const outline = type === 'search' || type === 'ghost'
  const typeColor = { fixed: colors.fixed, flexible: colors.flexible, 'all-day': colors.allDay }[type] ?? colors.accent
  const head = outline
    ? `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${colors.ring}" stroke="${colors.accent}" stroke-width="2" stroke-dasharray="4 3"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${typeColor}" stroke="${colors.ring}" stroke-width="3"/>`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">`,
    '<defs>',
    `<filter id="dm-head-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="${colors.shadow}"/></filter>`,
    `<filter id="dm-stem-shadow" x="-200%" y="-50%" width="500%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="1" flood-color="${colors.shadow}"/></filter>`,
    '</defs>',
    `<g${state.past ? ' opacity="0.45"' : ''}>`,
    state.selected ? `<circle cx="${cx}" cy="${dotY}" r="${DOT_RADIUS + 6}" fill="${colors.dotHalo}"/>` : '',
    `<g filter="url(#dm-stem-shadow)">`,
    `<rect x="${cx - 1}" y="${STEM_TOP}" width="2" height="${stemHeight}" fill="${colors.ring}"/>`,
    `<circle cx="${cx}" cy="${dotY}" r="${DOT_RADIUS}" fill="${colors.ring}" stroke="${state.previewShifted ? colors.shifted : typeColor}" stroke-width="3"/>`,
    '</g>',
    state.selected ? `<circle cx="${cx}" cy="${cy}" r="22" fill="${colors.halo}"/>` : '',
    state.clash ? `<circle cx="${cx}" cy="${cy}" r="${radius + 3}" fill="none" stroke="${colors.clash}" stroke-width="3"/>` : '',
    `<g filter="url(#dm-head-shadow)">${head}</g>`,
    headContent({ type, number }, colors, radius),
    '</g>',
    '</svg>',
  ].join('')
}

/** A <template> holding the pin SVG, the content 3D markers accept. Browser only. */
export function markerTemplate(svg) {
  const template = document.createElement('template')
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  template.content.append(document.importNode(parsed.documentElement, true))
  return template
}
