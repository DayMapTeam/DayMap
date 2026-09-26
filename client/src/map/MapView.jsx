import './MapView.css'

/**
 * Placeholder for the map adapter (ARCHITECTURE §4). Rafid replaces the body
 * with the Google Maps renderer in DM-03; the interface stays the same.
 *
 * @param {object} props
 * @param {object[]} props.stops Plan stops (§5 shape). Unlocated stops are skipped.
 * @param {object[]} props.legs Journey legs between stops.
 * @param {string | null} props.selectedStopId
 * @param {(stopId: string) => void} props.onSelectStop
 */
export default function MapView({ stops }) {
  const located = stops.filter((stop) => stop.location !== null).length

  return (
    <div className="map-view" role="region" aria-label="Map">
      <p className="map-view-caption glass">Map placeholder · {located} located stops</p>
    </div>
  )
}
