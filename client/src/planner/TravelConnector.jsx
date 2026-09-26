/**
 * Journey between two rows. The plan has no legs until routes are calculated
 * (DM-07), and travel without a leg is unknown, never zero (ARCHITECTURE §5).
 */
export default function TravelConnector({ leg }) {
  const text = leg?.status === 'ready'
    ? `${leg.provider === 'demo' ? 'Simulated · ' : leg.provider === 'google' ? 'Google Maps · ' : ''}${Math.ceil(leg.travelSeconds / 60)} min ${leg.provider === 'same-place' ? '· same place' : leg.mode} · ${Math.round(leg.bufferSeconds / 60)} min buffer`
    : leg?.status === 'stale' ? 'Loading travel estimate…' : 'Travel unresolved'
  return (
    <div className="travel-connector">
      <span className="travel-connector-line" aria-hidden="true" />
      {text}
    </div>
  )
}
