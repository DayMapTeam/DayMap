import { useEffect, useId, useRef } from 'react'
import '../components/buttons.css'
import { useReturnFocus } from './useReturnFocus.js'

/**
 * A question inside the planner that must be answered before anything else
 * there. Cancel is focused first, so Enter never confirms by accident. Esc
 * cancels. Focus goes back to the control that opened it, or to
 * `returnFocusSelector` if that control is gone.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.message
 * @param {string} props.confirmLabel
 * @param {string} props.returnFocusSelector
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export default function ConfirmDialog({ title, message, confirmLabel, returnFocusSelector, onConfirm, onCancel }) {
  const titleId = useId()
  const messageId = useId()
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)

  useReturnFocus(returnFocusSelector)

  useEffect(() => {
    cancelRef.current.focus()
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
    }
    // Keep Tab between the two buttons while the rest of the planner is inert.
    if (event.key === 'Tab') {
      event.preventDefault()
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
      next.focus()
    }
  }

  return (
    <div className="confirm-scrim">
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={handleKeyDown}
      >
        <h3 id={titleId} className="confirm-title">{title}</h3>
        <p id={messageId} className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="button-text" onClick={onCancel}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" className="button-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
