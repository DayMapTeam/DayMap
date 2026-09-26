import { useEffect, useRef, useState } from 'react'
import { usePlan } from '../app/planContext.js'
import { listStopChanges } from '../app/planEdits.js'
import { calendarLocationText, locationQuestionFor, placeStatus } from '../app/planLocations.js'
import EventRow from './EventRow.jsx'
import DayPlaceRow from './DayPlaceRow.jsx'
import JourneyPopup from './JourneyPopup.jsx'
import { journeySummary, pickService } from './journeySummary.js'
import TravelConnector from './TravelConnector.jsx'
import FreeTimeGap, { GapPreview } from './FreeTimeGap.jsx'
import './EventList.css'
import { sortStopsForDisplay } from '../../../shared/planning/timeline.js'

function matchesFilter(stop, needle) {
  return [stop.title, stop.location?.label ?? '']
    .some((text) => text.toLocaleLowerCase().includes(needle))
}

/**
 * The day's stops in the order the user gave, with the journey between each
 * pair. Shows the draft when there is one. Selection goes through
 * PlanProvider, so the map follows it; which row is expanded is UI state
 * owned by Planner.
 *
 * @param {object} props
 * @param {Date} props.now The planner's current time; earlier stops are shown as finished.
 * @param {string} props.filter Text from the planner filter. Hides rows only.
 * @param {string | null} props.openStopId
 * @param {(stopId: string | null) => void} props.onOpenStopChange
 * @param {{ stopId: string, key: number | string } | null} props.revealRequest Scroll to and highlight this row.
 * @param {string | null} props.newStopId A just-added stop, labelled New.
 * @param {(stopId: string) => void} props.onRequestDelete Ask before deleting this stop.
 */
export default function EventList({ now, filter, openStopId, onOpenStopChange, revealRequest, newStopId, onRequestDelete, planning, onGapPreview, emptyState = null }) {
  const { analysis, bookends } = planning
  const { plan, draft, selectedStopId, selectStop, editStopDraft, setStopLocation, setStopKind, setDayPlace } = usePlan()
  const listRef = useRef(null)
  const reviewAfterSave = useRef(false)
  const lastPreview = useRef(null)
  const [activeGap, setActiveGap] = useState(null)
  // The journey popup: { fromId, toId } or null.
  const [journey, setJourney] = useState(null)
  const gapProposal = draft?.suggestion?.strategy === 'fill-gap' ? draft.suggestion : null
  const shown = draft?.plan ?? plan
  const needle = filter.trim().toLocaleLowerCase()
  const filtering = needle !== ''
  const ordered = sortStopsForDisplay(shown.stops)
  const stops = filtering ? ordered.filter((stop) => matchesFilter(stop, needle)) : ordered
  const changedIds = new Set(draft ? listStopChanges(plan, draft.plan).map(({ after }) => after.id) : [])

  useEffect(() => {
    const previous = lastPreview.current
    if (previous?.id === gapProposal?.id) return
    lastPreview.current = gapProposal
    const body = listRef.current?.closest('.planner-body')
    const target = gapProposal ? body?.querySelector('.gap-preview') : previous && (
      body?.querySelector(`[data-gap-id="${CSS.escape(previous.freeTimeId)}"] button`)
      ?? body?.querySelector(`[data-stop-id="${CSS.escape(previous.changes[0].stopId)}"] .event-row`))
    if (body && target) {
      body.scrollTo({ top: body.scrollTop + target.getBoundingClientRect().top - body.getBoundingClientRect().top - 12, behavior: 'instant' })
      target.focus({ preventScroll: true })
    }
  }, [gapProposal])

  useEffect(() => {
    if (!reviewAfterSave.current) return
    reviewAfterSave.current = false
    const body = listRef.current?.closest('.planner-body')
    if (body?.querySelector('.draft-card')) {
      body.scrollTo({ top: 0, behavior: 'instant' })
      body.querySelector('.draft-card').focus({ preventScroll: true })
    }
  }, [draft])

  // Scroll the panel body itself (offsetTop is relative to it); scrollIntoView
  // would also scroll the page and the map.
  useEffect(() => {
    if (revealRequest === null) return
    const item = listRef.current.querySelector(`[data-stop-id="${CSS.escape(revealRequest.stopId)}"]`)
    const body = item?.closest('.planner-body')
    if (!item || !body) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    body.scrollTo({ top: item.offsetTop - 12, behavior: reduceMotion ? 'auto' : 'smooth' })
    item.querySelector('.event-row').focus({ preventScroll: true })
  }, [revealRequest])

  function toggle(stopId) {
    if (openStopId === stopId) {
      onOpenStopChange(null)
      return
    }
    onOpenStopChange(stopId)
    selectStop(stopId)
  }

  function save(stopId, edit) {
    reviewAfterSave.current = true
    editStopDraft(stopId, edit)
    onOpenStopChange(null)
  }

  const legBetween = (from, to) => analysis.legs.find((leg) => leg.fromStopId === from.id && leg.toStopId === to.id)
  const summaryBetween = (from, to) => {
    const leg = legBetween(from, to)
    const service = leg?.mode === 'transit' && from.location && to.location ? pickService(planning.transitServicesFor(from, to)) : null
    return journeySummary(leg, service, shown.timezone)
  }

  // Looked up by ID each render, so the popup shows the current plan (for example after choosing a mode).
  const journeyFrom = journey && shown.stops.find((candidate) => candidate.id === journey.fromId)
  const journeyTo = journey && shown.stops.find((candidate) => candidate.id === journey.toId)
  const journeyStops = journeyFrom?.location && journeyTo?.location ? { from: journeyFrom, to: journeyTo } : null

  return (
    <>
      <p className="event-list-count" role="status">
        {filtering && (stops.length === 0 ? 'No stops match.' : `Showing ${stops.length} of ${shown.stops.length} stops`)}
      </p>
      {shown.stops.length === 0 && emptyState}
      {!filtering && bookends.start && <>
        <DayPlaceRow which="start" place={bookends.start.place} onRemove={() => setDayPlace('start', null)} />
        {bookends.start.leg && <TravelConnector leg={bookends.start.leg} summary={journeySummary(bookends.start.leg, null, shown.timezone)} />}
      </>}
      <ol ref={listRef} className="event-list" aria-label="Stops">
        {stops.map((stop, index) => {
          const gap = index > 0 && !filtering && planning.displayGaps.find((g) => g.fromStopId === stops[index - 1].id && g.toStopId === stop.id)
          return <li key={stop.id}>
            {/* While filtering, neighbours in the list may not be neighbours in the day. */}
            {index > 0 && !filtering && <TravelConnector
              leg={legBetween(stops[index - 1], stop)}
              summary={summaryBetween(stops[index - 1], stop)}
              onOpen={stops[index - 1].location && stop.location && stops[index - 1].timing.kind !== 'all-day' && stop.timing.kind !== 'all-day'
                ? () => setJourney({ fromId: stops[index - 1].id, toId: stop.id }) : null} />}
            {gap && <FreeTimeGap gap={gap} planning={planning}
              open={activeGap?.id === gap.id && activeGap.fingerprint === planning.fingerprint}
              onOpen={() => setActiveGap({ id: gap.id, fingerprint: planning.fingerprint })}
              onClose={() => setActiveGap(null)}
              onPreview={() => { setActiveGap(null); onOpenStopChange(null); onGapPreview() }} />}
            {gapProposal?.changes[0].stopId === stop.id ? <GapPreview planning={planning} /> : <EventRow
              stop={stop}
              conflict={analysis.conflicts.some((c) => c.stopIds.includes(stop.id))}
              date={shown.date}
              timezone={shown.timezone}
              selected={stop.id === selectedStopId}
              open={stop.id === openStopId}
              past={stop.timing.scheduledEndAt !== null && Date.parse(stop.timing.scheduledEndAt) <= now.getTime()}
              changed={changedIds.has(stop.id)}
              added={stop.id === newStopId}
              flashKey={revealRequest?.stopId === stop.id ? revealRequest.key : null}
              onToggle={toggle}
              onSave={save}
              onDelete={onRequestDelete}
              placeState={placeStatus(shown, stop)}
              calendarPlace={calendarLocationText(locationQuestionFor(shown, stop.id))}
              onSetPlace={setStopLocation}
              onSetKind={draft === null ? setStopKind : null}
              kindHint={draft === null ? null : 'Accept or keep your pending changes first.'}
            />}
          </li>
        })}
      </ol>
      {gapProposal && !stops.some((s) => s.id === gapProposal.changes[0].stopId) && <GapPreview planning={planning} />}
      {!filtering && bookends.end && <>
        {bookends.end.leg && <TravelConnector leg={bookends.end.leg} summary={journeySummary(bookends.end.leg,
          bookends.end.leg.mode === 'transit' ? pickService(planning.transitServicesFor(bookends.end.stop, bookends.end.to)) : null, shown.timezone)} />}
        <DayPlaceRow which="end" place={bookends.end.place} onRemove={() => setDayPlace('end', null)} />
      </>}
      {journeyStops && <JourneyPopup from={journeyStops.from} to={journeyStops.to} planning={planning} onClose={() => setJourney(null)} />}
    </>
  )
}
