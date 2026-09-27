import { chooseOption } from './planAdd.js'
import {
  listStopChanges, validateStopEdit, withDayPlace, withLocalTimeMarks, withStopKind, withTravelMode,
} from './planEdits.js'
import { setStopLocation } from './planLocations.js'
import { applyProposal } from '../../../shared/planning/proposals.js'
import { planFingerprint } from '../../../shared/planning/fingerprint.js'

/** Initialise an isolated plan snapshot for each provider. */
export function createPlanState(initialPlan) {
  return { plan: structuredClone(initialPlan), selectedStopId: null, draft: null, lastAdd: null, lastRemove: null }
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
    // Calendar events the fit moved keep their new times on re-import.
    plan: { ...withLocalTimeMarks(state.plan, option.plan), version },
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

const LOCAL_EDITS = ['title', 'time']
const sameTime = (a, b) => Date.parse(a) === Date.parse(b)

/**
 * Which fields of a Google Calendar stop the person has changed from the
 * accepted plan, plus those already recorded there, so re-import keeps them.
 */
function localEditsFor(accepted, next) {
  const recorded = new Set(accepted.localEdits ?? [])
  if (next.title !== accepted.title) recorded.add('title')
  if (!sameTime(next.timing.scheduledStartAt, accepted.timing.scheduledStartAt)
    || !sameTime(next.timing.scheduledEndAt, accepted.timing.scheduledEndAt)) recorded.add('time')
  return LOCAL_EDITS.filter((field) => recorded.has(field))
}

/**
 * Apply a stop edit to the draft (or start one from the accepted plan).
 * Timing changes mark the stop's legs stale until they are recalculated.
 * A fixed stop stays fixed at its new times. A Google Calendar stop records
 * what the person changed (`localEdits`), so re-import doesn't undo it.
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
  if (target.timing.kind === 'fixed') {
    target.timing.fixedStartAt = edit.scheduledStartAt
    target.timing.fixedEndAt = edit.scheduledEndAt
  }
  if (target.source === 'google-calendar') {
    const accepted = state.plan.stops.find((candidate) => candidate.id === stopId) ?? stop
    const localEdits = localEditsFor(accepted, target)
    if (localEdits.length > 0) target.localEdits = localEdits
    else delete target.localEdits
  }
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
    questions: (plan.questions ?? []).filter((question) => question.stopId !== stopId),
    conflicts: (plan.conflicts ?? []).filter((conflict) => !conflict.stopIds?.includes(stopId)),
  }
}

// Calendar events the person removed; re-import leaves them out.
const MAX_REMOVED_EVENTS = 500

function withRemovedEvent(plan, stop) {
  if (stop.source !== 'google-calendar') return plan
  const removed = plan.removedEvents ?? []
  const known = removed.some((event) =>
    event.sourceCalendarId === stop.sourceCalendarId && event.sourceEventId === stop.sourceEventId)
  if (known) return plan
  const event = { sourceCalendarId: stop.sourceCalendarId, sourceEventId: stop.sourceEventId, title: stop.title }
  return { ...plan, removedEvents: [...removed, event].slice(-MAX_REMOVED_EVENTS) }
}

/**
 * Delete a stop the user confirmed, with its legs, questions and conflicts.
 * Any stop can go, fixed or from Google Calendar too; a Calendar event is
 * remembered in `removedEvents` so re-import doesn't bring it back. The
 * confirmation is the explicit accept, so this changes the accepted plan and
 * bumps its version, and it can be undone until the plan changes again. A
 * pending edit draft loses the stop too but keeps its other edits; undo
 * gives back the stop's pending edits as well.
 */
function removeStop(state, { stopId }) {
  const stop = state.plan.stops.find((candidate) => candidate.id === stopId)
  if (!stop) return state
  if (state.draft?.suggestion) return removeStop(revertSuggestion(state), { stopId })

  const version = state.plan.version + 1
  const plan = { ...withRemovedEvent(withoutStop(state.plan, stopId), stop), version }
  let { draft } = state
  // The stop as the pending draft had edited it, so undo can bring the edits back.
  const draftStop = draft?.editedStopIds?.includes(stopId)
    ? draft.plan.stops.find((candidate) => candidate.id === stopId) ?? null
    : null
  if (draft !== null) {
    const draftPlan = withRemovedEvent(withoutStop(draft.plan, stopId), stop)
    draft = listStopChanges(plan, draftPlan).length === 0
      ? null
      : {
          ...draft, plan: draftPlan,
          editedStopIds: (draft.editedStopIds ?? []).filter((id) => id !== stopId),
          baseVersion: draft.baseVersion === state.plan.version ? version : draft.baseVersion,
        }
  }
  return {
    ...state,
    plan,
    draft,
    selectedStopId: state.selectedStopId === stopId ? null : state.selectedStopId,
    lastRemove: { stopId, title: stop.title, previousPlan: state.plan, version, draftStop },
  }
}

/** A plan with `stop` put back where it was in `previousPlan`, with its questions and conflicts. */
function withStopRestored(plan, previousPlan, stop) {
  const index = previousPlan.stops.findIndex((candidate) => candidate.id === stop.id)
  const stops = plan.stops.filter((candidate) => candidate.id !== stop.id)
  const before = previousPlan.stops.slice(0, index).map((candidate) => candidate.id)
  const at = stops.reduce((last, candidate, position) => (before.includes(candidate.id) ? position + 1 : last), 0)
  stops.splice(at, 0, stop)
  const next = {
    ...plan,
    stops,
    questions: [...(plan.questions ?? []), ...(previousPlan.questions ?? []).filter((question) => question.stopId === stop.id)],
    conflicts: [...(plan.conflicts ?? []), ...(previousPlan.conflicts ?? []).filter((conflict) => conflict.stopIds?.includes(stop.id))],
  }
  if (previousPlan.removedEvents === undefined) delete next.removedEvents
  else next.removedEvents = previousPlan.removedEvents
  return next
}

// Undo puts the stop back as it was before the removal, but only while
// nothing else has changed the accepted plan. Pending edits to the stop come
// back into the draft (a new one if removing it had emptied the draft);
// otherwise a pending draft gets the accepted stop.
function undoRemove(state, { stopId }) {
  const { lastRemove } = state
  if (lastRemove === null || lastRemove.stopId !== stopId || lastRemove.version !== state.plan.version) return state
  if (state.draft?.suggestion) return undoRemove(revertSuggestion(state), { stopId })
  const version = state.plan.version + 1
  const plan = { ...lastRemove.previousPlan, version }
  const { draftStop = null } = lastRemove
  const stop = draftStop ?? plan.stops.find((candidate) => candidate.id === stopId)
  let draft = null
  if (state.draft !== null) {
    const otherIds = (state.draft.editedStopIds ?? []).filter((id) => id !== stopId)
    draft = {
      ...state.draft,
      plan: withStopRestored(state.draft.plan, lastRemove.previousPlan, stop),
      editedStopIds: draftStop ? [...otherIds, stopId] : otherIds,
      baseVersion: state.draft.baseVersion === state.plan.version ? version : state.draft.baseVersion,
    }
  } else if (draftStop !== null) {
    const draftPlan = {
      ...plan,
      stops: plan.stops.map((candidate) => (candidate.id === stopId ? draftStop : candidate)),
      legs: plan.legs.map((leg) => (leg.fromStopId === stopId || leg.toStopId === stopId ? { ...leg, status: 'stale' } : leg)),
    }
    draft = { baseVersion: version, plan: draftPlan, stale: false, editedStopIds: [stopId] }
  }
  return { ...state, plan, draft, lastRemove: null }
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

/** Set where the day starts and/or ends. An explicit accept, applied to a pending draft too. */
function setDayPlace(state, { which, location }) {
  if (state.draft?.suggestion) return setDayPlace(revertSuggestion(state), { which, location })
  const plan = withDayPlace(state.plan, which, location)
  if (plan === state.plan) return state
  const version = state.plan.version + 1
  const draft = state.draft === null ? null : {
    ...state.draft,
    plan: withDayPlace(state.draft.plan, which, location),
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
      // Calendar events moved by the draft (edits or suggestions) keep their new times on re-import.
      return { ...state, plan: { ...withLocalTimeMarks(state.plan, draft.plan), version: state.plan.version + 1 }, draft: null }
    }
    case 'discard-draft':
      return state.draft === null ? state : { ...state, draft: null }
    case 'add-stop':
      return addStop(state, action)
    case 'undo-add':
      return undoAdd(state, action)
    case 'undo-remove':
      return undoRemove(state, action)
    case 'set-day-place':
      return setDayPlace(state, action)
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
