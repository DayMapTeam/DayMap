import { analyzePlan } from '../../../shared/planning/analyze.js'
import { formatTimeRange } from '../components/formatTime.js'

/** Optional explanation; derived journeys are always recalculated, never trusted from a proposal. */
export default function SuggestionDetails({ proposal, base, ctx, otherChanges = [] }) {
  const preview = { ...base, stops: base.stops.map((s) => proposal.changes.find((c) => c.stopId === s.id)?.after ?? s) }
  const before = analyzePlan(base, ctx)
  const after = analyzePlan(preview, { ...ctx, freeTimeMin: 0 })
  const changed = new Set(proposal.changes.map((c) => c.stopId))
  const affected = (leg, other) => changed.has(leg.fromStopId) || changed.has(leg.toStopId)
    || !other.legs.some((l) => l.id === leg.id && l.departAt === leg.departAt)
  const title = (id) => base.stops.find((s) => s.id === id)?.title ?? id
  const gap = before.freeTime.find((g) => g.id === proposal.freeTimeId)
  const remaining = gap && after.legs.filter((leg) =>
    (leg.fromStopId === gap.fromStopId && changed.has(leg.toStopId))
    || (changed.has(leg.fromStopId) && leg.toStopId === gap.toStopId))
  return <details className="suggestion-details">
    <summary>Details</summary>
    <ul>{[...proposal.changes, ...otherChanges].map(({ before: old, after: next }) => <li key={next.id}>
      {next.title}: {formatTimeRange(old.timing.scheduledStartAt, old.timing.scheduledEndAt, base.timezone)}
      {' → '}{formatTimeRange(next.timing.scheduledStartAt, next.timing.scheduledEndAt, base.timezone)}
    </li>)}</ul>
    {[[before, after, 'Before'], [after, before, 'Preview']].map(([analysis, other, label]) => <div key={label}>
      <strong>{label}</strong>
      <ul>{analysis.legs.filter((leg) => affected(leg, other)).map((leg) => <li key={leg.id}>
        {title(leg.fromStopId)} → {title(leg.toStopId)} · {leg.status === 'ready'
          ? `${Math.ceil(leg.travelSeconds / 60)} min ${leg.mode} + ${Math.round(leg.bufferSeconds / 60)} min buffer` : 'Travel unresolved'}
      </li>)}</ul>
    </div>)}
    {remaining?.length === 2 && remaining.every((leg) => leg.status === 'ready') && <p>
      {Math.floor(remaining.reduce((sum, leg) => sum + Math.max(0, leg.spareSeconds), 0) / 60)} min remains in this gap.
    </p>}
  </details>
}
