/** Small line icon for a way of travelling. Decorative: the text always names the mode. */
export default function TravelModeIcon({ mode, size = 14 }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true, className: 'travel-mode-icon' }
  if (mode === 'transit') {
    return (
      <svg {...common}>
        <rect x="3" y="1.75" width="10" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 7.5h10M5.5 14.25l1-2M10.5 14.25l-1-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="5.75" cy="10" r="0.9" fill="currentColor" />
        <circle cx="10.25" cy="10" r="0.9" fill="currentColor" />
      </svg>
    )
  }
  if (mode === 'drive') {
    return (
      <svg {...common}>
        <path d="M2.5 10.5V8l1.6-3.6a1.5 1.5 0 0 1 1.4-.9h5a1.5 1.5 0 0 1 1.4.9L13.5 8v2.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M2.5 8h11M4.5 11.5v1.25M11.5 11.5v1.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (mode === 'walk') {
    return (
      <svg {...common}>
        <circle cx="8.5" cy="2.75" r="1.5" fill="currentColor" />
        <path d="M7.75 5.5 6.5 9.5l2.25 1.75.75 3.5M7.75 5.5l2 2.5 2 .5M7.75 5.5 5.25 7l-.75 2.25M6.5 9.5l-1.5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v3.25l2 1.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
