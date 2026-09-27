import { isDayNote } from '../app/planEdits.js'

/**
 * Day status. Conflicts and the tightest gap arrive with scheduling; until the
 * plan has legs, travel is unknown, never zero (ARCHITECTURE §5).
 *
 * @param {object} props
 * @param {object} props.plan Accepted plan (§5 shape).
 */
export default function StatusPill({ plan, analysis }) {
  const notes = plan.stops.filter(isDayNote).length
  const count = plan.stops.length - notes
  const issues = analysis.conflicts.length
  const source = analysis.legs.some((leg) => leg.provider === 'google') ? 'Google estimates' : analysis.legs.some((leg) => leg.provider === 'demo') ? 'demo estimates' : 'checked'
  const text = `${count} ${count === 1 ? 'stop' : 'stops'}${notes ? ` · ${notes} ${notes === 1 ? 'note' : 'notes'}` : ''} · ${issues ? `${issues} issue${issues === 1 ? '' : 's'}` : analysis.unresolved.length ? 'unresolved travel' : source}`

  // Shrinks with an ellipsis so the header's buttons always fit; the title keeps the full text.
  return (
    <p className="status-pill" title={text}>
      <span className="status-pill-dot" aria-hidden="true" />
      <span className="status-pill-text">{text}</span>
    </p>
  )
}
