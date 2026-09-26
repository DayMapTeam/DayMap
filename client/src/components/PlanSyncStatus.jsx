import './buttons.css'
import './PlanSyncStatus.css'

/**
 * Small save indicator for the header. Nothing is shown for the demo day.
 *
 * @param {object} props
 * @param {ReturnType<import('../app/usePlanSync.js').usePlanSync>} props.sync
 */
export function SyncChip({ sync }) {
  const text = {
    loading: 'Loading your day…',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Not saved',
    conflict: 'Not saved',
    'load-error': 'Not loaded',
  }[sync.state]
  if (!text) return null
  return (
    <span className={`sync-chip sync-chip-${sync.state}`} role="status">
      {text}
    </span>
  )
}

/**
 * Explains a problem that needs the person: a save or load failure, or a day
 * changed somewhere else. It never discards either copy on its own.
 *
 * @param {object} props
 * @param {ReturnType<import('../app/usePlanSync.js').usePlanSync>} props.sync
 */
export function SyncBanner({ sync }) {
  let text
  let actions
  if (sync.state === 'conflict') {
    text = 'This day was changed in another tab or device. Your latest change isn’t saved.'
    actions = (
      <>
        <button type="button" className="button-text" onClick={sync.loadLatest}>Load latest</button>
        <button type="button" className="button-filled" onClick={sync.keepMine}>Keep mine</button>
      </>
    )
  } else if (sync.state === 'error' || sync.state === 'load-error') {
    text = sync.state === 'error'
      ? `Your change isn’t saved yet. ${sync.error?.message ?? ''}`
      : `Your day couldn’t be loaded. ${sync.error?.message ?? ''}`
    actions = <button type="button" className="button-filled" onClick={sync.retry}>Try again</button>
  } else {
    return null
  }
  return (
    <div className="sync-banner glass" role="alert">
      <p className="sync-banner-text">{text.trim()}</p>
      <div className="sync-banner-actions">{actions}</div>
    </div>
  )
}
