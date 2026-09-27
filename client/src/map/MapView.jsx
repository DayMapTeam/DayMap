import { useEffect, useRef, useState } from 'react'
import { numberStops } from '../app/stopNumbers.js'
import { loadMapsLibrary, mapsApiKey as apiKey } from '../services/googleMaps.js'
import { arcApex, arcPath, arcStyle } from './journeyArc.js'
import { markerColors, markerTemplate, stopMarkerSvg } from './stopMarker.js'
import { chipFont, travelChipSvg } from './travelChip.js'
import { navigationArrowSvg, userMarkerSvg } from './userMarker.js'
import './MapView.css'

// A pointer press older than this is not the one that clicked the pin.
const POINTER_CLICK_WINDOW_MS = 1000
// A map click this soon after a pin click is the same click, not an empty-map click.
const PIN_CLICK_GRACE_MS = 300
// Above this tilt the pins use a shorter stem.
const STEEP_TILT = 45
const CAMERA_EVENTS = ['gmp-centerchange', 'gmp-rangechange', 'gmp-headingchange', 'gmp-tiltchange']
// Navigation camera: low and close behind the person, looking where they are heading.
const FOLLOW_RANGE = 320
const FOLLOW_TILT = 62
const FOLLOW_FLY_MS = 1000
// A drag shorter than this is a click, not a camera move.
const DRAG_PX = 6
const CAMERA_KEYS = /^(Arrow|Page|Home$|End$|[-+=_]$)/

const flyMillis = (millis) => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : millis)

function isValidLocation(location) {
  return Boolean(location) && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180
}

function isFinished(stop, now) {
  return now !== undefined && stop.timing.scheduledEndAt !== null
    && Date.parse(stop.timing.scheduledEndAt) <= now.getTime()
}

// Chip priority among chips (3D markers reject negative zIndex). Pins are
// REQUIRED, so a chip overlapping a pin number is the one hidden.
const CHIP_Z = { current: 3, next: 2, later: 1, done: 0 }

let measureContext = null
function measureText(text, font) {
  measureContext ??= document.createElement('canvas').getContext('2d')
  measureContext.font = font
  // A little slack: the chip image may fall back to another font than the page.
  return measureContext.measureText(text).width + 4
}

/**
 * The map elements for one journey: its destination line, one smooth arc
 * from stop to stop with a bright core and a soft glow, and the travel chip
 * at the apex.
 */
function journeyElements(runtime, leg) {
  const { Polyline, PlainMarker, colors } = runtime
  const style = arcStyle(leg.state, colors)
  const arc = arcPath(leg.path[0], leg.path.at(-1))
  const elements = [new Polyline({
    path: arc, altitudeMode: 'RELATIVE_TO_GROUND', strokeColor: style.stroke, strokeWidth: style.width,
    outerColor: style.outer, outerWidth: style.outerWidth,
    drawsOccludedSegments: style.occluded, zIndex: style.zIndex,
  })]

  const apex = arcApex(arc)
  const chip = new PlainMarker({
    position: apex,
    altitudeMode: 'RELATIVE_TO_GROUND',
    collisionBehavior: 'OPTIONAL_AND_HIDES_LOWER_PRIORITY',
    drawsWhenOccluded: true,
    zIndex: CHIP_Z[leg.state] ?? CHIP_Z.later,
    label: leg.label,
  })
  chip.append(markerTemplate(travelChipSvg({ label: leg.label, faded: leg.state === 'done' }, colors,
    measureText(leg.label, chipFont(colors)))))
  elements.push(chip)
  return elements
}

/**
 * The 3D map. Every stop pin is drawn by stopMarkerSvg, and "you are here" by
 * userMarkerSvg; nothing else creates markers.
 *
 * - onSelectStop(stopId, { anchor }): a pin was clicked. `anchor` is the click
 *   point in map pixels, for the popup (the 3D map has no lat/lng-to-pixel API).
 * - onClearSelection(): the empty map was clicked.
 * - onCameraMove(): the camera moved, so a popup placed on screen is now stale.
 * - now: stops that ended before it are drawn faded.
 * - userPosition: { lat, lng, simulated? } draws "you are here", or null.
 * - tripActive: while true, the camera is saved; it flies back when the trip ends.
 * - follow: { center, heading } moves the camera with the person during a trip,
 *   or null. Only trips move the camera like this; nothing in the background does.
 * - onUserCameraMove(): the person dragged, scrolled or used keys on the map.
 * - legs: the day's journeys ({ id, state, path, label } from useJourneyLegs;
 *   path is [from, to]), each drawn as a curved destination
 *   line between its stops with a travel chip.
 * - route: the trip's route ({ steps: [{ kind, path, ride }] }) drawn on the ground, or null.
 * - routeSplit: { travelled, remaining } from splitRoute, to grey out what's behind you.
 */
export default function MapView({
  stops, legs = [], selectedStopId, onSelectStop, onClearSelection, onCameraMove, now, previewPlace = null, onSelectPreview, stopStates = {},
  userPosition = null, tripActive = false, follow = null, onUserCameraMove, route = null, routeSplit = null,
}) {
  const containerRef = useRef(null)
  const markersRef = useRef(new Map())
  const lastPointerRef = useRef(null)
  const lastPinClickRef = useRef(-Infinity)
  // Latest callbacks, so markers and map listeners are not rebuilt when they change.
  const callbacksRef = useRef({})
  const [runtime, setRuntime] = useState(null)
  const [steep, setSteep] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    callbacksRef.current = { onSelectStop, onSelectPreview, onClearSelection, onCameraMove, onUserCameraMove }
  }, [onSelectStop, onSelectPreview, onClearSelection, onCameraMove, onUserCameraMove])

  // Remember where the pointer went down. Capture phase, so the map cannot stop it first.
  useEffect(() => {
    const container = containerRef.current
    function rememberPointer(event) {
      const rect = container.getBoundingClientRect()
      lastPointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, at: event.timeStamp }
    }
    container.addEventListener('pointerdown', rememberPointer, true)
    return () => container.removeEventListener('pointerdown', rememberPointer, true)
  }, [])

  // Tell the trip when the person moves the camera themselves, so following stops.
  useEffect(() => {
    const container = containerRef.current
    let down = null
    const moved = () => callbacksRef.current.onUserCameraMove?.()
    const onDown = (event) => { down = { x: event.clientX, y: event.clientY } }
    const onMove = (event) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > DRAG_PX) {
        down = null
        moved()
      }
    }
    const onUp = () => { down = null }
    const onKey = (event) => { if (CAMERA_KEYS.test(event.key)) moved() }
    const listeners = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp],
      ['pointercancel', onUp], ['wheel', moved], ['keydown', onKey]]
    for (const [type, listener] of listeners) container.addEventListener(type, listener, { capture: true, passive: true })
    return () => {
      for (const [type, listener] of listeners) container.removeEventListener(type, listener, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!apiKey) return

    let cancelled = false
    let map
    let clickTimer

    function handleMapClick() {
      // Wait a tick: a pin's own click handler may run after the map's.
      clearTimeout(clickTimer)
      clickTimer = setTimeout(() => {
        if (performance.now() - lastPinClickRef.current > PIN_CLICK_GRACE_MS) {
          callbacksRef.current.onClearSelection?.()
        }
      }, 0)
    }
    function handleCameraChange() {
      setSteep(map.tilt > STEEP_TILT)
      callbacksRef.current.onCameraMove?.()
    }

    async function loadMap() {
      try {
        const maps3d = await loadMapsLibrary('maps3d')
        if (cancelled) return

        map = new maps3d.Map3DElement({
          center: { lat: -34.925, lng: 138.602, altitude: 0 },
          range: 2500,
          tilt: 60,
          heading: 0,
          // Keep Google's unrelated place labels out of the event map.
          mode: 'SATELLITE',
        })

        map.style.width = '100%'
        map.style.height = '100%'
        map.addEventListener('gmp-click', handleMapClick)
        for (const type of CAMERA_EVENTS) map.addEventListener(type, handleCameraChange)
        containerRef.current.append(map)
        setSteep(map.tilt > STEEP_TILT)
        setRuntime({ map, Marker: maps3d.Marker3DInteractiveElement, PlainMarker: maps3d.Marker3DElement,
          Polyline: maps3d.Polyline3DElement, colors: markerColors() })
      } catch {
        if (!cancelled) {
          setError('Could not load Google Maps. Check the browser console.')
        }
      }
    }

    loadMap()

    return () => {
      cancelled = true
      clearTimeout(clickTimer)
      map?.remove()
    }
  }, [])

  // Create one marker per located stop, in plan order so Tab follows the planner.
  useEffect(() => {
    if (!runtime) return
    const markers = markersRef.current

    for (const [id, { marker, handleClick }] of markers) {
      if (stops.some((stop) => stop.id === id && isValidLocation(stop.location))) continue
      marker.removeEventListener('gmp-click', handleClick)
      marker.remove()
      markers.delete(id)
    }

    for (const stop of stops) {
      if (!isValidLocation(stop.location)) continue
      const existing = markers.get(stop.id)
      if (existing) {
        existing.marker.position = { lat: stop.location.lat, lng: stop.location.lng }
        existing.marker.label = stop.title
        continue
      }
      const marker = new runtime.Marker({
        position: { lat: stop.location.lat, lng: stop.location.lng },
        altitudeMode: 'CLAMP_TO_GROUND',
        collisionBehavior: 'REQUIRED',
        drawsWhenOccluded: true,
        label: stop.title,
      })
      const handleClick = (event) => {
        const container = containerRef.current
        const pointer = lastPointerRef.current
        const recent = pointer !== null && event.timeStamp - pointer.at < POINTER_CLICK_WINDOW_MS
        // Keyboard activation has no pointer position: anchor to the map centre.
        const anchor = recent
          ? { x: pointer.x, y: pointer.y }
          : { x: container.clientWidth / 2, y: container.clientHeight / 2 }
        lastPointerRef.current = null
        lastPinClickRef.current = performance.now()
        callbacksRef.current.onSelectStop(stop.id, { anchor })
      }
      marker.addEventListener('gmp-click', handleClick)
      runtime.map.append(marker)
      markers.set(stop.id, { marker, handleClick })
    }

  }, [runtime, stops])

  useEffect(() => {
    const markers = markersRef.current
    return () => {
      for (const { marker, handleClick } of markers.values()) {
        marker.removeEventListener('gmp-click', handleClick)
        marker.remove()
      }
      markers.clear()
    }
  }, [runtime])

  // Draw each pin for its current state. Updating in place keeps the markers
  // (and keyboard focus on them) when only selection or tilt changes.
  useEffect(() => {
    if (!runtime) return
    const numbers = numberStops(stops)
    for (const stop of stops) {
      const entry = markersRef.current.get(stop.id)
      if (!entry) continue
      const selected = stop.id === selectedStopId
      const svg = stopMarkerSvg({
        number: numbers.get(stop.id),
        type: stop.timing.kind,
        state: { ...stopStates[stop.id], selected, past: isFinished(stop, now) },
        steep,
      }, runtime.colors)
      entry.marker.replaceChildren(markerTemplate(svg))
      entry.marker.zIndex = selected ? 10 : 0
      entry.marker.title = `${numbers.get(stop.id)}. ${stop.title}${selected ? ' (selected)' : ''}${stopStates[stop.id]?.note ? ` · ${stopStates[stop.id].note}` : ''}`
    }
  }, [runtime, stops, selectedStopId, now, steep, stopStates])

  // One temporary search pin, using the same artwork as the event markers.
  // It never becomes part of the plan until the add sheet is confirmed.
  useEffect(() => {
    if (!runtime || !isValidLocation(previewPlace)) return
    const { lat, lng, label } = previewPlace
    const marker = new runtime.Marker({
      position: { lat, lng }, altitudeMode: 'CLAMP_TO_GROUND',
      collisionBehavior: 'REQUIRED', drawsWhenOccluded: true,
      label: `${label} (preview)`, title: `${label} (preview, not in your day)`, zIndex: 20,
    })
    marker.append(markerTemplate(stopMarkerSvg({ type: 'search', steep }, runtime.colors)))
    const handleClick = (event) => {
      const container = containerRef.current
      const pointer = lastPointerRef.current
      const recent = pointer !== null && event.timeStamp - pointer.at < POINTER_CLICK_WINDOW_MS
      const anchor = recent ? { x: pointer.x, y: pointer.y }
        : { x: container.clientWidth / 2, y: container.clientHeight / 2 }
      lastPointerRef.current = null
      lastPinClickRef.current = performance.now()
      callbacksRef.current.onSelectPreview?.({ anchor })
    }
    marker.addEventListener('gmp-click', handleClick)
    runtime.map.append(marker)
    return () => {
      marker.removeEventListener('gmp-click', handleClick)
      marker.remove()
    }
  }, [runtime, previewPlace, steep])

  // "You are here". One marker, moved in place as readings arrive.
  const userMarkerRef = useRef(null)
  const simulated = Boolean(userPosition?.simulated)
  useEffect(() => {
    if (!runtime) return
    const marker = new runtime.PlainMarker({
      altitudeMode: 'CLAMP_TO_GROUND',
      collisionBehavior: 'REQUIRED',
      drawsWhenOccluded: true,
      zIndex: 30,
    })
    marker.append(markerTemplate(tripActive ? navigationArrowSvg(runtime.colors) : userMarkerSvg(runtime.colors, { simulated })))
    userMarkerRef.current = marker
    return () => {
      marker.remove()
      userMarkerRef.current = null
    }
  }, [runtime, simulated, tripActive])

  useEffect(() => {
    const marker = userMarkerRef.current
    if (!runtime || !marker) return
    if (!isValidLocation(userPosition)) {
      marker.remove()
      return
    }
    marker.position = { lat: userPosition.lat, lng: userPosition.lng }
    if (!marker.isConnected) runtime.map.append(marker)
  }, [runtime, userPosition, simulated, tripActive])

  // Save the camera when a trip starts and fly back to it when the trip ends.
  useEffect(() => {
    if (!runtime || !tripActive) return
    const { map } = runtime
    const saved = {
      center: { lat: map.center.lat, lng: map.center.lng, altitude: map.center.altitude ?? 0 },
      range: map.range, tilt: map.tilt, heading: map.heading,
    }
    return () => {
      if (map.isConnected) map.flyCameraTo({ endCamera: saved, durationMillis: flyMillis(800) })
    }
  }, [runtime, tripActive])

  // The trip's route, one line per step: walking, driving, or each ride in its
  // line colour; the part already travelled is grey, like Google Maps.
  const routeLinesRef = useRef(null)
  useEffect(() => {
    if (!runtime?.Polyline || !route) return undefined
    const style = getComputedStyle(document.documentElement)
    const token = (name) => style.getPropertyValue(name).trim()
    // Like Google Maps navigation: a bold blue line on foot and by car; rides in their line colour.
    const colors = { walk: token('--blue'), drive: token('--blue'), ride: token('--mode-bus') }
    const make = (strokeColor, strokeWidth) => new runtime.Polyline({
      altitudeMode: 'CLAMP_TO_GROUND', strokeColor, strokeWidth, outerColor: '#ffffff', outerWidth: 0.3, drawsOccludedSegments: true,
    })
    const steps = route.steps.map((step) => make((step.kind === 'ride' && step.ride?.color) || colors[step.kind] || colors.walk,
      step.kind === 'walk' ? 20 : 24))
    const travelled = make('#9aa0a6', 20)
    routeLinesRef.current = { steps, travelled }
    return () => {
      for (const line of [...steps, travelled]) line.remove()
      routeLinesRef.current = null
    }
  }, [runtime, route])
  useEffect(() => {
    const lines = routeLinesRef.current
    if (!runtime || !lines || !route) return
    const show = (line, path) => {
      if (path.length < 2) {
        line.remove()
        return
      }
      line.path = path.map(({ lat, lng }) => ({ lat, lng, altitude: 0 }))
      if (!line.isConnected) runtime.map.append(line)
    }
    const remaining = routeSplit?.remaining ?? route.steps.map((step) => step.path)
    lines.steps.forEach((line, index) => show(line, remaining[index] ?? []))
    show(lines.travelled, routeSplit?.travelled ?? [])
  }, [runtime, route, routeSplit])

  // The day's journeys. A journey is redrawn only when its state, stops or
  // chip changes, so the clock ticking doesn't rebuild the whole map.
  const journeysRef = useRef(new Map())
  useEffect(() => {
    if (!runtime?.Polyline) return
    const drawn = journeysRef.current
    const ids = new Set(legs.map((leg) => leg.id))
    for (const [id, { elements }] of drawn) {
      if (ids.has(id)) continue
      for (const element of elements) element.remove()
      drawn.delete(id)
    }
    for (const leg of legs) {
      const signature = JSON.stringify([leg.state, leg.label, leg.path])
      const existing = drawn.get(leg.id)
      if (existing?.signature === signature) continue
      for (const element of existing?.elements ?? []) element.remove()
      const elements = journeyElements(runtime, leg)
      for (const element of elements) runtime.map.append(element)
      drawn.set(leg.id, { signature, elements })
    }
  }, [runtime, legs])
  useEffect(() => {
    const drawn = journeysRef.current
    return () => {
      for (const { elements } of drawn.values()) for (const element of elements) element.remove()
      drawn.clear()
    }
  }, [runtime])

  // Follow the person during a trip, heading-up.
  useEffect(() => {
    if (!runtime || !follow || !isValidLocation(follow.center)) return
    runtime.map.flyCameraTo({
      endCamera: {
        center: { lat: follow.center.lat, lng: follow.center.lng, altitude: 0 },
        range: FOLLOW_RANGE, tilt: FOLLOW_TILT, heading: follow.heading ?? runtime.map.heading,
      },
      durationMillis: flyMillis(FOLLOW_FLY_MS),
    })
  }, [runtime, follow])

  // Camera changes belong to explicit place selection, not planner updates or tilt redraws.
  useEffect(() => {
    if (!runtime || !previewPlace) return
    const { lat, lng } = previewPlace
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    runtime.map.flyCameraTo({
      endCamera: { center: { lat, lng, altitude: 0 }, range: 1200, tilt: 60 },
      durationMillis: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800,
    })
  }, [runtime, previewPlace])

  const message = !apiKey ? 'Missing Google Maps API key.' : error

  return (
    <section className="map-view" aria-label="Adelaide map">
      <div ref={containerRef} className="map-view-canvas" />
      {message && <p className="map-view-caption glass" role="alert">{message}</p>}
    </section>
  )
}
