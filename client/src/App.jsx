import { usePlan } from './app/planContext.js'
import { EventSelector } from './demo/EventSelector.jsx'
import { SelectionPreview } from './demo/SelectionPreview.jsx'
import './App.css'

function App() {
  const { plan } = usePlan()

  return (
    <main className="demo-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">DAYMAP <span className="demo-badge">Demo data</span></p>
          <h1>A shared start for your day.</h1>
          <p>Four fictional Adelaide activities. Select an event to try the shared state.</p>
        </div>
        <div className="day-label"><time dateTime={plan.date}>{plan.date}</time><span>{plan.timezone}</span></div>
      </header>
      <div className="demo-grid">
        <EventSelector />
        <SelectionPreview />
      </div>
      <footer>Sample locations are approximate. No calendar connection, live travel times, or saved changes.</footer>
    </main>
  )
}

export default App
