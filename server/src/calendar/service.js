import { createHash, randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { ApiError } from '../middleware/apiError.js'
import { createTokenCipher } from './tokenCipher.js'

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const stateHash = state => createHash('sha256').update(state).digest('hex')

export function createCalendarService({
  env = process.env,
  db,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const names = ['DATABASE_URL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY']
  if (names.every(name => !env[name])) return null
  if (names.some(name => !env[name])) throw new Error(`Calendar configuration requires ${names.join(', ')}`)
  const redirect = new URL(env.GOOGLE_OAUTH_REDIRECT_URI)
  if (redirect.toString() !== env.GOOGLE_OAUTH_REDIRECT_URI ||
      redirect.pathname !== '/api/calendar/callback' || redirect.search || redirect.hash ||
      (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(redirect.hostname)))) {
    throw new Error('GOOGLE_OAUTH_REDIRECT_URI must be an exact HTTPS callback URL (HTTP only for localhost)')
  }
  const pool = db ?? new Pool({ connectionString: env.DATABASE_URL, max: 5 })
  const cipher = createTokenCipher(env.TOKEN_ENCRYPTION_KEY)
  const request = async (url, body, expectJson = true) => {
    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      })
    } catch {
      throw new ApiError(503, 'GOOGLE_UNAVAILABLE', 'Google Calendar is unavailable. Please try again.', true)
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      if (url === TOKEN_URL && detail.error === 'invalid_grant') {
        throw new ApiError(409, 'CALENDAR_RECONNECT_REQUIRED', 'Calendar access expired. Reconnect.')
      }
      throw new ApiError(502, 'GOOGLE_AUTH_FAILED', 'Google Calendar connection failed. Please reconnect.')
    }
    if (!expectJson) return
    try { return await response.json() } catch {
      throw new ApiError(502, 'GOOGLE_AUTH_FAILED', 'Google Calendar returned an invalid response.')
    }
  }
  return {
    async begin(userId) {
      const state = randomBytes(32).toString('base64url')
      await pool.query('delete from private.calendar_oauth_states where user_id = $1 or expires_at < now()', [userId])
      await pool.query('insert into private.calendar_oauth_states (state_hash, user_id, expires_at) values ($1, $2, $3)',
        [stateHash(state), userId, new Date(now() + 10 * 60_000)])
      const url = new URL(AUTH_URL)
      url.search = new URLSearchParams({
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        state,
      }).toString()
      return url.toString()
    },
    async callback({ state, code, error }) {
      if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(state)) {
        throw new ApiError(400, 'INVALID_OAUTH_STATE', 'Calendar connection expired. Start again.')
      }
      const result = await pool.query(
        'delete from private.calendar_oauth_states where state_hash = $1 and expires_at > now() returning user_id',
        [stateHash(state)])
      const userId = result.rows[0]?.user_id
      if (!userId) throw new ApiError(400, 'INVALID_OAUTH_STATE', 'Calendar connection expired. Start again.')
      if (error) return 'denied'
      if (typeof code !== 'string' || !code) {
        throw new ApiError(400, 'INVALID_OAUTH_CODE', 'Calendar connection failed. Start again.')
      }
      const tokens = await request(TOKEN_URL, {
        code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
        grant_type: 'authorization_code',
      })
      const grantedScopes = typeof tokens.scope === 'string' ? tokens.scope.split(' ') : []
      if (!grantedScopes.includes(SCOPE) || typeof tokens.refresh_token !== 'string' ||
          !tokens.refresh_token) {
        throw new ApiError(400, 'CALENDAR_RECONNECT_REQUIRED', 'Calendar permission or offline access was not granted. Reconnect.')
      }
      await pool.query(`insert into private.calendar_credentials
        (user_id, refresh_token_ciphertext, scopes) values ($1, $2, $3)
        on conflict (user_id) do update set refresh_token_ciphertext = excluded.refresh_token_ciphertext,
          scopes = excluded.scopes, updated_at = now()`,
      [userId, cipher.encrypt(tokens.refresh_token), grantedScopes])
      return 'connected'
    },
    async status(userId) {
      const result = await pool.query('select 1 from private.calendar_credentials where user_id = $1', [userId])
      return { connected: result.rows.length > 0 }
    },
    async getAccessToken(userId) {
      const result = await pool.query(
        'select refresh_token_ciphertext from private.calendar_credentials where user_id = $1', [userId])
      if (!result.rows.length) {
        throw new ApiError(409, 'CALENDAR_RECONNECT_REQUIRED', 'Connect Google Calendar first.')
      }
      const refreshToken = cipher.decrypt(result.rows[0].refresh_token_ciphertext)
      let tokens
      try {
        tokens = await request(TOKEN_URL, {
          client_id: env.GOOGLE_OAUTH_CLIENT_ID,
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        })
      } catch (error) {
        if (error.code === 'CALENDAR_RECONNECT_REQUIRED') {
          await pool.query('delete from private.calendar_credentials where user_id = $1', [userId])
        }
        throw error
      }
      if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
        throw new ApiError(502, 'GOOGLE_AUTH_FAILED', 'Google Calendar returned an invalid response.')
      }
      return tokens.access_token // Server integration only; never send this through an API route.
    },
    async disconnect(userId) {
      await pool.query('delete from private.calendar_oauth_states where user_id = $1', [userId])
      const result = await pool.query(
        'delete from private.calendar_credentials where user_id = $1 returning refresh_token_ciphertext', [userId])
      if (!result.rows.length) return { disconnected: true, revoked: false }
      let revoked = false
      try {
        const token = cipher.decrypt(result.rows[0].refresh_token_ciphertext)
        await request(REVOKE_URL, { token }, false)
        revoked = true
      } catch {
        // Local access is removed even if Google is unavailable or already revoked.
      }
      return { disconnected: true, revoked }
    },
  }
}
