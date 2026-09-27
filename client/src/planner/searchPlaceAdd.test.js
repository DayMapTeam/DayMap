import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { demoPlan } from '../../../shared/fixtures/demoPlan.js'
import { createPlanState, planReducer } from '../app/planReducer.js'
import { createPlanningContext } from '../services/planningContext.js'

let server, AddEventSheet, PlanContext, useAddEventDraft
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, envDir: false,
    define: { 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': 'undefined' },
    optimizeDeps: { noDiscovery: true, include: [] }, plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  AddEventSheet = (await server.ssrLoadModule('/src/planner/AddEventSheet.jsx')).default
  PlanContext = (await server.ssrLoadModule('/src/app/planContext.js')).PlanContext
  useAddEventDraft = (await server.ssrLoadModule('/src/planner/useAddEventDraft.js')).useAddEventDraft
})
after(async () => { await server?.close() })

const plan = { ...demoPlan, stops: [], legs: [], questions: [] }
const now = new Date('2026-09-25T23:30:00Z')
const place = { label: 'State Library, North Terrace, Adelaide', placeId: 'library-place', lat: -34.9204, lng: 138.6029 }
const planning = { ctx: createPlanningContext(plan, now), requestJourneys() {} }

test('search add starts at event details with the chosen place and editable times', () => {
  const html = renderToStaticMarkup(createElement(PlanContext.Provider, { value: { plan } },
    createElement(AddEventSheet, { now, planning, initialPlace: place, returnFocusSelector: '.place-search-add' })))
  assert.match(html, /value="State Library"/)
  assert.match(html, /State Library, North Terrace, Adelaide/)
  assert.equal((html.match(/type="time"/g) ?? []).length, 2)
  assert.match(html, />From<\/span>/)
  assert.match(html, />To<\/span>/)
  assert.match(html, />Add to day<\/button>/)
  assert.doesNotMatch(html, /placeholder="Place, activity or note"/)
})

test('a normal planner add still starts at search', () => {
  const html = renderToStaticMarkup(createElement(PlanContext.Provider, { value: { plan } },
    createElement(AddEventSheet, { now, planning, returnFocusSelector: '.planner-add' })))
  assert.match(html, /placeholder="Place, activity or note"/)
  assert.doesNotMatch(html, /type="time"/)
})

test('preview does not mutate the plan; confirming preserves the exact selected coordinates and shown times', () => {
  let draft
  let state = createPlanState(plan)
  function Probe() {
    draft = useAddEventDraft({ now, planning, initialPlace: place })
    return null
  }
  renderToStaticMarkup(createElement(PlanContext.Provider, { value: {
    plan, addStop: (payload) => { state = planReducer(state, { type: 'add-stop', ...payload }) },
  } }, createElement(Probe)))
  assert.deepEqual(state.plan.stops, [])
  assert.equal(draft.role, 'event')
  assert.equal(draft.canCommit, true)
  const result = draft.commit()
  const added = state.plan.stops.find((stop) => stop.id === result.stopId)
  assert.deepEqual(added.location, place)
  assert.equal(added.title, 'State Library')
  assert.equal(added.timing.scheduledStartAt, draft.option.startAt)
  assert.equal(added.timing.scheduledEndAt, draft.option.endAt)
  assert.equal(state.selectedStopId, added.id)
})
