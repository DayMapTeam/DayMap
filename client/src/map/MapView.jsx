import { useEffect, useRef, useState } from 'react'
import { loadMapsLibrary, mapsApiKey as apiKey } from '../services/googleMaps.js'
import './MapView.css'

// These are mutable Google Maps elements, not React state objects.
function updateMarkerSelection({ marker, pin, title }, selected) {
  pin.background = selected ? '#c2410c' : '#2563eb'
  pin.borderColor = selected ? '#7c2d12' : '#1e3a8a'
  pin.scale = selected ? 1.4 : 1
  marker.zIndex = selected ? 10 : 0
  marker.label = selected ? `${title} (selected)` : title
  marker.title = selected ? `${title} (selected)` : title
}

export default function MapView({ stops, selectedStopId, onSelectStop, previewPlace = null }) {
  const containerRef = useRef(null)
  const markersRef = useRef(new Map())
  const [runtime, setRuntime] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!apiKey) return

    let cancelled = false
    let map

    async function loadMap() {
      try {
        const [maps3d, { PinElement }] = await Promise.all([
          loadMapsLibrary('maps3d'),
          loadMapsLibrary('marker'),
        ])
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
        containerRef.current.append(map)
        setRuntime({ map, Marker: maps3d.Marker3DInteractiveElement, PinElement })
      } catch {
        if (!cancelled) {
          setError('Could not load Google Maps. Check the browser console.')
        }
      }
    }

    loadMap()

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [])

  useEffect(() => {
    if (!runtime) return
    const markers = markersRef.current

    stops.forEach((stop, index) => {
      const location = stop.location
      if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)
        || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) return

      const marker = new runtime.Marker({
        position: { lat: location.lat, lng: location.lng },
        altitudeMode: 'CLAMP_TO_GROUND',
        collisionBehavior: 'REQUIRED',
        drawsWhenOccluded: true,
        label: stop.title,
        title: stop.title,
      })
      const pin = new runtime.PinElement({
        glyphText: String(index + 1),
        glyphColor: '#ffffff',
      })
      const handleClick = () => onSelectStop(stop.id)
      marker.append(pin)
      marker.addEventListener('gmp-click', handleClick)
      runtime.map.append(marker)
      markers.set(stop.id, { marker, pin, handleClick, title: stop.title })
    })

    return () => {
      for (const { marker, handleClick } of markers.values()) {
        marker.removeEventListener('gmp-click', handleClick)
        marker.remove()
      }
      markers.clear()
    }
  }, [runtime, stops, onSelectStop])

  useEffect(() => {
    for (const [id, entry] of markersRef.current) {
      updateMarkerSelection(entry, id === selectedStopId)
    }
  }, [runtime, stops, onSelectStop, selectedStopId])

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
      title: `${label} (preview)`,
      zIndex: 20,
    })
    marker.append(new runtime.PinElement({
      background: '#7e22ce', borderColor: '#581c87', glyphColor: '#ffffff', glyphText: 'P',
    }))
    runtime.map.append(marker)
    // Camera changes belong to explicit place selection, not planner updates.
    runtime.map.flyCameraTo({
      endCamera: { center: { lat, lng, altitude: 0 }, range: 1200, tilt: 60 },
      durationMillis: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800,
    })
    return () => marker.remove()
  }, [runtime, previewPlace])

  const message = !apiKey ? 'Missing Google Maps API key.' : error

  return (
    <section className="map-view" aria-label="Adelaide map">
      <div ref={containerRef} className="map-view-canvas" />
      {message && <p className="map-view-caption glass" role="alert">{message}</p>}
    </section>
  )
}
