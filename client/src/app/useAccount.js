import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabase.js'

/**
 * The DayMap sign-in (Supabase Auth). This is not Google Calendar access:
 * Calendar is connected separately (ARCHITECTURE §8).
 *
 * `session` is undefined while the saved session is being checked.
 */
export function useAccount() {
  const [session, setSession] = useState(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }, [])
  const signInWithPassword = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])
  // Returns true when the project asks the person to confirm their email first.
  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { emailRedirectTo: window.location.origin },
    })
    if (error) throw error
    return data.session === null
  }, [])
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return {
    configured: supabase !== null,
    checking: session === undefined,
    user: session?.user ?? null,
    signInWithGoogle,
    signInWithPassword,
    signUp,
    signOut,
  }
}
