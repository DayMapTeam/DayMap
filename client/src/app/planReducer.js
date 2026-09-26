/** Initialise an isolated plan snapshot for each provider. */
export function createPlanState(initialPlan) {
  return { plan: structuredClone(initialPlan), selectedStopId: null }
}

/** Selection is UI state: it never modifies accepted plan data. */
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
    default:
      return state
  }
}
