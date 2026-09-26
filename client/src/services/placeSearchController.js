// Owns request ordering so typing/clearing wins over late provider responses.
export function createPlaceSearchController({ provider, onState, onSelect, delay = 300 }) {
  let version = 0
  let timer
  let disposed = false
  const current = (id) => !disposed && id === version

  function cancel() {
    clearTimeout(timer)
    return ++version
  }

  return {
    search(query) {
      const id = cancel()
      onSelect(null)
      const input = query.trim()
      if (input.length < 2) {
        provider.reset()
        onState({ status: 'idle', results: [] })
        return
      }
      onState({ status: 'loading', results: [] })
      timer = setTimeout(async () => {
        try {
          const results = await provider.suggest(input)
          if (current(id)) onState({ status: results.length ? 'results' : 'empty', results })
        } catch {
          if (current(id)) onState({ status: 'error', results: [] })
        }
      }, delay)
    },
    async select(result) {
      const id = cancel()
      onState({ status: 'resolving', results: [] })
      try {
        const place = await provider.resolve(result)
        if (!current(id)) return
        onSelect(place)
        onState({ status: 'selected', results: [], place })
      } catch {
        if (current(id)) onState({ status: 'error', results: [] })
      }
    },
    dispose() {
      disposed = true
      cancel()
      provider.reset()
    },
  }
}
