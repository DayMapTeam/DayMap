// Where a popup goes relative to a clicked pin, in container pixels.
//
// The anchor is the click point, which lands on the pin head, so the head's
// edge is taken to be HEAD_RADIUS away from it. The popup's pointer tip stops
// GAP short of the pin.

const HEAD_RADIUS = 18
const GAP = 6 // between the pointer tip and the pin
const POINTER_DEPTH = 8 // how far the rotated 12px pointer sticks out of the popup
// Below the pin, the popup must clear the stem and ground dot under the head.
const PIN_FOOT = 66 // head centre → bottom of the ground dot (map/stopMarker.js)
const POINTER_EDGE = 20 // keep the pointer clear of the rounded corners

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Above the pin when it fits, otherwise below its ground dot; always inside
 * `bounds`. The 3D map cannot report a pin's screen position, so the camera
 * is not panned to make room; the popup flips instead.
 *
 * @param {object} input
 * @param {{ x: number, y: number }} input.anchor
 * @param {number} input.width
 * @param {number} input.height
 * @param {{ left: number, top: number, right: number, bottom: number }} input.bounds
 * @returns {{ left: number, top: number, placement: 'above' | 'below', pointerX: number }}
 */
export function placePopup({ anchor, width, height, bounds }) {
  const offset = GAP + POINTER_DEPTH
  const above = anchor.y - HEAD_RADIUS - offset - height
  const placement = above >= bounds.top ? 'above' : 'below'
  const preferredTop = placement === 'above' ? above : anchor.y + PIN_FOOT + offset
  const top = clamp(preferredTop, bounds.top, Math.max(bounds.top, bounds.bottom - height))
  const left = clamp(anchor.x - width / 2, bounds.left, Math.max(bounds.left, bounds.right - width))
  const pointerX = clamp(anchor.x - left, POINTER_EDGE, width - POINTER_EDGE)
  return { left, top, placement, pointerX }
}
