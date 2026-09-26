import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { placePopup } from './popupPosition.js'
import './PlacePopup.css'

const MARGIN = 16

// The visible map area inside the popup's container: below the header and
// clear of the planner (docked right on desktop, a bottom sheet on mobile).
function mapBounds(container) {
  const width = container.clientWidth
  const height = container.clientHeight
  const header = container.querySelector('.app-header')
  const planner = container.querySelector('#planner:not([hidden])')
  const bounds = { left: MARGIN, top: (header?.offsetHeight ?? 0) + MARGIN, right: width - MARGIN, bottom: height - MARGIN }
  if (planner && planner.offsetLeft > width / 2) bounds.right = planner.offsetLeft - MARGIN
  else if (planner) bounds.bottom = planner.offsetTop - MARGIN
  return bounds
}

/**
 * Glass popup pointing at `anchor` ({ x, y } in container pixels). Esc or ×
 * closes it. Focus moves in on open and goes back where it was on close.
 * `onClose` should be stable (useCallback) so focus is not reset each render.
 */
export default function PlacePopup({ anchor, title, photoUrl, onClose, children }) {
  const titleId = useId()
  const popupRef = useRef(null)

  // Position with direct style writes before paint; React does not own these styles.
  useLayoutEffect(() => {
    const popup = popupRef.current
    function position() {
      const layout = placePopup({
        anchor,
        width: popup.offsetWidth,
        height: popup.offsetHeight,
        bounds: mapBounds(popup.offsetParent),
      })
      popup.style.left = `${layout.left}px`
      popup.style.top = `${layout.top}px`
      popup.style.setProperty('--tail-x', `${layout.tailX}px`)
      popup.dataset.placement = layout.placement
    }
    position()
    window.addEventListener('resize', position)
    return () => window.removeEventListener('resize', position)
  }, [anchor])

  useEffect(() => {
    const returnFocusTo = document.activeElement
    popupRef.current.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) returnFocusTo.focus()
    }
  }, [onClose])

  return (
    <div ref={popupRef} className="place-popup glass" role="dialog" aria-labelledby={titleId} tabIndex={-1}>
      <div className="place-popup-photo">
        {photoUrl ? <img src={photoUrl} alt="" /> : <span className="place-popup-photo-empty">No photo yet</span>}
        <button type="button" className="place-popup-close" aria-label="Close" onClick={onClose}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="m1.5 1.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="place-popup-body">
        <h2 id={titleId} className="place-popup-title">{title}</h2>
        {children}
      </div>
      <span className="place-popup-tail" aria-hidden="true" />
    </div>
  )
}
