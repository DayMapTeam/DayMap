/** Initialise an isolated plan snapshot for each provider. */
export function createPlanState(initialPlan) {
  return { plan: initialPlan ? structuredClone(initialPlan) : null, selectedStopId: null }
}

/** Selection is UI state: it never modifies accepted plan data. */
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
    default:
      return state
  }
}
