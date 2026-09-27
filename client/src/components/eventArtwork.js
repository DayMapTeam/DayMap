// A small, predictable set of illustrations for events without a place photo.
// Prefer the event name; the location only helps when the name is generic.
const EVENT_TYPES = [
  ['groceries', /\b(grocer(?:y|ies)?|supermarket|produce|food shop|woolworths|coles|aldi)\b/i],
  ['coffee', /\b(coffee|cafe|café|espresso|brunch|tea break)\b/i],
  ['food', /\b(lunch|dinner|breakfast|restaurant|eat|meal|pizza|sushi|bakery|ice cream)\b/i],
  ['groceries', /\bmarket\b/i],
  ['study', /\b(lecture|class|study|library|school|university|uni|tutorial|exam|course)\b/i],
  ['fitness', /\b(gym|workout|fitness|yoga|run(?:ning)?|swim(?:ming)?|sport|training)\b/i],
  ['health', /\b(doctor|dentist|clinic|hospital|pharmacy|medical|health|physio)\b/i],
  ['nature', /\b(park|garden|beach|hike|walk|outdoors|picnic)\b/i],
  ['shopping', /\b(shop(?:ping)?|mall|store|retail|purchase)\b/i],
  ['home', /\b(home|house|apartment|flat)\b/i],
  ['work', /\b(work|office|meeting|standup|interview|conference|call|presentation)\b/i],
  ['travel', /\b(station|airport|bus|train|tram|travel|commute)\b/i],
]

export function eventArtworkType(title = '', place = '') {
  for (const text of [title, place]) {
    const match = EVENT_TYPES.find(([, pattern]) => pattern.test(text))
    if (match) return match[0]
  }
  return 'place'
}
