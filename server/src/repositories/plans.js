import { ApiError } from '../middleware/apiError.js'

export function planRepository(supabase, { token, userId }) {
  const read = async filters => {
    const query = new URLSearchParams({ select: 'plan', user_id: `eq.${userId}`, ...filters })
    return supabase.request(`/rest/v1/day_plans?${query}`, token)
  }
  return {
    async list(date, timezone) {
      return (await read({ date: `eq.${date}`, timezone: `eq.${timezone}` })).map(row => row.plan)
    },
    async save(id, baseVersion, plan) {
      const nextPlan = { ...plan, version: baseVersion + 1 }
      const row = { id, user_id: userId, date: plan.date, timezone: plan.timezone,
        version: nextPlan.version, plan: nextPlan }
      if (baseVersion === 0) {
        const rows = await supabase.request('/rest/v1/day_plans', token, { method: 'POST', body: row })
        return rows[0].plan
      }
      const query = new URLSearchParams({ id: `eq.${id}`, user_id: `eq.${userId}`, version: `eq.${baseVersion}` })
      // One SQL UPDATE checks the version and saves. Concurrent requests cannot both win.
      const rows = await supabase.request(`/rest/v1/day_plans?${query}`, token, { method: 'PATCH', body: row })
      if (rows.length) return rows[0].plan
      if (!(await read({ id: `eq.${id}` })).length) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
      throw new ApiError(409, 'VERSION_CONFLICT', 'The plan changed. Reload before saving.')
    },
  }
}
