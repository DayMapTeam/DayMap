import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlan } from './app/planContext.js'
import { usePlanAnalysis } from './app/usePlanAnalysis.js'
import { readDemoPlan, sessionStore, writeDemoPlan } from './app/planPersistence.js'
import { useAccount } from './app/useAccount.js'
import { useCalendar } from './app/useCalendar.js'
import { usePlanSync } from './app/usePlanSync.js'
import AccountMenu from './components/AccountMenu.jsx'
import AppHeader from './components/AppHeader.jsx'
import CalendarSection from './components/CalendarSection.jsx'
import { Notice, SyncBanner, SyncChip } from './components/PlanSyncStatus.jsx'
import PlaceSearch from './components/PlaceSearch.jsx'
import { usePlanClock } from './components/usePlanClock.js'
import MapView from './map/MapView.jsx'
import EmptyDay from './planner/EmptyDay.jsx'
import Planner from './planner/Planner.jsx'
import StopPopup from './planner/StopPopup.jsx'
import TripDock from './trip/TripDock.jsx'
import { bearingDegrees, offsetPoint, tripStops } from './trip/tripRules.js'
import { useLocation } from './trip/useLocation.js'
import { splitRoute } from './trip/navigation.js'
import { useNavigation } from './trip/useNavigation.js'
import { useVoiceGuidance } from './trip/useVoiceGuidance.js'
import { useWakeLock } from './trip/useWakeLock.js'
import { useTrip } from './trip/useTrip.js'
import { demoPlan } from '../../shared/fixtures/demoPlan.js'
import './App.css'

function App() {
  const { plan, draft, selectedStopId, selectStop, clearSelection, loadPlan } = usePlan()
  const account = useAccount()
  const userId = account.user?.id ?? null
  const sync = usePlanSync(userId)
  const calendar = useCalendar({ userId, sync, plan, draft })
  const resetDemo = useCallback(() => {
    writeDemoPlan(sessionStore(), null)
    if (plan.dataMode === 'demo') loadPlan(readDemoPlan(sessionStore(), demoPlan))
  }, [plan.dataMode, loadPlan])
  const [previewPlace, setPreviewPlace] = useState(null)
  const { now, isDemoTime } = usePlanClock(plan)
  const planning = usePlanAnalysis(plan, draft, now)
  // The popup opens only from a pin click on the map: { stopId, anchor } or null.
  const [popup, setPopup] = useState(null)
  const [revealRequest, setRevealRequest] = useState(null)

  // Trips use the accepted plan and the device's position, watched while DayMap is open.
  const location = useLocation()
  const reading = location.position
  const trip = useTrip({ plan, now, reading })
  const tripTargetId = trip.target?.id ?? null
  // Live guidance: a route from where you are (or the stop before) to the destination.
  const plannedLeg = planning.analysis.legs.find((leg) => leg.toStopId === tripTargetId)
  const previousStop = plannedLeg ? plan.stops.find((stop) => stop.id === plannedLeg.fromStopId) : null
  const navigation = useNavigation({
    target: trip.target,
    plannedMode: plannedLeg?.mode ?? null,
    reading,
    fallbackOrigin: trip.atStop?.location ?? previousStop?.location ?? null,
  })
  // Navigation mode: like Google Maps on a phone, the map takes the whole screen.
  const navigating = tripTargetId !== null
  const voice = useVoiceGuidance({
    route: navigation.route,
    progress: navigation.progress,
    destination: trip.target?.title ?? null,
    notice: trip.state.notice && { ...trip.state.notice, title: trip.noticeStop?.title ?? null },
  })
  useWakeLock(navigating)
  // On the route, you are drawn on it (like Google Maps snapping to the road).
  const shownPosition = useMemo(() => (navigating && navigation.progress && navigation.progress.offRouteMeters <= 25
    ? { ...reading, ...navigation.progress.snapped } : reading), [navigating, navigation.progress, reading])
  const routeSplit = useMemo(() => (navigation.route ? splitRoute(navigation.route, navigation.progress) : null),
    [navigation.route, navigation.progress])

  // The camera follows each new trip until the person moves the map, and
  // picks up again by itself after a few seconds, like Google Maps.
  const [followState, setFollowState] = useState({ tripId: null, paused: false, pausedAt: 0 })
  if (followState.tripId !== tripTargetId) setFollowState({ tripId: tripTargetId, paused: false, pausedAt: 0 })
  const following = navigating && !followState.paused
  const follow = useMemo(() => {
    if (!following) return null
    const start = navigation.route?.path[0]
    if (!shownPosition) return start ? { center: start, heading: bearingDegrees(start, navigation.route.path[1] ?? trip.target.location) } : { center: trip.target.location }
    // Look along the route ahead, and centre a little ahead so you sit low on the screen, like Google Maps.
    const heading = bearingDegrees(shownPosition, navigation.progress?.ahead ?? trip.target.location)
    return { center: offsetPoint(shownPosition, heading, 90), heading }
  }, [following, shownPosition, trip.target, navigation.route, navigation.progress])
  const pauseFollow = useCallback(() => {
    setFollowState((current) => (current.tripId === null ? current : { ...current, paused: true, pausedAt: Date.now() }))
  }, [])
  const recenter = useCallback(() => setFollowState((current) => ({ ...current, paused: false })), [])
  const { paused: followPaused, pausedAt } = followState
  useEffect(() => {
    if (!followPaused) return undefined
    const timer = setTimeout(recenter, 10000)
    return () => clearTimeout(timer)
  }, [followPaused, pausedAt, recenter])

  const { go: startTrip } = trip
  const navigableIds = useMemo(() => new Set(tripStops(plan).map((stop) => stop.id)), [plan])

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
    <div className="app" data-navigating={navigating || undefined}>
      <MapView
        stops={planning.shown.stops}
        stopStates={planning.stopStates}
        selectedStopId={selectedStopId}
        onSelectStop={selectFromMap}
        onClearSelection={dismiss}
        onCameraMove={closePopup}
        now={now}
        previewPlace={previewPlace}
        userPosition={shownPosition}
        tripActive={navigating}
        follow={follow}
        onUserCameraMove={pauseFollow}
        route={navigating ? navigation.route : null}
        routeSplit={navigating ? routeSplit : null}
      />
      <AppHeader
        date={plan.date}
        timezone={plan.timezone}
        dataMode={plan.dataMode}
        now={now}
        isDemoTime={isDemoTime}
      >
        <SyncChip sync={sync} />
        <AccountMenu account={account} onResetDemo={resetDemo}>
          <CalendarSection calendar={calendar} />
        </AccountMenu>
      </AppHeader>
      <div className="app-notices">
        <SyncBanner sync={sync} />
        {calendar.notice && (
          <Notice
            tone={calendar.notice.tone}
            text={calendar.notice.text}
            actions={calendar.notice.reconnect && (
              <button type="button" className="button-filled" onClick={calendar.connect}>Reconnect</button>
            )}
            onDismiss={calendar.notice.tone === 'progress' ? undefined : calendar.dismissNotice}
          />
        )}
      </div>
      <div className="app-controls-top-left">
        <PlaceSearch onPlaceSelect={setPreviewPlace} />
      </div>
      <TripDock
        trip={trip}
        navigation={navigation}
        voice={voice}
        reading={reading}
        now={now}
        timezone={plan.timezone}
        onGo={startTrip}
        following={following}
        hasPosition={reading !== null}
        onRecenter={recenter}
      />
      <Planner
        now={now}
        revealRequest={revealRequest}
        planning={planning}
        emptyState={<EmptyDay calendar={userId ? calendar : null} />}
      />
      {popup !== null && (
        <StopPopup
          key={popup.stopId}
          stopId={popup.stopId}
          anchor={popup.anchor}
          onClose={dismiss}
          onViewInPlanner={viewInPlanner}
          onDirections={navigableIds.has(popup.stopId) ? (stopId) => { dismiss(); startTrip(stopId) } : null}
        />
      )}
    </div>
  )
}

export default App
