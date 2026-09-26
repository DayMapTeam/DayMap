import { useEffect, useState } from 'react'
import { usePlan } from './planContext.js'
import { loadDemoPlan } from '../services/plans.js'

export function DemoLoader({ children }) {
  const { plan, loadPlan } = usePlan()
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('Request timed out. Please try again.')), 10000)
    let active = true
    loadDemoPlan({ signal: controller.signal })
      .then((loadedPlan) => { if (active) loadPlan(loadedPlan) })
      .catch(() => {
        if (active) setError('We could not load your demo day. Check your connection and try again.')
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt, loadPlan])

  if (plan) return children
  return (
    <main className="demo-page">
      <h1>DayMap</h1>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => { setError(null); setAttempt(value => value + 1) }}>Try again</button>
        </div>
      ) : <p role="status">Loading your demo day…</p>}
    </main>
  )
}
