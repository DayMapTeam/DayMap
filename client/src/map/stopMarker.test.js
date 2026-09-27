import assert from 'node:assert/strict'
import test from 'node:test'
import { numberStops } from '../app/stopNumbers.js'
import { stopMarkerLayouts, stopMarkerSvg } from './stopMarker.js'

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
  assert.match(svg, /<g opacity="0.7">/)
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

const place = { lat: -34.92, lng: 138.6, placeId: 'place-a' }
const elsewhere = { lat: -34.94, lng: 138.61, placeId: 'place-b' }
const stop = (id, location = place) => ({ id, location })

test('consecutive visits stack above the original pin; returning after another place uses a longer gap', () => {
  const stops = [stop('a'), stop('b'), stop('away', elsewhere), stop('return'), stop('last')]
  const layouts = stopMarkerLayouts(stops)
  assert.equal(layouts.get('a').offset, 0)
  assert.equal(layouts.get('a').connectorHeight, 40)
  assert.equal(layouts.get('b').connectorHeight, 7)
  assert.equal(layouts.get('return').connectorHeight, 27)
  assert.equal(layouts.get('last').connectorHeight, 7)
  assert.deepEqual(['a', 'b', 'return', 'last'].map((id) => layouts.get(id).offset), [0, 47, 114, 161])
  assert.equal(layouts.get('away').offset, 0)
  assert.ok(layouts.get('a').layer > layouts.get('b').layer)
  assert.deepEqual(layouts.get('return').position, { lat: place.lat, lng: place.lng })
})

test('same place identity or identical coordinates stack, but nearby places stay separate', () => {
  const layouts = stopMarkerLayouts([
    stop('a'), stop('same-id', { ...place, lat: place.lat + 0.00001 }),
    stop('same-coordinates', { lat: place.lat, lng: place.lng }),
    stop('nearby', { ...place, placeId: 'different', lat: place.lat + 0.00002 }),
    stop('missing', null), stop('invalid', { lat: 200, lng: 0 }),
  ])
  assert.equal(layouts.size, 4)
  assert.equal(layouts.get('same-id').groupId, 'a')
  assert.equal(layouts.get('same-coordinates').groupId, 'a')
  assert.equal(layouts.get('nearby').offset, 0)
  assert.deepEqual(layouts.get('same-id').position, layouts.get('a').position)
})

test('reordering or removing an intervening visit recalculates connectors, including steep tilt', () => {
  const stops = [stop('a'), stop('away', elsewhere), stop('b')]
  assert.equal(stopMarkerLayouts(stops, true).get('b').connectorHeight, 19)
  const reordered = [stops[0], stops[2], stops[1]]
  assert.equal(stopMarkerLayouts(reordered, true).get('b').connectorHeight, 5)
  assert.equal(stopMarkerLayouts(stops.filter((entry) => entry.id !== 'away')).get('b').connectorHeight, 7)
  assert.equal(stopMarkerLayouts([stops[2]]).get('b').offset, 0)
})

test('stacked artwork adds only an upper head and connector, retaining each event state', () => {
  const stack = stopMarkerLayouts([stop('a'), stop('b')]).get('b')
  const svg = stopMarkerSvg({ number: 2, type: 'flexible', stack, state: { selected: true, past: true, clash: true } }, colors)
  assert.match(svg, /width="44" height="141"/)
  assert.match(svg, /height="7"/)
  assert.match(svg, />2<\/text>/)
  assert.doesNotMatch(svg, /r="5"/)
  assert.match(svg, /r="15.3"/)
  assert.match(svg, /opacity="0.7"/)
  assert.match(svg, /stroke="#ff3b30"/)
})
