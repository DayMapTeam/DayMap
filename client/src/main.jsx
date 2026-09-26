import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/tokens.css'
import './index.css'
import App from './App.jsx'
import { PlanProvider } from './app/PlanProvider.jsx'
import { demoPlan } from '../../shared/fixtures/demoPlan.js'
import { readDemoPlan, sessionStore } from './app/planPersistence.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PlanProvider initialPlan={readDemoPlan(sessionStore(), demoPlan)}>
      <App />
    </PlanProvider>
  </StrictMode>,
)
