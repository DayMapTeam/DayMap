import './LineBadge.css'

/** A public-transport line ("721", "GLNELG") in its own colours, like on the vehicle. */
export default function LineBadge({ ride }) {
  const style = ride.color ? { background: ride.color, color: ride.textColor ?? '#fff' } : undefined
  return <span className="line-badge" style={style}>{ride.name}</span>
}
