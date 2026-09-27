import { useCallback, useEffect, useRef, useState } from 'react'

/** A mouse or pen drag starts after this many pixels, so a click stays a click. */
const THRESHOLD_PX = 6
/** A finger has to rest this long first, so swiping still scrolls the planner. */
const HOLD_MS = 300

/**
 * Drag an element up and down. Returns how far it is being dragged (`offset`,
 * null when it isn't) and the handlers to spread on it. `onDrop` gets the
 * final offset in pixels. A drag never also counts as a click, and Escape
 * cancels it.
 *
 * @param {object} options
 * @param {boolean} options.enabled
 * @param {(offset: number) => void} options.onDrop
 */
export function useVerticalDrag({ enabled, onDrop }) {
  const [offset, setOffset] = useState(null)
  const drag = useRef(null)
  const node = useRef(null)
  const justDragged = useRef(false)

  const stop = useCallback(() => {
    clearTimeout(drag.current?.timer)
    drag.current = null
    setOffset(null)
  }, [])

  // Once dragging, a finger must not scroll the planner; React's touch
  // listeners are passive, so this one is added by hand.
  const ref = useCallback((element) => {
    const block = (event) => { if (drag.current?.moving) event.preventDefault() }
    node.current?.removeEventListener('touchmove', node.current.blockScroll)
    if (element) {
      element.blockScroll = block
      element.addEventListener('touchmove', block, { passive: false })
    }
    node.current = element
  }, [])

  useEffect(() => {
    if (offset === null) return undefined
    const onKey = (event) => { if (event.key === 'Escape') stop() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [offset, stop])

  useEffect(() => () => clearTimeout(drag.current?.timer), [])

  function begin(state, element, pointerId) {
    state.moving = true
    element.setPointerCapture?.(pointerId)
    setOffset(0)
  }

  const handlers = enabled ? {
    onPointerDown(event) {
      if (event.button !== 0 || drag.current) return
      const element = event.currentTarget
      const state = { id: event.pointerId, y: event.clientY, moving: false, touch: event.pointerType === 'touch' }
      if (state.touch) state.timer = setTimeout(() => begin(state, element, event.pointerId), HOLD_MS)
      drag.current = state
    },
    onPointerMove(event) {
      const state = drag.current
      if (!state || state.id !== event.pointerId) return
      const delta = event.clientY - state.y
      if (!state.moving) {
        if (Math.abs(delta) < THRESHOLD_PX) return
        // A finger that moves before the hold is scrolling, not dragging.
        if (state.touch) { stop(); return }
        begin(state, event.currentTarget, event.pointerId)
      }
      setOffset(delta)
    },
    onPointerUp(event) {
      const state = drag.current
      if (!state || state.id !== event.pointerId) return
      if (state.moving) {
        // Only the click that ends this drag is swallowed.
        justDragged.current = true
        setTimeout(() => { justDragged.current = false })
        onDrop(event.clientY - state.y)
      }
      stop()
    },
    onPointerCancel: stop,
    onLostPointerCapture(event) { if (drag.current?.id === event.pointerId && drag.current.moving) stop() },
    // A drag that ends on the element would otherwise also click it.
    onClickCapture(event) {
      if (!justDragged.current) return
      justDragged.current = false
      event.preventDefault()
      event.stopPropagation()
    },
    onContextMenu(event) { if (drag.current?.touch) event.preventDefault() },
  } : {}

  return { ref, offset, dragging: offset !== null, handlers }
}
