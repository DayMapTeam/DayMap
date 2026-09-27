const idle = Object.freeze({ status: 'idle', options: [] })
const pending = Object.freeze({ status: 'pending', options: [] })

/** One key per pair of places and departure time. */
export function transitKey(from, to, departAt) {
  if (![from, to].every((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)) || !Number.isFinite(Date.parse(departAt))) return null
  return `${from.lat},${from.lng}>${to.lat},${to.lng}@${new Date(departAt).toISOString()}`
}

/**
 * Public-transport services per journey for this session: each journey and
 * departure is requested once, and the planner and the journey popup share
 * the answer, including which service the user picked. Nothing is stored
 * beyond the page.
 *
 * @param {(request: { from: object, to: object, departAt: string }) => Promise<object[]>} provider
 */
export function createTransitStore(provider) {
  let snapshot = new Map()
  const listeners = new Set()
  const publish = (key, value) => {
    snapshot = new Map(snapshot)
    snapshot.set(key, Object.freeze(value))
    for (const listener of listeners) listener()
  }
  return {
    /** `from` and `to` are locations ({ lat, lng }). */
    request(from, to, departAt) {
      const key = transitKey(from, to, departAt)
      if (!key || snapshot.has(key)) return
      publish(key, pending)
      provider({ from, to, departAt }).then(
        (options) => publish(key, { status: 'ready', options }),
        () => publish(key, { status: 'error', options: [] }),
      )
    },
    /** The service the user picked for this journey and departure (`chosenId`). */
    choose(from, to, departAt, optionId) {
      const key = transitKey(from, to, departAt)
      const entry = key && snapshot.get(key)
      if (entry?.status !== 'ready' || !entry.options.some((option) => option.id === optionId)) return
      publish(key, { ...entry, chosenId: optionId })
    },
    lookup(from, to, departAt, results = snapshot) {
      const key = transitKey(from, to, departAt)
      return key ? results.get(key) ?? idle : idle
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
  }
}
