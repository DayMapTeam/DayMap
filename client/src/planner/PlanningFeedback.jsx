import { useMemo, useState } from 'react'
import { suggestFix } from '../../../shared/planning/proposals.js'
import { usePlan } from '../app/planContext.js'
import { formatTimeRange } from '../components/formatTime.js'
import './PlanningFeedback.css'

const unresolvedText = {
  'ambiguous-order': 'Overlapping events need a clear order before travel can be checked.',
  'ambiguous-journey': 'Resolve the overlap before checking this journey.',
  'missing-location': 'Add a location to check travel.',
  'missing-coordinates': 'Coordinates are needed for a demo estimate.',
  'progress-unknown': 'The planned departure has passed; your actual progress is unknown.',
  'routes-not-connected': 'Live route estimates are not connected yet.',
  'pending': 'Loading travel time from Google Maps.',
  'routes-access-denied': 'Google denied this request. Check Routes API, billing and the browser key restrictions, then Retry routes.',
  'routes-quota': 'Google route quota was reached. Try again later.',
  'routes-timeout': 'Google took too long to respond. Retry routes.',
  'routes-unavailable': 'Google travel estimates are unavailable. Retry routes.',
  'no-route': 'Google could not find a route between these places for this way of travelling.',
  'departure-unverified': 'Checking public transport for this departure time.',
  'invalid-time': 'Set a valid start and end time.',
}

function Conflict({ conflict, planning, automatic }) {
  const { applySuggestion, draft } = usePlan()
  const [requested, setRequested] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const { shown, ctx, fingerprint, getContext } = planning
  const wanted = !dismissed && !draft?.suggestion && (automatic || requested === fingerprint)
  const result = useMemo(() => wanted ? suggestFix(shown, conflict.id, ctx) : null, [wanted, shown, conflict.id, ctx])
  const titles = conflict.stopIds.map((id) => shown.stops.find((stop) => stop.id === id)?.title ?? id)
  const description = conflict.code === 'overlap' ? `Overlap of ${conflict.minutes} min`
    : conflict.code === 'late' ? `Arrival ${conflict.lateMinutes} min late · ${conflict.minutes} min short including buffer`
      : `Buffer short by ${conflict.minutes} min`
  return (
    <article className="planning-conflict" data-muted={dismissed || undefined}>
      <p className="planning-conflict-title">{description}</p>
      <p>{titles.join(' → ')}</p>
      {conflict.needsDecision ? <p>Both events are fixed. Choose which commitment to change; DayMap won’t move either.</p> : <>
        {result?.status === 'proposal' && <div className="planning-proposal">
          {result.proposal.changes.map(({ stopId, before, after }) => <p key={stopId}>
            Move <strong>{after.title}</strong>: {formatTimeRange(before.timing.scheduledStartAt, before.timing.scheduledEndAt, shown.timezone)}
            {' → '}{formatTimeRange(after.timing.scheduledStartAt, after.timing.scheduledEndAt, shown.timezone)}
          </p>)}
          <button type="button" className="button-filled" onClick={() => applySuggestion(result.proposal, getContext())}>Apply suggestion to draft</button>
        </div>}
        {result?.status === 'noFit' && <>
          <p role="status">{planning.loadingRoutes ? 'Checking journey times…' : 'No verified one-event fix found. Your edited events stay locked; try another time or adjust the window.'}</p>
          {planning.provider === 'google' && result.blockers.some((b) => b.reason === 'travel-unknown') && <button
            type="button" className="button-text" disabled={planning.loadingRoutes} onClick={planning.checkAlternatives}>Check alternative routes</button>}
        </>}
        {!draft?.suggestion && <div className="planning-actions">
          {(!result || dismissed) && <button type="button" className="button-text" onClick={() => { setDismissed(false); setRequested(fingerprint) }}>Suggest a fix</button>}
          {!dismissed && <button type="button" className="button-text" onClick={() => setDismissed(true)}>Dismiss suggestion</button>}
        </div>}
      </>}
    </article>
  )
}

export default function PlanningFeedback({ planning }) {
  const { shown, analysis, introduced } = planning
  const urgent = introduced.find((c) => c.severity === 'error')?.id
  return <section className="planning-feedback" aria-label="Day checks">
    {planning.loadingRoutes && <p role="status">Loading travel times…</p>}
    {planning.failedRoutes && <button type="button" className="button-text" disabled={planning.loadingRoutes} onClick={planning.retryRoutes}>Retry routes</button>}
    <p role="status">{analysis.conflicts.length ? `${analysis.conflicts.length} schedule issue${analysis.conflicts.length === 1 ? '' : 's'}` : 'No schedule conflicts detected'}
      {analysis.unresolved.length > 0 && ` · ${analysis.unresolved.length} unresolved check${analysis.unresolved.length === 1 ? '' : 's'}`}</p>
    {analysis.conflicts.map((c) => <Conflict key={`${c.id}:${c.factsKey}`} conflict={c} planning={planning} automatic={c.id === urgent} />)}
    {analysis.unresolved.length > 0 && <details className="planning-free">
      <summary>Why checks are unresolved</summary>
      <ul>{analysis.unresolved.map((entry) => <li key={entry.id}>
        {entry.stopIds.map((id) => shown.stops.find((s) => s.id === id)?.title ?? id).join(' → ')}: {unresolvedText[entry.code] ?? 'A verified travel estimate is unavailable.'}
      </li>)}</ul>
    </details>}
  </section>
}
