import { useCallback, useMemo, useReducer } from 'react'
import { PlanContext } from './planContext.js'
import { createPlanState, planReducer } from './planReducer.js'

export function PlanProvider({ initialPlan, children }) {
  const [state, dispatch] = useReducer(planReducer, initialPlan, createPlanState)
  const selectStop = useCallback((stopId) => {
    dispatch({ type: 'select-stop', stopId })
  }, [])
  const clearSelection = useCallback(() => {
    dispatch({ type: 'clear-selection' })
  }, [])
  const editStopDraft = useCallback((stopId, edit) => {
    dispatch({ type: 'edit-stop-draft', stopId, edit })
  }, [])
  const removeStop = useCallback((stopId) => {
    dispatch({ type: 'remove-stop', stopId })
  }, [])
  const applySuggestion = useCallback((proposal, ctx) => {
    dispatch({ type: 'apply-suggestion', proposal, ctx })
  }, [])
  const revertSuggestion = useCallback(() => {
    dispatch({ type: 'revert-suggestion' })
  }, [])
  const acceptDraft = useCallback((ctx) => {
    dispatch({ type: 'accept-draft', ctx })
  }, [])
  const discardDraft = useCallback(() => {
    dispatch({ type: 'discard-draft' })
  }, [])
  const addStop = useCallback(({ newStop, afterStopId, baseVersion, now, ctx }) => {
    dispatch({ type: 'add-stop', newStop, afterStopId, baseVersion, now, ctx })
  }, [])
  const undoAdd = useCallback((stopId) => {
    dispatch({ type: 'undo-add', stopId })
  }, [])
  const setStopKind = useCallback((stopId, kind) => {
    dispatch({ type: 'set-stop-kind', stopId, kind })
  }, [])
  const setStopLocation = useCallback((stopId, location) => {
    dispatch({ type: 'set-stop-location', stopId, location })
  }, [])
  const loadPlan = useCallback((plan) => {
    dispatch({ type: 'load-plan', plan })
  }, [])
  const value = useMemo(() => ({
    plan: state.plan,
    draft: state.draft,
    selectedStopId: state.selectedStopId,
    selectedStop: state.plan.stops.find((stop) => stop.id === state.selectedStopId) ?? null,
    selectStop,
    clearSelection,
    editStopDraft,
    applySuggestion,
    revertSuggestion,
    removeStop,
    acceptDraft,
    discardDraft,
    addStop,
    undoAdd,
    setStopKind,
    setStopLocation,
    loadPlan,
  }), [state, selectStop, clearSelection, editStopDraft, applySuggestion, revertSuggestion, removeStop, acceptDraft, discardDraft, addStop, undoAdd, setStopKind, setStopLocation, loadPlan])

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}
