import { useEffect, useId, useRef, useState } from 'react'
import './buttons.css'
import './AccountMenu.css'

function authMessage(error) {
  const text = String(error?.message ?? '')
  if (/invalid login credentials/i.test(text)) return 'That email and password don’t match an account.'
  if (/email not confirmed/i.test(text)) return 'Confirm your email first, then sign in.'
  if (/already registered/i.test(text)) return 'That email already has an account. Sign in instead.'
  if (/provider is not enabled/i.test(text)) return 'Google sign-in isn’t enabled for this DayMap project yet.'
  if (/password/i.test(text)) return text
  return 'Sign-in didn’t work. Check your connection and try again.'
}

function SignInForm({ account }) {
  const [mode, setMode] = useState('sign-in')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const emailId = useId()
  const passwordId = useId()

  async function run(action) {
    setBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (error) {
      setMessage({ tone: 'error', text: authMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    run(async () => {
      if (mode === 'sign-in') {
        await account.signInWithPassword(email, password)
        return
      }
      const needsConfirmation = await account.signUp(email, password)
      if (needsConfirmation) setMessage({ tone: 'info', text: `Check ${email} for a link to confirm your account.` })
    })
  }

  return (
    <>
      <h2 className="account-title">{mode === 'sign-in' ? 'Sign in to DayMap' : 'Create your DayMap account'}</h2>
      <p className="account-text">Your day is saved to your account, so it’s still here after a refresh.</p>
      <button type="button" className="account-google" disabled={busy} onClick={() => run(account.signInWithGoogle)}>
        <span className="account-google-mark" aria-hidden="true">G</span>
        Continue with Google
      </button>
      <div className="account-divider"><span>or</span></div>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor={emailId}>Email</label>
        <input id={emailId} name="email" type="email" autoComplete="email" required />
        <label htmlFor={passwordId}>Password</label>
        <input
          id={passwordId}
          name="password"
          type="password"
          minLength={6}
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          required
        />
        {message && (
          <p className={`account-message account-message-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
        <button type="submit" className="button-filled" disabled={busy}>
          {mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        type="button"
        className="button-text account-switch"
        onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(null) }}
      >
        {mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </>
  )
}

/**
 * Account button and popover at the right of the header. Signed out it offers
 * sign-in; signed in it shows the account and whatever `children` adds (for
 * example Calendar controls).
 *
 * @param {object} props
 * @param {ReturnType<import('../app/useAccount.js').useAccount>} props.account
 * @param {() => void} props.onResetDemo Restores the demo day's original stops.
 * @param {import('react').ReactNode} [props.children]
 */
export default function AccountMenu({ account, onResetDemo, children }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()
  const { user } = account

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Signing in or out closes the popover.
  const [lastUserId, setLastUserId] = useState(user?.id ?? null)
  if ((user?.id ?? null) !== lastUserId) {
    setLastUserId(user?.id ?? null)
    setOpen(false)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  const initial = (user?.email ?? '?').slice(0, 1).toUpperCase()
  let body
  if (account.checking) {
    body = <p className="account-text">Checking your sign-in…</p>
  } else if (user) {
    body = (
      <>
        <p className="account-signed-in">Signed in as <strong>{user.email}</strong></p>
        {children}
        <button type="button" className="button-text account-sign-out" onClick={() => account.signOut()}>
          Sign out
        </button>
      </>
    )
  } else if (account.configured) {
    body = <SignInForm account={account} />
  } else {
    body = (
      <>
        <h2 className="account-title">Sign-in isn’t set up</h2>
        <p className="account-text">
          This copy of DayMap has no Supabase settings, so it shows the demo day. Add
          {' '}<code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to
          {' '}<code>client/.env.local</code> and restart to save real days.
        </p>
      </>
    )
  }

  return (
    <div className="account" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={user ? 'account-avatar' : 'account-button'}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={user ? `Account: ${user.email}` : undefined}
        onClick={() => setOpen(!open)}
      >
        {user ? initial : 'Sign in'}
      </button>
      {open && (
        <div id={panelId} className="account-panel glass" role="dialog" aria-label="Account">
          {body}
          {!user && !account.checking && (
            <button type="button" className="button-text account-reset" onClick={() => { onResetDemo(); setOpen(false) }}>
              Reset demo day
            </button>
          )}
        </div>
      )}
    </div>
  )
}
