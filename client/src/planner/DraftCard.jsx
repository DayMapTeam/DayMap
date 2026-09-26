import { usePlan } from '../app/planContext.js'
import { listStopChanges } from '../app/planEdits.js'
import { formatTimeRange } from '../components/formatTime.js'
import '../components/buttons.css'
import SuggestionDetails from './SuggestionDetails.jsx'

function describeChange({ before, after }, timezone) {
  const parts = []
  if (before.title !== after.title) parts.push(`renamed from ${before.title}`)
  const beforeRange = formatTimeRange(before.timing.scheduledStartAt, before.timing.scheduledEndAt, timezone)
  const afterRange = formatTimeRange(after.timing.scheduledStartAt, after.timing.scheduledEndAt, timezone)
  if (beforeRange !== afterRange) parts.push(`${beforeRange} → ${afterRange}`)
  return `${after.title}: ${parts.join(', ')}`
}

/**
 * Saved edits waiting for the user's decision. Nothing in the accepted plan
 * changes until they choose Accept changes.
 */
export default function DraftCard({ planning }) {
  const { plan, draft, acceptDraft, discardDraft, revertSuggestion } = usePlan()
  if (draft === null || draft.suggestion?.strategy === 'fill-gap') return null

  const changes = listStopChanges(plan, draft.plan)

  return (
    <section className="draft-card" aria-labelledby="draft-card-title" tabIndex={-1}>
      <h3 id="draft-card-title" className="draft-card-title">
        {changes.length === 1 ? '1 change' : `${changes.length} changes`} not applied yet
      </h3>
      <ul className="draft-card-changes">
        {changes.map((change) => (
          <li key={change.after.id}>{describeChange(change, plan.timezone)}</li>
        ))}
      </ul>
      {draft.stale ? (
        <p className="draft-card-alert" role="alert">
          Your plan changed after you made this edit, so it can’t be applied. Keep the current plan and edit again.
        </p>
      ) : (
        <p className="draft-card-body">Nothing in your plan changes until you accept.</p>
      )}
      {draft.suggestion && <p className="draft-card-body">Suggestion included. Revert keeps your own edits. Editing again removes the suggestion.</p>}
      {draft.suggestion && <SuggestionDetails proposal={draft.suggestion} base={draft.beforeSuggestion?.plan ?? plan} ctx={planning.ctx} />}
      {draft.suggestionInvalid && <p className="draft-card-alert" role="alert">This suggestion is no longer verified. Revert it and request a new fix.</p>}
      <div className="draft-card-actions">
        {draft.suggestion && <button type="button" className="button-text" onClick={revertSuggestion}>Revert suggestion</button>}
        <button type="button" className="button-text" onClick={discardDraft}>
          Keep current plan
        </button>
        {!draft.stale && !draft.suggestionInvalid && (
          <button type="button" className="button-filled" onClick={() => acceptDraft(planning.getContext())}>
            Accept changes
          </button>
        )}
      </div>
    </section>
  )
}
