/**
 * Day status. Conflicts and the tightest gap arrive with scheduling; until the
 * plan has legs, travel is unknown, never zero (ARCHITECTURE §5).
 *
 * @param {object} props
 * @param {object} props.plan Accepted plan (§5 shape).
 */
export default function StatusPill({ plan }) {
  const count = plan.stops.length
  const text = `${count} ${count === 1 ? 'stop' : 'stops'} · travel unknown`

  // Shrinks with an ellipsis so the header's buttons always fit; the title keeps the full text.
  return (
    <p className="status-pill" title={text}>
      <span className="status-pill-dot" aria-hidden="true" />
      <span className="status-pill-text">{text}</span>
    </p>
  )
}
