// The travel chip at the top of each journey's arc. Pure: label in, SVG out.

import { withAlpha } from './journeyArc.js'

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
