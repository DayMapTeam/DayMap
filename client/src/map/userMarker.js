// "You are here": a blue dot on a short pointer. 3D markers anchor the SVG's
// bottom-centre to the position, so the pointer's tip is the exact spot.
// A simulated position is drawn dashed, so it is never mistaken for real GPS.

const SIZE = 32
const DOT = { cx: 16, cy: 13, r: 8 }
const TIP_Y = 31

/** @param {Record<string, string>} colors From markerColors(). */
export function userMarkerSvg(colors, { simulated = false } = {}) {
  const { cx, cy, r } = DOT
  const ring = simulated
    ? `stroke="${colors.ring}" stroke-width="3" stroke-dasharray="3 2.5"`
    : `stroke="${colors.ring}" stroke-width="3"`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`,
    `<defs><filter id="dm-user-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="${colors.shadow}"/></filter></defs>`,
    `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="${colors.dotHalo}"/>`,
    `<g filter="url(#dm-user-shadow)">`,
    `<path d="M${cx - 5} ${cy + 5} L${cx} ${TIP_Y} L${cx + 5} ${cy + 5} Z" fill="${colors.accent}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors.accent}" ${ring}/>`,
    '</g>',
    '</svg>',
  ].join('')
}
