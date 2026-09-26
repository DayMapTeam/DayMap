import { chooseOption } from './planAdd.js'
import { listStopChanges, validateStopEdit } from './planEdits.js'

/** Initialise an isolated plan snapshot for each provider. */
export function createPlanState(initialPlan) {
  return { plan: structuredClone(initialPlan), selectedStopId: null, draft: null, lastAdd: null }
}

/**
 * Add a stop the user confirmed in an add flow. The flow is the preview and
 * Add is the explicit accept, so this re-runs the same fit the flow showed and
 * applies it only if the plan hasn't changed since. A pending edit draft
 * blocks adding, so the two never overwrite each other.
 */
function addStop(state, { newStop, afterStopId, baseVersion, now }) {
  if (state.draft !== null || baseVersion !== state.plan.version) return state
  const option = chooseOption(state.plan, newStop, { afterStopId, now })
  if (option === null) return state
  const version = state.plan.version + 1
  return {
    ...state,
    plan: { ...option.plan, version },
    selectedStopId: newStop.id,
    lastAdd: { stopId: newStop.id, previousPlan: state.plan, version },
  }
}

// Undo restores the day as it was before the add, including any stops it
// moved, but only while nothing else has changed the plan.
function undoAdd(state, { stopId }) {
  const { lastAdd } = state
  if (lastAdd === null || lastAdd.stopId !== stopId || lastAdd.version !== state.plan.version) return state
  return {
    ...state,
    plan: { ...lastAdd.previousPlan, version: state.plan.version + 1 },
    selectedStopId: state.selectedStopId === stopId ? null : state.selectedStopId,
    lastAdd: null,
  }
}

/**
 * Apply a stop edit to the draft (or start one from the accepted plan).
 * Timing changes mark the stop's legs stale until they are recalculated.
 */
function editStopDraft(state, { stopId, edit }) {
  const base = state.draft?.plan ?? state.plan
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

function withoutStop(plan, stopId) {
  return {
    ...plan,
    stops: plan.stops.filter((stop) => stop.id !== stopId),
    legs: plan.legs.filter((leg) => leg.fromStopId !== stopId && leg.toStopId !== stopId),
  }
}

/**
 * Delete a flexible stop the user confirmed, with its legs. The confirmation
 * is the explicit accept, so this changes the accepted plan and bumps its
 * version. A pending edit draft loses the stop too but keeps its other edits.
 */
function removeStop(state, { stopId }) {
  const stop = state.plan.stops.find((candidate) => candidate.id === stopId)
  if (!stop || stop.timing.kind !== 'flexible') return state

  const version = state.plan.version + 1
  const plan = { ...withoutStop(state.plan, stopId), version }
  let { draft } = state
  if (draft !== null) {
    const draftPlan = withoutStop(draft.plan, stopId)
    draft = listStopChanges(plan, draftPlan).length === 0
      ? null
      : { ...draft, plan: draftPlan, baseVersion: draft.baseVersion === state.plan.version ? version : draft.baseVersion }
  }
  return {
    ...state,
    plan,
    draft,
    selectedStopId: state.selectedStopId === stopId ? null : state.selectedStopId,
  }
}

/**
 * Selection is UI state: it never modifies accepted plan data. Edits go into
 * a draft, and only 'accept-draft' replaces the accepted plan.
 */
export function planReducer(state, action) {
  switch (action.type) {
    case 'select-stop': {
      const exists = state.plan.stops.some((stop) => stop.id === action.stopId)
      if (!exists || state.selectedStopId === action.stopId) return state
      return { ...state, selectedStopId: action.stopId }
    }
    case 'clear-selection':
      return state.selectedStopId === null
        ? state
        : { ...state, selectedStopId: null }
    case 'edit-stop-draft':
      return editStopDraft(state, action)
    case 'remove-stop':
      return removeStop(state, action)
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
    case 'add-stop':
      return addStop(state, action)
    case 'undo-add':
      return undoAdd(state, action)
    default:
      return state
  }
}
