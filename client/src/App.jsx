import { useCallback, useState } from 'react'
import { usePlan } from './app/planContext.js'
import AppHeader from './components/AppHeader.jsx'
import PlaceSearch from './components/PlaceSearch.jsx'
import { usePlanClock } from './components/usePlanClock.js'
import MapView from './map/MapView.jsx'
import Planner from './planner/Planner.jsx'
import StopPopup from './planner/StopPopup.jsx'
import './App.css'

function App() {
  const { plan, selectedStopId, selectStop, clearSelection } = usePlan()
  const [previewPlace, setPreviewPlace] = useState(null)
  const { now, isDemoTime } = usePlanClock(plan)
  // The popup opens only from a pin click on the map: { stopId, anchor } or null.
  const [popup, setPopup] = useState(null)
  const [revealRequest, setRevealRequest] = useState(null)

  // Esc, ×, clicking the open pin again, or clicking the empty map: close and deselect.
  const dismiss = useCallback(() => {
    setPopup(null)
    clearSelection()
  }, [clearSelection])

  const selectFromMap = useCallback((stopId, { anchor }) => {
    if (popup?.stopId === stopId) {
      dismiss()
      return
    }
    selectStop(stopId)
    setPopup({ stopId, anchor })
  }, [popup, dismiss, selectStop])

  // The popup is placed on screen and cannot follow the camera, so it closes when
  // the camera moves. The stop stays selected.
  const closePopup = useCallback(() => setPopup(null), [])

  // The popup stays open while the planner reveals the row.
  const viewInPlanner = useCallback((stopId) => {
    setRevealRequest((previous) => ({ stopId, key: (previous?.key ?? 0) + 1 }))
  }, [])

  // The popup belongs to the selected stop; selecting another stop elsewhere closes it.
  if (popup !== null && popup.stopId !== selectedStopId) setPopup(null)

  return (
    <div className="app">
      <MapView
        stops={plan.stops}
        legs={plan.legs}
        selectedStopId={selectedStopId}
        onSelectStop={selectFromMap}
        onClearSelection={dismiss}
        onCameraMove={closePopup}
        now={now}
        previewPlace={previewPlace}
      />
      <AppHeader
        date={plan.date}
        timezone={plan.timezone}
        dataMode={plan.dataMode}
        now={now}
        isDemoTime={isDemoTime}
      />
      <div className="app-controls-top-left">
        <PlaceSearch onPlaceSelect={setPreviewPlace} />
      </div>
      <Planner now={now} revealRequest={revealRequest} />
      {popup !== null && (
        <StopPopup
          key={popup.stopId}
          stopId={popup.stopId}
          anchor={popup.anchor}
          onClose={dismiss}
          onViewInPlanner={viewInPlanner}
        />
      )}
    </div>
  )
}

export default App
