import { useEffect, useRef } from 'react'
import { usePlan } from '../app/planContext.js'
import { useMediaQuery } from '../components/useMediaQuery.js'
import StatusPill from './StatusPill.jsx'
import { usePlannerOpen } from './usePlannerOpen.js'
import './PlannerPanel.css'

// Keep in sync with the breakpoint in PlannerPanel.css.
const SHEET_QUERY = '(max-width: 719px)'

/**
 * Floating planner. On desktop it collapses to a "Planner" pill; below 720px
 * it is a bottom sheet with a peek and a full position.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.toolbar Controls under the title, such as the filter.
 * @param {import('react').ReactNode} props.children Scrollable body content.
 */
export default function PlannerPanel({ toolbar, children }) {
  const { plan } = usePlan()
  const [open, setOpen] = usePlannerOpen()
  const isSheet = useMediaQuery(SHEET_QUERY)
  const toggleRef = useRef(null)
  const reopenRef = useRef(null)
  const focusAfterToggle = useRef(false)

  const showReopen = !open && !isSheet

  // After the user toggles, keep focus on whichever control is now visible.
  useEffect(() => {
    if (!focusAfterToggle.current) return
    focusAfterToggle.current = false
    const target = showReopen ? reopenRef.current : toggleRef.current
    target?.focus()
  }, [showReopen])

  function toggle() {
    focusAfterToggle.current = true
    setOpen((isOpen) => !isOpen)
  }

  return (
    <>
      {showReopen && (
        <button
          ref={reopenRef}
          type="button"
          className="planner-reopen glass"
          aria-controls="planner"
          aria-expanded="false"
          onClick={toggle}
        >
          Planner
        </button>
      )}
      <section
        id="planner"
        className="planner glass"
        aria-labelledby="planner-title"
        data-open={open}
        hidden={showReopen}
      >
        {isSheet && (
          <button
            ref={toggleRef}
            type="button"
            className="planner-handle"
            aria-controls="planner-body"
            aria-expanded={open}
            aria-label={open ? 'Collapse planner' : 'Expand planner'}
            onClick={toggle}
          >
            <span className="planner-grabber" aria-hidden="true" />
          </button>
        )}
        <div className="planner-top">
          <div className="planner-title-row">
            <h2 id="planner-title" className="planner-title">Planner</h2>
            <StatusPill plan={plan} />
            {!isSheet && (
              <button
                ref={toggleRef}
                type="button"
                className="planner-collapse"
                aria-controls="planner"
                aria-expanded="true"
                aria-label="Collapse planner"
                onClick={toggle}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M6 3.5 10.5 8 6 12.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
          {/* Out of reach while the sheet only peeks. */}
          <div inert={isSheet && !open}>{toolbar}</div>
        </div>
        <div id="planner-body" className="planner-body" inert={isSheet && !open}>
          {children}
        </div>
      </section>
    </>
  )
}
