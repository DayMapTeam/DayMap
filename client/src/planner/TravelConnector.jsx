const MODE_TEXT = { walk: 'walk', transit: 'by public transport', drive: 'drive' }

/**
 * Journey between two rows. Travel without a verified estimate is unknown,
 * never zero (ARCHITECTURE §5).
 */
export default function TravelConnector({ leg }) {
  let text = 'Travel unresolved'
  if (leg?.status === 'ready') {
    const source = leg.provider === 'demo' ? 'Simulated · ' : leg.provider === 'google' ? 'Google Maps · ' : ''
    const how = leg.provider === 'same-place' ? 'same place' : MODE_TEXT[leg.mode] ?? leg.mode
    const note = leg.modeSource === 'no-transit' ? ' (no public transport)' : ''
    text = `${source}${Math.ceil(leg.travelSeconds / 60)} min ${how}${note} · ${Math.round(leg.bufferSeconds / 60)} min buffer`
  } else if (leg?.status === 'stale') {
    text = 'Loading travel estimate…'
  }
  return (
    <div className="travel-connector" data-mode={leg?.status === 'ready' ? leg.mode : undefined}>
      <span className="travel-connector-line" aria-hidden="true" />
      {text}
    </div>
  )
}
