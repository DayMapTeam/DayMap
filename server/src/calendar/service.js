import { createHash, randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { ApiError } from '../middleware/apiError.js'
import { createTokenCipher } from './tokenCipher.js'
import { listCalendarEvents } from '../integrations/googleCalendar.js'

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const stateHash = state => createHash('sha256').update(state).digest('hex')
// A pooled connection the database (or Supabase's pooler) closed while it sat idle.
const CONNECTION_LOST = /Connection terminated|ECONNRESET|EPIPE|Client has encountered a connection error/i
const connectionLost = error => ['ECONNRESET', 'EPIPE', '57P01'].includes(error?.code) || CONNECTION_LOST.test(error?.message ?? '')

/** A new pool that survives idle disconnects: it drops stale clients and retries a lost connection once. */
function resilientPool(connectionString) {
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, keepAlive: true })
  // An idle client losing its connection emits here; without a listener it would crash the server.
  pool.on('error', error => console.error('Calendar database connection closed:', error?.code ?? '', error?.message))
  return {
    async query(...args) {
      try {
        return await pool.query(...args)
      } catch (error) {
        if (!connectionLost(error)) throw error
        try { return await pool.query(...args) } catch (retryError) {
          if (!connectionLost(retryError)) throw retryError
          throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'DayMap couldn’t reach its database. Please try again.', true)
        }
      }
    },
  }
}

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
  const pool = db ?? resilientPool(env.DATABASE_URL)
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
      // Cleanup runs outside the per-user transaction so it cannot hold other
      // users' state rows while waiting for this user's advisory lock.
      await pool.query('delete from private.calendar_oauth_states where expires_at <= now()')
      await pool.query('select private.begin_calendar_connection($1, $2, $3)',
        [userId, stateHash(state), new Date(now() + 10 * 60_000)])
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
        `update private.calendar_oauth_states set claimed_at = now()
          where state_hash = $1 and expires_at > now() and claimed_at is null returning user_id`,
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
      // This atomic database operation serializes with begin/disconnect across
      // server instances. Network I/O above never holds a database lock.
      const saved = await pool.query('select private.finish_calendar_connection($1, $2, $3, $4) as connected',
        [userId, stateHash(state), cipher.encrypt(tokens.refresh_token), grantedScopes])
      if (!saved.rows[0]?.connected) {
        throw new ApiError(409, 'CALENDAR_CONNECTION_CANCELLED', 'Calendar connection was cancelled or replaced. Start again.')
      }
      return 'connected'
    },
    /** Start-up check that the Calendar migrations (003 and 004) are applied. */
    async check() {
      const result = await pool.query(`select to_regclass('private.calendar_credentials') is not null
        and to_regproc('private.finish_calendar_connection') is not null as ready`)
      if (!result.rows[0]?.ready) throw new Error('Calendar tables or functions are missing. Apply migrations 003 and 004.')
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
          // A delayed failure from an old token must not remove a newer grant.
          await pool.query('delete from private.calendar_credentials where user_id = $1 and refresh_token_ciphertext = $2',
            [userId, result.rows[0].refresh_token_ciphertext])
        }
        throw error
      }
      if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
        throw new ApiError(502, 'GOOGLE_AUTH_FAILED', 'Google Calendar returned an invalid response.')
      }
      const current = await pool.query(
        'select 1 from private.calendar_credentials where user_id = $1 and refresh_token_ciphertext = $2',
        [userId, result.rows[0].refresh_token_ciphertext])
      if (!current.rows.length) throw new ApiError(409, 'CALENDAR_RECONNECT_REQUIRED', 'Calendar connection changed. Try again.')
      return tokens.access_token // Server integration only; never send this through an API route.
    },
    /** The primary calendar's events between two instants. The access token never leaves this service. */
    async listDayEvents(userId, { timeMin, timeMax }) {
      const accessToken = await this.getAccessToken(userId)
      return listCalendarEvents({ accessToken, calendarId: 'primary', timeMin, timeMax, fetchImpl })
    },
    async disconnect(userId) {
      const result = await pool.query(
        'select private.disconnect_calendar($1) as refresh_token_ciphertext', [userId])
      if (!result.rows[0]?.refresh_token_ciphertext) return { disconnected: true, revoked: false }
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
