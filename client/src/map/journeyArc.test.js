import assert from 'node:assert/strict'
import test from 'node:test'
import { distanceMeters } from '../trip/tripRules.js'
import { arcApex, arcHeight, arcPath, arcStyle, dashes, samplePath, travelChipSvg, withAlpha } from './journeyArc.js'

const colors = { accent: '#0a84ff', ring: '#ffffff', label: '#1c1c1e', routeDone: '#8e8e93', font: "'Instrument Sans', sans-serif" }
// An L-shaped route: 1 km east, then 1 km north.
const east = { lat: -34.92, lng: 138.6 + 1000 / (111320 * Math.cos((34.92 * Math.PI) / 180)) }
const route = [{ lat: -34.92, lng: 138.6 }, east, { lat: east.lat + 1000 / 111320, lng: east.lng }]

test('arcs rise 15% of the journey, between 60 and 150 m', () => {
  assert.equal(arcHeight(200), 60)
  assert.equal(arcHeight(800), 120)
  assert.equal(arcHeight(5000), 150)
  assert.equal(arcHeight(undefined), 60)
})

test('points are spaced evenly along the route and follow its turns', () => {
  const points = samplePath(route, 5)
  assert.equal(points.length, 5)
  assert.ok(distanceMeters(points[2], east) < 2, 'the middle point is the corner')
  assert.deepEqual(points[0], route[0])
  assert.ok(distanceMeters(points[4], route[2]) < 0.01)
})

test('the arc starts and ends on the ground at the stops and peaks in the middle', () => {
  const arc = arcPath(route, 2000)
  assert.equal(arc.length, 49)
  assert.equal(arc[0].altitude, 0)
  assert.ok(Math.abs(arc.at(-1).altitude) < 1e-9)
  assert.equal(arcApex(arc).altitude, 150)
  assert.ok(arc.every((point) => point.altitude <= 150))
})

const arcLength = (points) => points.slice(1).reduce((sum, b, i) => sum
  + Math.hypot(distanceMeters(points[i], b), b.altitude - points[i].altitude), 0)

test('walking dashes are the same length on short and long journeys', () => {
  const long = dashes(arcPath(route, 2000))
  const short = dashes(arcPath(route.slice(0, 2), 1000).slice(0, 10))
  for (const piece of [long[3], long[40], short[1]]) assert.ok(Math.abs(arcLength(piece) - 12) < 0.01)
  assert.ok(long.length > short.length * 5, 'a longer walk has more dashes, not longer ones')
})

test('dashes follow the arc: they start on the ground and keep its points inside', () => {
  const arc = arcPath(route, 2000)
  const pieces = dashes(arc, { on: 100, gap: 20 })
  assert.deepEqual(pieces[0][0], { ...arc[0] })
  assert.ok(pieces.every((piece) => piece.length >= 2))
  assert.ok(pieces.some((piece) => piece.length > 2), 'long dashes bend with the arc')
})

test('the current journey is blue with a ground route; the others are not', () => {
  assert.equal(arcStyle('current', colors).stroke, '#0a84ff')
  assert.equal(arcStyle('current', colors).ground, 'rgba(10, 132, 255, 0.55)')
  assert.equal(arcStyle('next', colors).stroke, 'rgba(255, 255, 255, 0.88)')
  assert.equal(arcStyle('done', colors).stroke, 'rgba(142, 142, 147, 0.55)')
  for (const state of ['next', 'later', 'done']) assert.equal(arcStyle(state, colors).ground, null)
  assert.ok(arcStyle('current', colors).zIndex > arcStyle('next', colors).zIndex)
  assert.ok(arcStyle('later', colors).zIndex > arcStyle('done', colors).zIndex)
})

test('withAlpha leaves colours it cannot read unchanged', () => {
  assert.equal(withAlpha('rgb(1, 2, 3)', 0.5), 'rgb(1, 2, 3)')
})

test('the chip is as wide as its text and escapes it', () => {
  const svg = travelChipSvg({ label: 'Bus <H30> · 22 min' }, colors, 80)
  assert.match(svg, /width="100"/)
  assert.match(svg, /Bus &lt;H30&gt; · 22 min<\/text>/)
  assert.doesNotMatch(svg, /opacity/)
  assert.match(travelChipSvg({ label: 'Walk · 5 min', faded: true }, colors, 60), /opacity="0.6"/)
})
