/** Load the public demo through the same API boundary future live plans will use. */
export async function loadDemoPlan({ signal, baseUrl = import.meta.env?.VITE_API_BASE_URL ?? '' } = {}) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/demo-plan`, { signal })
  if (!response.ok) throw new Error('Unable to load the demo plan. Please try again.')
  const plan = await response.json()
  if (!plan || !Array.isArray(plan.stops) || typeof plan.date !== 'string' || typeof plan.timezone !== 'string') {
    throw new Error('The server returned an invalid demo plan.')
  }
  return plan
}
