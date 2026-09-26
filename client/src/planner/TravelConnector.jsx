import { formatDuration } from '../components/formatTime.js'
import { MODE_WORDS } from './stopLabels.js'
import TravelModeIcon from './TravelModeIcon.jsx'

/**
 * The journey between two rows. Travel without a verified estimate is
 * unknown, never zero (ARCHITECTURE §5). With `onOpen` it is a button that
 * opens the journey popup.
 *
 * @param {object} props
 * @param {object | undefined} props.leg The analysed leg, if any.
 * @param {(() => void) | null} [props.onOpen]
 */
export default function TravelConnector({ leg, onOpen = null }) {
  const ready = leg?.status === 'ready'
  let text = 'Travel unknown'
  if (ready) {
    text = leg.provider === 'same-place'
      ? 'Same place'
      : `${formatDuration(Math.max(1, Math.ceil(leg.travelSeconds / 60)))} ${MODE_WORDS[leg.mode] ?? leg.mode}`
  } else if (leg?.status === 'stale') {
    text = 'Checking travel…'
  }
  const mode = ready && leg.provider !== 'same-place' ? leg.mode : null
  const content = (
    <>
      <TravelModeIcon mode={mode} size={13} />
      <span>{text}</span>
    </>
  )
  return (
    <div className="travel-connector" data-mode={mode ?? undefined}>
      <span className="travel-connector-line" aria-hidden="true" />
      {onOpen ? (
        <button type="button" className="travel-connector-button" aria-haspopup="dialog" onClick={onOpen}>
          {content}
          <span className="visually-hidden">. Choose how to travel</span>
          <svg className="travel-connector-chevron" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span className="travel-connector-text">{content}</span>
      )}
    </div>
  )
}
