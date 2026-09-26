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
  const loadPlan = useCallback((plan) => {
    dispatch({ type: 'load-plan', plan })
  }, [])
  const editStopDraft = useCallback((stopId, edit) => {
    dispatch({ type: 'edit-stop-draft', stopId, edit })
  }, [])
  const acceptDraft = useCallback(() => {
    dispatch({ type: 'accept-draft' })
  }, [])
  const discardDraft = useCallback(() => {
    dispatch({ type: 'discard-draft' })
  }, [])
  const value = useMemo(() => ({
    plan: state.plan,
    draft: state.draft,
    selectedStopId: state.selectedStopId,
    selectedStop: state.plan?.stops.find((stop) => stop.id === state.selectedStopId) ?? null,
    loadPlan,
    selectStop,
    clearSelection,
    editStopDraft,
    acceptDraft,
    discardDraft,
  }), [state, loadPlan, selectStop, clearSelection, editStopDraft, acceptDraft, discardDraft])

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}
