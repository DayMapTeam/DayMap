/**
 * Confirmation after adding or removing a stop, with Undo while it is shown.
 *
 * @param {object} props
 * @param {string} props.message
 * @param {() => void} props.onUndo
 */
export default function AddToast({ message, onUndo }) {
  return (
    <div className="add-toast glass" role="status">
      <svg className="add-toast-check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="add-toast-text">{message}</span>
      <button type="button" className="button-text add-toast-undo" onClick={onUndo}>Undo</button>
    </div>
  )
}
