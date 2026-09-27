import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'

let server, EventList, PlanContext
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    configFile: false,
    envDir: false,
    define: { 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': 'undefined' },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  EventList = (await server.ssrLoadModule('/src/planner/EventList.jsx')).default
  PlanContext = (await server.ssrLoadModule('/src/app/planContext.js')).PlanContext
})
after(async () => { await server?.close() })

const timed = demoPlan.stops.filter((stop) => stop.timing.kind !== 'all-day').slice(0, 2)
const note = {
  ...timed[0], id: 'day-note', title: 'Bring library card', source: 'manual', location: null,
  timing: { ...timed[0].timing, kind: 'all-day', durationMinutes: null, scheduledStartAt: null, scheduledEndAt: null },
}

function render(stops, filter = '', openStopId = null) {
  const plan = { ...demoPlan, stops }
  const planning = {
    analysis: { legs: [], conflicts: [] }, bookends: {}, displayGaps: [],
    transitServicesFor: () => [],
  }
  return renderToStaticMarkup(createElement(PlanContext.Provider, { value: { plan, draft: null } },
    createElement(EventList, { planning, now: new Date(`${plan.date}T00:00:00Z`), filter,
      openStopId, revealRequest: null, newStopId: null })))
}

test('notes never insert itinerary rows or extra travel connectors, regardless of stored position', () => {
  const baseline = render(timed).match(/<ol[\s\S]*?<\/ol>/)[0]
  for (let index = 0; index <= timed.length; index++) {
    const stops = [...timed]
    stops.splice(index, 0, note)
    const html = render(stops)
    assert.equal(html.match(/<ol[\s\S]*?<\/ol>/)[0], baseline)
    assert.match(html, /<summary>Day notes/)
    assert.match(html.match(/<ul[\s\S]*?<\/ul>/)[0], /Bring library card/)
  }
})

test('note-only days and matching filters expose notes without journey or scheduling controls', () => {
  const html = render([note], 'library', note.id)
  assert.match(html, /<details[^>]*open=""/)
  assert.match(html, /Showing 1 of 1 items/)
  assert.match(html, />Delete<\/button>/)
  assert.match(html, />Save<\/button>/)
  assert.doesNotMatch(html, /travel-connector|event-star|type="time"|Set place|Location needed/)
  const missing = render([note], 'not found')
  assert.match(missing, /No items match/)
  assert.doesNotMatch(missing, /<details/)
})

test('imported all-day events remain in the itinerary rather than becoming manual notes', () => {
  const html = render([{ ...note, id: 'calendar-day', source: 'google-calendar' }, ...timed])
  assert.doesNotMatch(html, /<summary>Day notes/)
  assert.match(html.match(/<ol[\s\S]*?<\/ol>/)[0], /data-stop-id="calendar-day"/)
})
