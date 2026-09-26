import { useEffect, useState } from 'react'

const STORAGE_KEY = 'daymap.plannerOpen'

function readStoredOpen() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Whether the planner is open (desktop) or expanded (mobile sheet). Remembered per browser. */
export function usePlannerOpen() {
  const [open, setOpen] = useState(readStoredOpen)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(open))
    } catch {
      // Storage unavailable (private window, blocked site data). The panel
      // still works for this visit.
    }
  }, [open])

  return [open, setOpen]
}
