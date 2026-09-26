import { listStopChanges, validateStopEdit } from './planEdits.js'

/** Initialise an isolated plan snapshot for each provider. */
export function createPlanState(initialPlan) {
  return { plan: initialPlan ? structuredClone(initialPlan) : null, selectedStopId: null, draft: null }
}

/**
 * Apply a stop edit to the draft (or start one from the accepted plan).
 * Timing changes mark the stop's legs stale until they are recalculated.
 */
function editStopDraft(state, { stopId, edit }) {
  const base = state.draft?.plan ?? state.plan
  if (!base) return state
  const stop = base.stops.find((candidate) => candidate.id === stopId)
  if (!stop || validateStopEdit(stop, edit) !== null) return state

  const plan = structuredClone(base)
  const target = plan.stops.find((candidate) => candidate.id === stopId)
  const timingChanged =
    target.timing.scheduledStartAt !== edit.scheduledStartAt ||
    target.timing.scheduledEndAt !== edit.scheduledEndAt
  target.title = edit.title.trim()
  target.timing.scheduledStartAt = edit.scheduledStartAt
  target.timing.scheduledEndAt = edit.scheduledEndAt
  target.timing.durationMinutes = (Date.parse(edit.scheduledEndAt) - Date.parse(edit.scheduledStartAt)) / 60000
  if (timingChanged) {
    plan.legs = plan.legs.map((leg) =>
      leg.fromStopId === stopId || leg.toStopId === stopId ? { ...leg, status: 'stale' } : leg,
    )
  }

  // An edit that returns every stop to the accepted values leaves nothing to accept.
  if (listStopChanges(state.plan, plan).length === 0) return { ...state, draft: null }
  return {
    ...state,
    draft: { baseVersion: state.draft?.baseVersion ?? state.plan.version, plan, stale: false },
  }
}

/**
 * Selection is UI state: it never modifies accepted plan data. Edits go into
 * a draft, and only 'accept-draft' replaces the accepted plan.
 */
export function planReducer(state, action) {
  switch (action.type) {
    case 'load-plan':
      return createPlanState(action.plan)
    case 'select-stop': {
      const exists = state.plan?.stops.some((stop) => stop.id === action.stopId)
      if (!exists || state.selectedStopId === action.stopId) return state
      return { ...state, selectedStopId: action.stopId }
    }
    case 'clear-selection':
      return state.selectedStopId === null
        ? state
        : { ...state, selectedStopId: null }
    case 'edit-stop-draft':
      return editStopDraft(state, action)
    case 'accept-draft': {
      const { draft } = state
      if (draft === null) return state
      // A draft built on an older version must not overwrite newer changes.
      if (draft.baseVersion !== state.plan.version) {
        return draft.stale ? state : { ...state, draft: { ...draft, stale: true } }
      }
      return { ...state, plan: { ...draft.plan, version: state.plan.version + 1 }, draft: null }
    }
    case 'discard-draft':
      return state.draft === null ? state : { ...state, draft: null }
    default:
      return state
  }
}
