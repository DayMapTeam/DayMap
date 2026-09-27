import assert from 'node:assert/strict'
import test from 'node:test'
import { travelChipSvg } from './travelChip.js'

const colors = { ring: '#ffffff', label: '#1c1c1e', font: "'Instrument Sans', sans-serif" }

test('the chip is as wide as its text and escapes it', () => {
  const svg = travelChipSvg({ label: 'Bus <H30> · 22 min' }, colors, 80)
  assert.match(svg, /width="100"/)
  assert.match(svg, /Bus &lt;H30&gt; · 22 min<\/text>/)
  assert.doesNotMatch(svg, /opacity/)
  assert.match(travelChipSvg({ label: 'Walk · 5 min', faded: true }, colors, 60), /opacity="0.6"/)
})
