import assert from 'node:assert/strict'
import test from 'node:test'
import { matchingDayPlaces } from './addPlaces.js'

test('Home matches existing confirmed places without inventing a personal address', () => {
  const home = { label: 'Home', lat: -34.95, lng: 138.6, placeId: null }
  const plan = { startPlace: home, endPlace: home, stops: [{ location: home }, { location: null }] }
  assert.deepEqual(matchingDayPlaces(plan, ' HOME '), [home])
  assert.deepEqual(matchingDayPlaces({ stops: [] }, 'Home'), [])
  assert.deepEqual(matchingDayPlaces(plan, 'Read a book'), [])
  assert.deepEqual(matchingDayPlaces({ stops: [{ location: { label: 'Home' } }] }, 'Home'), [])
})
