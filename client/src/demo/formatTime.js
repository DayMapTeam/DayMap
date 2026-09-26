export function formatTime(timestamp, timezone) {
  if (!timestamp) return 'Time not set'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}
