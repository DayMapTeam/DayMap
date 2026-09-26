import { chooseOption } from './planAdd.js'
import { listStopChanges, validateStopEdit, withStopKind, withTravelMode } from './planEdits.js'
import { setStopLocation } from './planLocations.js'
import { applyProposal } from '../../../shared/planning/proposals.js'
import { planFingerprint } from '../../../shared/planning/fingerprint.js'

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
function addStop(state, { newStop, afterStopId, baseVersion, now, ctx = null }) {
  if (state.draft !== null || baseVersion !== state.plan.version) return state
  const option = chooseOption(state.plan, newStop, { afterStopId, now, ctx })
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
  if (state.draft?.suggestion) {
    const shown = state.draft.plan.stops.find((stop) => stop.id === stopId)
    if (!shown || validateStopEdit(shown, edit) !== null) return state
    // A new manual edit invalidates the suggestion. Rebase that edit onto the
    // user's own draft so suggested moves cannot become silently accepted.
    return editStopDraft(revertSuggestion(state), { stopId, edit })
  }
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
    draft: {
      baseVersion: state.draft?.baseVersion ?? state.plan.version, plan, stale: false,
      editedStopIds: [...new Set([...(state.draft?.editedStopIds ?? []), stopId])],
    },
  }
}

function suggestionContext(ctx, draft) {
  return { ...ctx, lockedStopIds: [...new Set([...(ctx?.lockedStopIds ?? []), ...(draft?.editedStopIds ?? [])])] }
}

function applySuggestion(state, { proposal, ctx }) {
  const { draft } = state
  if (draft?.suggestion || (draft && draft.baseVersion !== state.plan.version)) return state
  const base = draft?.plan ?? state.plan
  const plan = applyProposal(base, proposal, suggestionContext(ctx, draft))
  if (!plan) return state
  return { ...state, draft: {
    baseVersion: draft?.baseVersion ?? state.plan.version, plan, stale: false,
    editedStopIds: draft?.editedStopIds ?? [],
    beforeSuggestion: structuredClone(draft), suggestion: structuredClone(proposal),
    suggestionInvalid: false,
  } }
}

function revertSuggestion(state) {
  return state.draft?.suggestion ? { ...state, draft: state.draft.beforeSuggestion } : state
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
  if (state.draft?.suggestion) return removeStop(revertSuggestion(state), { stopId })

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
 * Set or clear a stop's place. Choosing a place is the explicit accept, so it
 * changes the accepted plan (and a pending draft, which keeps its own edits).
 */
function setLocation(state, { stopId, location }) {
  if (state.draft?.suggestion) return setLocation(revertSuggestion(state), { stopId, location })
  const next = setStopLocation(state.plan, stopId, location)
  if (next === state.plan) return state
  const version = state.plan.version + 1
  const draft = state.draft === null ? null : {
    ...state.draft,
    plan: setStopLocation(state.draft.plan, stopId, location),
    baseVersion: state.draft.baseVersion === state.plan.version ? version : state.draft.baseVersion,
  }
  return { ...state, plan: { ...next, version }, draft }
}

/**
 * Make a stop fixed or flexible. This is the explicit accept, so it changes
 * the accepted plan. It waits while a draft is pending, because the draft may
 * plan different times for the same stop.
 */
function setKind(state, { stopId, kind }) {
  if (state.draft !== null) return state
  const stop = state.plan.stops.find((candidate) => candidate.id === stopId)
  const next = stop && withStopKind(stop, kind)
  if (!next) return state
  const stops = state.plan.stops.map((candidate) => (candidate.id === stopId ? next : candidate))
  return { ...state, plan: { ...state.plan, stops, version: state.plan.version + 1 } }
}

/**
 * Choose how to travel to a stop (null: automatic). The choice is the explicit
 * accept, so it changes the accepted plan and a pending draft alike.
 */
function setTravelMode(state, { stopId, mode }) {
  if (state.draft?.suggestion) return setTravelMode(revertSuggestion(state), { stopId, mode })
  const apply = (plan) => {
    const stop = plan.stops.find((candidate) => candidate.id === stopId)
    const next = stop && withTravelMode(stop, mode)
    return next ? { ...plan, stops: plan.stops.map((candidate) => (candidate.id === stopId ? next : candidate)) } : plan
  }
  const plan = apply(state.plan)
  if (plan === state.plan) return state
  const version = state.plan.version + 1
  const draft = state.draft === null ? null : {
    ...state.draft,
    plan: apply(state.draft.plan),
    baseVersion: state.draft.baseVersion === state.plan.version ? version : state.draft.baseVersion,
  }
  return { ...state, plan: { ...plan, version }, draft }
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
    case 'apply-suggestion':
      return applySuggestion(state, action)
    case 'revert-suggestion':
      return revertSuggestion(state)
    case 'remove-stop':
      return removeStop(state, action)
    case 'accept-draft': {
      const { draft } = state
      if (draft === null) return state
      // A draft built on an older version must not overwrite newer changes.
      if (draft.baseVersion !== state.plan.version) {
        return draft.stale ? state : { ...state, draft: { ...draft, stale: true } }
      }
      if (draft.suggestion) {
        const base = draft.beforeSuggestion?.plan ?? state.plan
        const checked = applyProposal(base, draft.suggestion, suggestionContext(action.ctx, draft.beforeSuggestion))
        if (!checked || planFingerprint(checked) !== planFingerprint(draft.plan)) {
          return draft.suggestionInvalid ? state : { ...state, draft: { ...draft, suggestionInvalid: true } }
        }
      }
      return { ...state, plan: { ...draft.plan, version: state.plan.version + 1 }, draft: null }
    }
    case 'discard-draft':
      return state.draft === null ? state : { ...state, draft: null }
    case 'add-stop':
      return addStop(state, action)
    case 'undo-add':
      return undoAdd(state, action)
    case 'set-stop-travel-mode':
      return setTravelMode(state, action)
    case 'set-stop-kind':
      return setKind(state, action)
    case 'set-stop-location':
      return setLocation(state, action)
    case 'load-plan':
      // A different day (or a signed-in user's saved day) replaces everything,
      // including a pending draft, which was built on the old plan.
      return createPlanState(action.plan)
    default:
      return state
  }
}
