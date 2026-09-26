import assert from 'node:assert/strict'
import test from 'node:test'
import { placePopup } from './popupPosition.js'

// 1280×800 window: 52px header, 360px planner docked right, 12px margins.
const bounds = { left: 12, top: 64, right: 892, bottom: 788 }
const size = { width: 250, height: 260 }

test('sits centred above the pin head, the pointer 6px short of it', () => {
  const layout = placePopup({ anchor: { x: 400, y: 500 }, ...size, bounds })
  assert.deepEqual(layout, { left: 275, top: 500 - 18 - 14 - 260, placement: 'above', pointerX: 125 })
})

test('flips below the ground dot when there is no room above', () => {
  const layout = placePopup({ anchor: { x: 400, y: 150 }, ...size, bounds })
  assert.equal(layout.placement, 'below')
  assert.equal(layout.top, 150 + 66 + 14)
})

test('never slides under the planner, and the pointer stays on the pin', () => {
  const layout = placePopup({ anchor: { x: 860, y: 500 }, ...size, bounds })
  assert.equal(layout.left, 892 - 250)
  assert.equal(layout.pointerX, 860 - 642)
})

test('keeps the pointer away from the rounded corners near the edge', () => {
  const layout = placePopup({ anchor: { x: 20, y: 500 }, ...size, bounds })
  assert.equal(layout.left, 12)
  assert.equal(layout.pointerX, 20)
})
