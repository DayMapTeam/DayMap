import { useEffect } from 'react'

/** Keeps the screen on while `active`, where the browser supports it. */
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return undefined
    let lock = null
    let released = false
    const request = () => {
      navigator.wakeLock.request('screen').then((sentinel) => {
        if (released) sentinel.release()
        else lock = sentinel
      }, () => {})
    }
    // The browser drops the lock when the tab is hidden; take it again on return.
    const onVisible = () => { if (document.visibilityState === 'visible') request() }
    request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [active])
}
