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
  const { plan, selectedStopId, selectStop } = usePlan()
  const { now, isDemoTime } = usePlanClock(plan)
  // The popup opens only from a pin click on the map: { stopId, anchor } or null.
  const [popup, setPopup] = useState(null)
  const [revealRequest, setRevealRequest] = useState(null)

  const selectFromMap = useCallback((stopId, options) => {
    selectStop(stopId)
    if (options?.anchor) setPopup({ stopId, anchor: options.anchor })
  }, [selectStop])

  const closePopup = useCallback(() => setPopup(null), [])

  const viewInPlanner = useCallback((stopId) => {
    setPopup(null)
    setRevealRequest((previous) => ({ stopId, key: (previous?.key ?? 0) + 1 }))
  }, [])

  // The popup belongs to the selected stop; selecting another stop elsewhere closes it.
  if (popup !== null && popup.stopId !== selectedStopId) setPopup(null)

  return (
    <div className="app">
      {/* The popup cannot follow the camera, so any drag or zoom on the map closes it. */}
      <div onPointerDownCapture={closePopup} onWheelCapture={closePopup}>
        <MapView
          stops={plan.stops}
          legs={plan.legs}
          selectedStopId={selectedStopId}
          onSelectStop={selectFromMap}
        />
      </div>
      <AppHeader
        date={plan.date}
        timezone={plan.timezone}
        dataMode={plan.dataMode}
        now={now}
        isDemoTime={isDemoTime}
      />
      <div className="app-controls-top-left">
        <PlaceSearch />
      </div>
      <Planner now={now} revealRequest={revealRequest} />
      {popup !== null && (
        <StopPopup
          key={popup.stopId}
          stopId={popup.stopId}
          anchor={popup.anchor}
          onClose={closePopup}
          onViewInPlanner={viewInPlanner}
        />
      )}
    </div>
  )
}

export default App
