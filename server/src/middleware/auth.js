import { ApiError } from './apiError.js'

export function requireAuth(supabase) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s,]+)$/i.exec(req.get('authorization') ?? '')
    if (!match) throw new ApiError(401, 'INVALID_SESSION', 'A valid Bearer session is required.')
    if (!supabase) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Sign-in is not configured on this server.')
    const token = match[1]
    // Auth verifies the token remotely; never trust a locally decoded JWT/userId.
    const user = await supabase.request('/auth/v1/user', token)
    if (!user?.id || user.role !== 'authenticated') {
      throw new ApiError(401, 'INVALID_SESSION', 'Sign in again to continue.')
    }
    req.auth = { userId: user.id, token }
    res.set('Cache-Control', 'no-store')
    next()
  }
}
