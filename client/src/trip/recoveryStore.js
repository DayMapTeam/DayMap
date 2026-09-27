import { currentRecovery, RECOVERY } from './recovery.js'

const EMPTY = Object.freeze({ key: null, status: 'idle', results: [] })

/** One in-memory comparison. Superseded responses cannot restore old routes or coordinates. */
export function createRecoveryStore(provider, { timeoutMs = 12000 } = {}) {
  let snapshot = EMPTY
  let generation = 0
  let cancel = () => {}
  const listeners = new Set()
  const publish = (next) => { snapshot = next; listeners.forEach((listener) => listener()) }
  function clear() {
    generation++
    cancel()
    if (snapshot !== EMPTY) publish(EMPTY)
  }
  function request({ key, from, to, now, modes, demo = false }) {
    if (snapshot.key === key && (snapshot.status === 'loading' || currentRecovery(snapshot, { key, from, now }))) return
    // Moving invalidates the displayed options immediately, but cannot cause a request on every GPS update.
    if (snapshot.key === key && now - snapshot.departAt < RECOVERY.freshnessMs) return
    cancel()
    const id = ++generation
    publish({ key, from: { lat: from.lat, lng: from.lng }, departAt: now, demo, status: 'loading', results: [] })
    const timers = []
    cancel = () => timers.forEach(clearTimeout)
    Promise.all(modes.map(async (mode) => {
      try {
        const route = await Promise.race([
          Promise.resolve().then(() => provider({ from, to, mode, departAt: new Date(now).toISOString() })),
          new Promise((_, reject) => timers.push(setTimeout(() => reject(new Error('timeout')), timeoutMs))),
        ])
        return { mode, route }
      } catch { return { mode, route: null } }
    })).then((results) => {
      if (id !== generation) return
      cancel()
      publish({ ...snapshot, status: 'ready', results })
    })
  }
  return { request, clear, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) }, getSnapshot: () => snapshot }
}
