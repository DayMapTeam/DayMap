import { ApiError } from '../middleware/apiError.js'

// Use the Auth and PostgREST HTTP APIs with the caller's token. No service key.
export function createSupabase({
  url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_PUBLISHABLE_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!url && !key) return null // Public demo works without Supabase.
  if (!url || !key) throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY')
  const origin = new URL(url)
  if (origin.origin !== url || !['https:', 'http:'].includes(origin.protocol)
    || (origin.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(origin.hostname))) {
    throw new Error('SUPABASE_URL must be an HTTPS origin (HTTP allowed for local development)')
  }
  if (key.startsWith('sb_secret_')) throw new Error('Use a publishable key, never a secret key')

  async function request(path, token, { method = 'GET', body } = {}) {
    let response
    try {
      response = await fetchImpl(`${url}${path}`, {
        method,
        headers: { apikey: key, Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      })
    } catch {
      throw new ApiError(503, 'SUPABASE_UNAVAILABLE', 'The data service is unavailable. Please try again.', true)
    }
    if (response.status === 401 || (path === '/auth/v1/user' && response.status === 403)) {
      throw new ApiError(401, 'INVALID_SESSION', 'Sign in again to continue.')
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      if (response.status === 409 || error.code === '40001') {
        throw new ApiError(409, 'VERSION_CONFLICT', 'The plan changed. Reload before saving.')
      }
      if (error.code === '23514') throw new ApiError(400, 'INVALID_PLAN', 'The plan violates a persistence constraint.')
      throw new ApiError(503, 'SUPABASE_UNAVAILABLE', 'The data service is unavailable. Please try again.', true)
    }
    try { return await response.json() } catch {
      throw new ApiError(503, 'SUPABASE_UNAVAILABLE', 'The data service returned an invalid response.', true)
    }
  }
  return { request }
}
