/**
 * The live line saying whether the new stop fits. Colour is never the only
 * signal: the text always says why.
 *
 * @param {object} props
 * @param {{ tone: 'neutral' | 'ok' | 'bad', text: string }} props.verdict
 * @param {string} [props.title] Bold first line, used by the guided sheet.
 */
export default function FitVerdict({ verdict, title }) {
  return (
    <p className="fit-verdict" data-tone={verdict.tone} aria-live="polite">
      <span className="fit-verdict-dot" aria-hidden="true" />
      <span className="fit-verdict-text">
        {title && <strong className="fit-verdict-title">{title}</strong>}
        {verdict.text}
      </span>
    </p>
  )
}
