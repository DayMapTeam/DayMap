import { createClient } from '@supabase/supabase-js'
import { createApiClient } from './api.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Supabase Auth only (ARCHITECTURE §2). Null when this copy of DayMap has no
 * Supabase settings, in which case the app stays in demo mode.
 */
export const supabase = url && key
  ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

async function accessToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Plan and Calendar data go through Express with the current session's token. */
export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '', getToken: accessToken })
