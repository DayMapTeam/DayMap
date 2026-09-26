import assert from 'node:assert/strict'
import test from 'node:test'
import { placePopup } from './popupPosition.js'

// 1280×800 window: 52px header, 360px planner docked right, 16px margins.
const bounds = { left: 16, top: 68, right: 888, bottom: 784 }
const size = { width: 272, height: 260 }

test('sits centred above the anchor, 10px clear of the tail', () => {
  const layout = placePopup({ anchor: { x: 400, y: 500 }, ...size, bounds })
  assert.deepEqual(layout, { left: 264, top: 222, placement: 'above', tailX: 136 })
})

test('flips below when there is no room above', () => {
  const layout = placePopup({ anchor: { x: 400, y: 150 }, ...size, bounds })
  assert.equal(layout.placement, 'below')
  assert.equal(layout.top, 168)
})

test('never slides under the planner, and the tail still points at the anchor', () => {
  const layout = placePopup({ anchor: { x: 860, y: 500 }, ...size, bounds })
  assert.equal(layout.left, 888 - 272)
  assert.equal(layout.tailX, 860 - 616)
})

test('keeps the tail away from the rounded corners near the edge', () => {
  const layout = placePopup({ anchor: { x: 20, y: 500 }, ...size, bounds })
  assert.equal(layout.left, 16)
  assert.equal(layout.tailX, 20)
})
