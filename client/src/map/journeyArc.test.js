import assert from 'node:assert/strict'
import test from 'node:test'
import { distanceMeters } from '../trip/tripRules.js'
import { arcApex, arcHeight, arcPath, arcStyle, withAlpha } from './journeyArc.js'

const colors = { accent: '#0a84ff', ring: '#ffffff', routeDone: '#d1d1d6' }
const home = { lat: -34.92, lng: 138.6 }
// 2 km due east of home.
const east = { lat: -34.92, lng: 138.6 + 2000 / (111320 * Math.cos((34.92 * Math.PI) / 180)) }

test('arcs rise 15% of the journey, between 60 and 150 m', () => {
  assert.equal(arcHeight(200), 60)
  assert.equal(arcHeight(800), 120)
  assert.equal(arcHeight(5000), 150)
  assert.equal(arcHeight(undefined), 60)
})

test('the line starts and ends on the ground at the two stops and peaks in the middle', () => {
  const arc = arcPath(home, east)
  assert.equal(arc.length, 49)
  assert.ok(distanceMeters(arc[0], home) < 0.01 && arc[0].altitude === 0)
  assert.ok(distanceMeters(arc.at(-1), east) < 0.01 && Math.abs(arc.at(-1).altitude) < 1e-9)
  assert.equal(arcApex(arc).altitude, 150)
  assert.ok(arc.every((point) => point.altitude <= 150))
})

test('the line bows a little to the right of travel, so there and back are two lines', () => {
  const there = arcApex(arcPath(home, east))
  const back = arcApex(arcPath(east, home))
  // Heading east, right is south.
  assert.ok(there.lat < home.lat)
  assert.ok(back.lat > home.lat)
  const bow = distanceMeters(there, { lat: home.lat, lng: there.lng })
  assert.ok(Math.abs(bow - 240) < 2, 'bows 12% of its length at the middle')
})

test('two stops at the same spot give a flat point, not NaN', () => {
  assert.ok(arcPath(home, home).every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)))
})

test('current is solid blue, still to come solid white, done light grey and see-through', () => {
  assert.equal(arcStyle('current', colors).stroke, 'rgba(10, 132, 255, 1)')
  assert.equal(arcStyle('next', colors).stroke, 'rgba(255, 255, 255, 1)')
  assert.equal(arcStyle('later', colors).stroke, 'rgba(255, 255, 255, 1)')
  assert.equal(arcStyle('done', colors).stroke, 'rgba(209, 209, 214, 0.5)')
  assert.ok(arcStyle('current', colors).zIndex > arcStyle('next', colors).zIndex)
  assert.ok(arcStyle('later', colors).zIndex > arcStyle('done', colors).zIndex)
})

test('every line is a bright core inside a wider glow of its own colour', () => {
  const current = arcStyle('current', colors)
  assert.equal(current.outer, 'rgba(10, 132, 255, 0.3)')
  assert.ok(current.width > 7)
  assert.ok(Math.abs(current.width * (1 - current.outerWidth) - 7) < 1e-9, 'a 7 px core')
  assert.equal(arcStyle('next', colors).outer, 'rgba(255, 255, 255, 0.3)')
  assert.equal(arcStyle('done', colors).outer, 'rgba(209, 209, 214, 0.15)', 'a done line glows as faintly as it is drawn')
})

test('withAlpha leaves colours it cannot read unchanged', () => {
  assert.equal(withAlpha('rgb(1, 2, 3)', 0.5), 'rgb(1, 2, 3)')
})
