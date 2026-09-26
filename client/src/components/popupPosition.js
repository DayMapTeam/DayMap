// Where a popup goes relative to an anchor point, in container pixels.

const GAP = 10 // between the anchor and the tail tip
const TAIL_DEPTH = 8 // how far the rotated 12px tail sticks out of the popup
const TAIL_EDGE = 20 // keep the tail clear of the rounded corners

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Above the anchor when it fits, otherwise below; always inside `bounds`.
 *
 * @param {object} input
 * @param {{ x: number, y: number }} input.anchor
 * @param {number} input.width
 * @param {number} input.height
 * @param {{ left: number, top: number, right: number, bottom: number }} input.bounds
 * @returns {{ left: number, top: number, placement: 'above' | 'below', tailX: number }}
 */
export function placePopup({ anchor, width, height, bounds }) {
  const offset = GAP + TAIL_DEPTH
  const above = anchor.y - offset - height
  const placement = above >= bounds.top ? 'above' : 'below'
  const preferredTop = placement === 'above' ? above : anchor.y + offset
  const top = clamp(preferredTop, bounds.top, Math.max(bounds.top, bounds.bottom - height))
  const left = clamp(anchor.x - width / 2, bounds.left, Math.max(bounds.left, bounds.right - width))
  const tailX = clamp(anchor.x - left, TAIL_EDGE, width - TAIL_EDGE)
  return { left, top, placement, tailX }
}
