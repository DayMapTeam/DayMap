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
  const value = useMemo(() => ({
    plan: state.plan,
    selectedStopId: state.selectedStopId,
    selectedStop: state.plan?.stops.find((stop) => stop.id === state.selectedStopId) ?? null,
    loadPlan,
    selectStop,
    clearSelection,
  }), [state, selectStop, clearSelection, loadPlan])

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}
