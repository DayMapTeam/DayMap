/**
 * Day status. Conflicts and the tightest gap arrive with scheduling; until the
 * plan has legs, travel is unknown, never zero (ARCHITECTURE §5).
 *
 * @param {object} props
 * @param {object} props.plan Accepted plan (§5 shape).
 */
export default function StatusPill({ plan }) {
  const count = plan.stops.length

  return (
    <p className="status-pill">
      <span className="status-pill-dot" aria-hidden="true" />
      {count} {count === 1 ? 'stop' : 'stops'} · travel unknown
    </p>
  )
}
