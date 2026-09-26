import assert from 'node:assert/strict'
import test from 'node:test'
import { guessRole } from './useAddEventDraft.js'

test('home starts and ends the day, somewhere to stay ends it, anything else is an event', () => {
  const empty = { startPlace: null, endPlace: null }
  assert.equal(guessRole('Home 12 Smith St', empty), 'both')
  assert.equal(guessRole('Home', { ...empty, startPlace: { label: 'Home' } }), 'end')
  assert.equal(guessRole('Hilton Adelaide Hotel', empty), 'end')
  assert.equal(guessRole('Peel St Airbnb', empty), 'end')
  assert.equal(guessRole('Gelatissimo ice cream', empty), 'event')
})
