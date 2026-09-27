import assert from 'node:assert/strict'
import test from 'node:test'
import { eventArtworkType } from './eventArtwork.js'

test('event art follows the activity before a broad place name', () => {
  assert.equal(eventArtworkType('Lunch at the market', 'Adelaide Central Market'), 'food')
  assert.equal(eventArtworkType('Coffee meeting', 'University library'), 'coffee')
  assert.equal(eventArtworkType('Buying groceries', 'City supermarket'), 'groceries')
})

test('place names help classify generic events', () => {
  assert.equal(eventArtworkType('Appointment', 'Dental clinic'), 'health')
  assert.equal(eventArtworkType('Stop', 'Central Market'), 'groceries')
  assert.equal(eventArtworkType('Something', ''), 'place')
})
