import { createContext, useContext } from 'react'

export const PlanContext = createContext(null)

/** Read the shared plan and selection actions from inside PlanProvider. */
export function usePlan() {
  const value = useContext(PlanContext)
  if (value === null) {
    throw new Error('usePlan must be used inside a PlanProvider')
  }
  return value
}
