// Display helpers. Always pass the plan's IANA timezone; never assume a UTC
// offset, because Adelaide's changes with daylight saving.

function partsOf(date, options) {
  const parts = new Intl.DateTimeFormat('en-AU', options).formatToParts(date)
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

function clockParts(date, timeZone) {
  const { hour, minute, dayPeriod } = partsOf(new Date(date), {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return { time: `${hour}:${minute}`, period: dayPeriod.toLowerCase() }
}

/** Calendar date "2026-09-26" → "Sat 26 Sep". The date has no time, so format it in UTC. */
export function formatDayLabel(isoDate) {
  const { weekday, day, month } = partsOf(new Date(`${isoDate}T00:00:00Z`), {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  // en-AU abbreviates September as "Sept"; keep every month at three letters.
  return `${weekday} ${day} ${month.slice(0, 3)}`
}

/** Date or UTC timestamp → "7:50am" in the given timezone. */
export function formatClock(date, timeZone) {
  const { time, period } = clockParts(date, timeZone)
  return `${time}${period}`
}

/** "9:00 – 10:00am", or "11:30am – 12:15pm" when the range crosses noon. */
export function formatTimeRange(start, end, timeZone) {
  const from = clockParts(start, timeZone)
  const to = clockParts(end, timeZone)
  const fromLabel = from.period === to.period ? from.time : `${from.time}${from.period}`
  return `${fromLabel} – ${to.time}${to.period}`
}

/** UTC timestamp → "09:50", the value format of <input type="time">. */
export function toTimeInputValue(timestamp, timeZone) {
  const { hour, minute } = partsOf(new Date(timestamp), {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return `${hour}:${minute}`
}

/** 45 → "45 min", 60 → "1 hr", 90 → "1 hr 30 min". */
export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}
