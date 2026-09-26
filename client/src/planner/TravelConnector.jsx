/**
 * Journey between two rows. The plan has no legs until routes are calculated
 * (DM-07), and travel without a leg is unknown, never zero (ARCHITECTURE §5).
 */
export default function TravelConnector() {
  return (
    <div className="travel-connector">
      <span className="travel-connector-line" aria-hidden="true" />
      Travel unknown
    </div>
  )
}
