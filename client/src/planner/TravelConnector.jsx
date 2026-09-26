import { Fragment } from 'react'
import LineBadge from './LineBadge.jsx'
import TravelModeIcon from './TravelModeIcon.jsx'

function Chevron() {
  return (
    <svg className="route-chevron" width="8" height="8" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4 2 8 6l-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Walk › [bus] 721 › 263 › Walk, as icons and line badges. */
function RouteSteps({ steps }) {
  return (
    <span className="route-steps" aria-hidden="true">
      {steps.map((step, index) => (
        <Fragment key={index}>
          {index > 0 && <Chevron />}
          {step.kind === 'ride' ? (
            <span className="route-ride">
              {steps[index - 1]?.kind !== 'ride' && <TravelModeIcon mode="transit" size={14} />}
              <LineBadge ride={step} />
            </span>
          ) : (
            <TravelModeIcon mode={step.kind} size={14} />
          )}
        </Fragment>
      ))}
    </span>
  )
}

/**
 * The journey between two rows, summarised like a route in Google Maps: how
 * you travel and when to leave. Travel without a verified estimate is
 * unknown, never zero (ARCHITECTURE §5). With `onOpen` it opens the journey popup.
 *
 * @param {object} props
 * @param {object | undefined} props.leg The analysed leg, if any.
 * @param {ReturnType<import('./journeySummary.js').journeySummary>} props.summary
 * @param {(() => void) | null} [props.onOpen]
 */
export default function TravelConnector({ leg, summary, onOpen = null }) {
  let content
  let label
  if (summary) {
    content = (
      <>
        <RouteSteps steps={summary.steps} />
        <span className="route-leave">{summary.leave}</span>
      </>
    )
    label = summary.label
  } else {
    const text = leg?.provider === 'same-place' ? 'Same place' : leg?.status === 'stale' ? 'Checking travel…' : 'Travel unknown'
    content = <span className="route-pending">{text}</span>
    label = text
  }
  const mode = summary?.steps.length === 1 ? summary.steps[0].kind : summary ? 'transit' : undefined
  return (
    <div className="travel-connector" data-mode={mode}>
      <span className="travel-connector-line" aria-hidden="true" />
      {onOpen ? (
        <button type="button" className="travel-connector-button" aria-haspopup="dialog" aria-label={`${label}. Choose how to travel`} onClick={onOpen}>
          {content}
        </button>
      ) : (
        <span className="travel-connector-text" aria-label={label}>{content}</span>
      )}
    </div>
  )
}
