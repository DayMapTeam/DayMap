/** Exact local-calendar-day boundaries, including daylight-saving changes. */
export function planDayBounds(date, timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) throw new TypeError('Plan timezone is required')
  const nominal = Date.parse(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(nominal)
    || new Date(nominal).toISOString().slice(0, 10) !== date) throw new TypeError('Invalid plan date')
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const localDate = (ms) => {
    const parts = Object.fromEntries(formatter.formatToParts(ms).map((part) => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  }
  const boundary = (target, guess) => {
    let lo = guess - 36 * 3600000
    let hi = guess + 36 * 3600000
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (localDate(mid) < target) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const next = new Date(nominal + 86400000).toISOString().slice(0, 10)
  const start = boundary(date, nominal)
  const end = boundary(next, nominal + 86400000)
  if (localDate(start) !== date || end <= start) throw new TypeError('Plan date does not exist in timezone')
  return { start, end }
}
