const FEATURES = [
  { name: 'Sign-in and saved days', vars: ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] },
  { name: 'Google Calendar', vars: ['DATABASE_URL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY'] },
]

/**
 * One start-up line per optional feature, naming missing variables but never
 * printing a value. Partial configurations already stop the server earlier.
 */
export function describeConfiguration(env = process.env) {
  const on = new Map(FEATURES.map(({ name, vars }) => [name, vars.every(name => env[name])]))
  return FEATURES.map(({ name, vars }) => {
    if (!on.get(name)) return `${name}: off (set ${vars.join(', ')} in server/.env)`
    if (name === 'Google Calendar' && !on.get('Sign-in and saved days')) return `${name}: on, but unusable until sign-in is configured`
    return `${name}: on`
  })
}
