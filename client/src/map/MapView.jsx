import { useEffect, useRef, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import './MapView.css'

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

if (apiKey) {
  setOptions({ key: apiKey, v: 'weekly' })
}

// These are mutable Google Maps elements, not React state objects.
function updateMarkerSelection({ marker, pin, title }, selected) {
  pin.background = selected ? '#c2410c' : '#2563eb'
  pin.borderColor = selected ? '#7c2d12' : '#1e3a8a'
  pin.scale = selected ? 1.4 : 1
  marker.zIndex = selected ? 10 : 0
  marker.label = selected ? `${title} (selected)` : title
  marker.title = selected ? `${title} (selected)` : title
}

export default function MapView({ stops, selectedStopId, onSelectStop }) {
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
          importLibrary('maps3d'),
          importLibrary('marker'),
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

  const message = !apiKey ? 'Missing Google Maps API key.' : error

  return (
    <section className="map-view" aria-label="Adelaide map">
      <div ref={containerRef} className="map-view-canvas" />
      {message && <p className="map-view-caption glass" role="alert">{message}</p>}
    </section>
  )
}
