import assert from 'node:assert/strict'
import test from 'node:test'
import { numberStops } from '../app/stopNumbers.js'
import { stopMarkerSvg } from './stopMarker.js'

const colors = {
  fixed: '#1c1c1e', flexible: '#0a84ff', allDay: '#6e6e73', accent: '#0a84ff', ring: '#ffffff',
  clash: '#ff3b30', shifted: '#ff9f0a', halo: 'rgba(10, 132, 255, 0.35)', dotHalo: 'rgba(10, 132, 255, 0.25)',
  shadow: 'rgba(0, 0, 0, 0.35)', font: "'Instrument Sans', sans-serif",
}

test('stop numbers follow the plan order', () => {
  const numbers = numberStops([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  assert.deepEqual([...numbers], [['a', 1], ['b', 2], ['c', 3]])
})

test('fixed and flexible pins show their number in the type colour', () => {
  const fixed = stopMarkerSvg({ number: 1, type: 'fixed' }, colors)
  const flexible = stopMarkerSvg({ number: 2, type: 'flexible' }, colors)
  assert.match(fixed, /r="18" fill="#1c1c1e"/)
  assert.match(fixed, />1<\/text>/)
  assert.match(flexible, /r="18" fill="#0a84ff"/)
  assert.match(flexible, />2<\/text>/)
})

test('the ground dot sits at the bottom-centre of the SVG', () => {
  const svg = stopMarkerSvg({ number: 1, type: 'flexible' }, colors)
  const height = Number(svg.match(/height="(\d+)"/)[1])
  const dot = svg.match(/<circle cx="22" cy="(\d+)" r="5"/)
  assert.equal(height, 94)
  assert.equal(Number(dot[1]) + 5 + 2, height)
})

test('a steep camera shortens the stem', () => {
  const normal = stopMarkerSvg({ number: 1, type: 'fixed' }, colors)
  const steep = stopMarkerSvg({ number: 1, type: 'fixed', steep: true }, colors)
  assert.match(normal, /height="40"/)
  assert.match(steep, /height="28"/)
})

test('selected shrinks the head and adds halos; past fades the whole pin', () => {
  const svg = stopMarkerSvg({ number: 3, type: 'flexible', state: { selected: true, past: true } }, colors)
  assert.match(svg, /r="15.3" fill="#0a84ff"/)
  assert.match(svg, /r="22" fill="rgba\(10, 132, 255, 0.35\)"/)
  assert.match(svg, /r="11" fill="rgba\(10, 132, 255, 0.25\)"/)
  assert.match(svg, /<g opacity="0.45">/)
})

test('clash and preview-shifted keep the type colour and add their signal', () => {
  const svg = stopMarkerSvg({ number: 1, type: 'fixed', state: { clash: true, previewShifted: true } }, colors)
  assert.match(svg, /fill="#1c1c1e"/)
  assert.match(svg, /stroke="#ff3b30"/)
  assert.match(svg, /stroke="#ff9f0a" stroke-width="3"/)
})

test('search pins are dashed with a dot and no number', () => {
  const svg = stopMarkerSvg({ type: 'search' }, colors)
  assert.match(svg, /stroke-dasharray/)
  assert.doesNotMatch(svg, /<text/)
})
