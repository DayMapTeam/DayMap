import { usePlan } from './app/planContext.js'
import AppHeader from './components/AppHeader.jsx'
import PlaceSearch from './components/PlaceSearch.jsx'
import { usePlanClock } from './components/usePlanClock.js'
import MapView from './map/MapView.jsx'
import Planner from './planner/Planner.jsx'
import './App.css'

function App() {
  const { plan, selectedStopId, selectStop } = usePlan()
  const { now, isDemoTime } = usePlanClock(plan)

  return (
    <div className="app">
      <MapView
        stops={plan.stops}
        legs={plan.legs}
        selectedStopId={selectedStopId}
        onSelectStop={selectStop}
      />
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
      <Planner now={now} />
    </div>
  )
}

export default App
