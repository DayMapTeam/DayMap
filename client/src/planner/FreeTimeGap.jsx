import { useId, useMemo } from 'react'
import { suggestFitsForGap } from '../../../shared/planning/proposals.js'
import { usePlan } from '../app/planContext.js'
import { listStopChanges } from '../app/planEdits.js'
import { formatTimeRange } from '../components/formatTime.js'
import SuggestionDetails from './SuggestionDetails.jsx'
import './FreeTimeGap.css'

export default function FreeTimeGap({ gap, planning, open, onOpen, onClose, onPreview }) {
  const { draft, applySuggestion, selectStop } = usePlan()
  const contentId = useId()
  const result = useMemo(() => open && !draft?.suggestion
    ? suggestFitsForGap(planning.shown, gap.id, planning.ctx) : null,
  [open, draft?.suggestion, planning.shown, planning.ctx, gap.id])
  const proposal = result?.proposals[0]
  const stop = proposal?.changes[0].after
  const range = formatTimeRange(gap.startAt, gap.endAt, planning.shown.timezone)
  const previewing = Boolean(draft?.suggestion)
  const minutes = Math.floor(gap.minutes)
  return <div className="free-time-gap" data-gap-id={gap.id} style={{ '--gap-space': `${Math.min(56, Math.max(16, minutes / 2))}px` }}>
    <button type="button" className="free-time-trigger" aria-expanded={open} aria-controls={open ? contentId : undefined}
      aria-label={`${minutes} minutes free, ${range}${previewing ? '' : '. Explore activities'}`}
      disabled={previewing} onClick={open ? onClose : () => { onOpen(); planning.checkGapRoutes(gap.id) }}>
      <span className="free-time-rule" aria-hidden="true" />
      <span>{minutes < 1 ? '<1' : minutes} min free</span>
      {!previewing && <span className="free-time-plus" aria-hidden="true">{open ? '−' : '+'}</span>}
    </button>
    {open && !previewing && <div id={contentId} className="gap-option">
      {stop ? <>
        <div className="gap-option-heading"><strong>{stop.title}</strong><span>{formatTimeRange(stop.timing.scheduledStartAt, stop.timing.scheduledEndAt, planning.shown.timezone)}</span></div>
        <SuggestionDetails proposal={proposal} base={planning.shown} ctx={planning.ctx} />
      </> : <p role="status">{planning.loadingRoutes ? 'Checking…' : result?.reason === 'travel-unknown' ? 'Travel needs checking.' : 'Nothing fits here yet.'}</p>}
      <div className="gap-actions">
        <button type="button" className="button-text" onClick={onClose}>Keep free</button>
        {!stop && planning.failedRoutes && <button type="button" className="button-text" onClick={planning.retryRoutes} disabled={planning.loadingRoutes}>Retry</button>}
        {stop && <button type="button" className="button-text" onClick={() => {
          applySuggestion(proposal, planning.getContext())
          selectStop(stop.id)
          onPreview()
        }}>Preview →</button>}
      </div>
    </div>}
  </div>
}

export function GapPreview({ planning }) {
  const { plan, draft, acceptDraft, revertSuggestion } = usePlan()
  const proposal = draft.suggestion
  const stop = proposal.changes[0].after
  const otherChanges = draft.beforeSuggestion ? listStopChanges(plan, draft.beforeSuggestion.plan) : []
  const edited = otherChanges.length
  return <article className="gap-preview" tabIndex={-1} aria-label={`Preview ${stop.title}`}>
    <span className="gap-preview-label">Preview</span>
    <div className="gap-option-heading"><strong>{stop.title}</strong><span>{formatTimeRange(stop.timing.scheduledStartAt, stop.timing.scheduledEndAt, plan.timezone)}</span></div>
    <SuggestionDetails proposal={proposal} base={draft.beforeSuggestion?.plan ?? plan} ctx={planning.ctx} otherChanges={otherChanges} />
    {edited > 0 && <p className="gap-existing-edits">Includes {edited} pending edit{edited === 1 ? '' : 's'}.</p>}
    {(draft.stale || draft.suggestionInvalid) && <p role="alert">Plan changed. Cancel and preview again.</p>}
    <div className="gap-actions">
      <button type="button" className="button-text" onClick={revertSuggestion}>Cancel</button>
      <button type="button" className="button-filled" disabled={draft.stale || draft.suggestionInvalid}
        onClick={() => acceptDraft(planning.getContext())}>{edited ? `Confirm ${edited + 1} changes` : 'Confirm'}</button>
    </div>
  </article>
}
