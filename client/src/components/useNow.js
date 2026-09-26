import { useEffect, useState } from 'react'

/** Current time, refreshed on an interval. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
