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
  const acceptDraft = useCallback(() => {
    dispatch({ type: 'accept-draft' })
  }, [])
  const discardDraft = useCallback(() => {
    dispatch({ type: 'discard-draft' })
  }, [])
  const addStop = useCallback(({ newStop, afterStopId, baseVersion, now }) => {
    dispatch({ type: 'add-stop', newStop, afterStopId, baseVersion, now })
  }, [])
  const undoAdd = useCallback((stopId) => {
    dispatch({ type: 'undo-add', stopId })
  }, [])
  const value = useMemo(() => ({
    plan: state.plan,
    draft: state.draft,
    selectedStopId: state.selectedStopId,
    selectedStop: state.plan.stops.find((stop) => stop.id === state.selectedStopId) ?? null,
    selectStop,
    clearSelection,
    editStopDraft,
    removeStop,
    acceptDraft,
    discardDraft,
    addStop,
    undoAdd,
  }), [state, selectStop, clearSelection, editStopDraft, removeStop, acceptDraft, discardDraft, addStop, undoAdd])

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}
