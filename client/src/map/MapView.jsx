import { useEffect, useRef, useState } from 'react'
import { numberStops } from '../app/stopNumbers.js'
import { loadMapsLibrary, mapsApiKey as apiKey } from '../services/googleMaps.js'
import { markerColors, markerTemplate, stopMarkerSvg } from './stopMarker.js'
import './MapView.css'

// A pointer press older than this is not the one that clicked the pin.
const POINTER_CLICK_WINDOW_MS = 1000
// A map click this soon after a pin click is the same click, not an empty-map click.
const PIN_CLICK_GRACE_MS = 300
// Above this tilt the pins use a shorter stem.
const STEEP_TILT = 45
const CAMERA_EVENTS = ['gmp-centerchange', 'gmp-rangechange', 'gmp-headingchange', 'gmp-tiltchange']

function isValidLocation(location) {
  return Boolean(location) && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180
}

function isFinished(stop, now) {
  return now !== undefined && stop.timing.scheduledEndAt !== null
    && Date.parse(stop.timing.scheduledEndAt) <= now.getTime()
}

/**
 * The 3D map. Every pin is drawn by stopMarkerSvg; nothing else creates markers.
 *
 * - onSelectStop(stopId, { anchor }): a pin was clicked. `anchor` is the click
 *   point in map pixels, for the popup (the 3D map has no lat/lng-to-pixel API).
 * - onClearSelection(): the empty map was clicked.
 * - onCameraMove(): the camera moved, so a popup placed on screen is now stale.
 * - now: stops that ended before it are drawn faded.
 */
export default function MapView({
  stops, selectedStopId, onSelectStop, onClearSelection, onCameraMove, now, previewPlace = null,
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
    callbacksRef.current = { onSelectStop, onClearSelection, onCameraMove }
  }, [onSelectStop, onClearSelection, onCameraMove])

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
          mode: 'HYBRID',
        })

        map.style.width = '100%'
        map.style.height = '100%'
        map.addEventListener('gmp-click', handleMapClick)
        for (const type of CAMERA_EVENTS) map.addEventListener(type, handleCameraChange)
        containerRef.current.append(map)
        setSteep(map.tilt > STEEP_TILT)
        setRuntime({ map, Marker: maps3d.Marker3DInteractiveElement, colors: markerColors() })
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

    for (const stop of stops) {
      if (!isValidLocation(stop.location)) continue
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

    return () => {
      for (const { marker, handleClick } of markers.values()) {
        marker.removeEventListener('gmp-click', handleClick)
        marker.remove()
      }
      markers.clear()
    }
  }, [runtime, stops])

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
        state: { selected, past: isFinished(stop, now) },
        steep,
      }, runtime.colors)
      entry.marker.replaceChildren(markerTemplate(svg))
      entry.marker.zIndex = selected ? 10 : 0
      entry.marker.title = `${numbers.get(stop.id)}. ${stop.title}${selected ? ' (selected)' : ''}`
    }
  }, [runtime, stops, selectedStopId, now, steep])

  useEffect(() => {
    if (!runtime || !previewPlace) return

    const { lat, lng, label } = previewPlace
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const marker = new runtime.Marker({
      position: { lat, lng },
      altitudeMode: 'CLAMP_TO_GROUND',
      collisionBehavior: 'REQUIRED',
      drawsWhenOccluded: true,
      label: `${label} (preview)`,
      title: `${label} (preview, not in your day)`,
      zIndex: 20,
    })
    marker.append(markerTemplate(stopMarkerSvg({ type: 'search', steep }, runtime.colors)))
    runtime.map.append(marker)
    return () => marker.remove()
  }, [runtime, previewPlace, steep])

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
