import assert from 'node:assert/strict'
import test from 'node:test'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { describeTravel } from './addEventCopy.js'

const leg = (fromStopId, toStopId, status, minutes = 0) => ({ fromStopId, toStopId, status, minutes })

test('travel copy names both journeys, and says plainly what is unknown', () => {
  const option = { journeys: [leg('stop-university', 'new', 'ready', 25), leg('new', 'stop-library', 'ready', 15)] }
  assert.equal(describeTravel(option, demoPlan), 'Allows 25 min to get there from Morning lecture and 15 min to get to Library study.')
  assert.equal(describeTravel({ journeys: [leg('stop-university', 'new', 'pending')] }, demoPlan), 'Checking travel time…')
  assert.equal(describeTravel({ journeys: [leg('stop-university', 'new', 'no-place'), leg('new', 'stop-library', 'no-place')] }, demoPlan),
    'Travel isn’t included where a stop has no place.')
  assert.match(describeTravel({ journeys: [leg('stop-university', 'new', 'unavailable')] }, demoPlan), /unavailable/)
  assert.equal(describeTravel({ journeys: [] }, demoPlan), '')
})
