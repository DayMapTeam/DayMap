/** An error from the Express API, in the shared `{ error: { code, message, retryable } }` shape. */
export class ApiRequestError extends Error {
  constructor(status, code, message, retryable = false) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

/**
 * The browser's only route to application data (ARCHITECTURE §2). Supabase is
 * used for Auth alone; `getToken` supplies the current session's access token.
 *
 * @param {object} options
 * @param {string} [options.baseUrl] Empty in development, where Vite proxies /api.
 * @param {() => Promise<string | null>} options.getToken
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createApiClient({ baseUrl = '', getToken, fetchImpl = (...args) => fetch(...args) }) {
  async function request(path, { method = 'GET', body, signal } = {}) {
    const token = await getToken()
    if (!token) throw new ApiRequestError(401, 'INVALID_SESSION', 'Sign in to continue.')
    let response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      throw new ApiRequestError(0, 'NETWORK_UNAVAILABLE', 'DayMap can’t reach its server. Check your connection.', true)
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = data?.error ?? {}
      throw new ApiRequestError(response.status, detail.code ?? 'REQUEST_FAILED',
        detail.message ?? 'Something went wrong. Please try again.', detail.retryable ?? response.status >= 500)
    }
    return data
  }

  return {
    request,
    async getDayPlan(date, timezone, { signal } = {}) {
      const query = new URLSearchParams({ date, timezone })
      const { plans } = await request(`/api/plans?${query}`, { signal })
      return plans[0] ?? null
    },
    savePlan(plan, baseVersion) {
      return request(`/api/plans/${encodeURIComponent(plan.id)}`, {
        method: 'PUT', body: { baseVersion, plan: { ...plan, version: baseVersion } },
      })
    },
    calendarStatus({ signal } = {}) {
      return request('/api/calendar/status', { signal })
    },
    /** The Google consent URL to send the browser to. */
    async connectCalendar() {
      return (await request('/api/calendar/connect', { method: 'POST' })).url
    },
    disconnectCalendar() {
      return request('/api/calendar/disconnect', { method: 'POST' })
    },
    /**
     * Merges one day's primary-calendar events into the saved plan:
     * `{ plan, summary: { added, updated, removed, hidden } }`. Events the
     * person removed stay out (`hidden`) unless `restoreRemoved` is true (all
     * of them) or they are in `restoreEvents` ({ sourceCalendarId, sourceEventId }[]).
     */
    importCalendarDay(date, timezone, { restoreRemoved = false, restoreEvents } = {}) {
      const body = { date, timezone }
      if (restoreRemoved === true) body.restoreRemoved = true
      if (Array.isArray(restoreEvents) && restoreEvents.length > 0) {
        body.restoreEvents = restoreEvents.map(({ sourceCalendarId, sourceEventId }) => ({ sourceCalendarId, sourceEventId }))
      }
      return request('/api/calendar/import', { method: 'POST', body })
    },
  }
}
