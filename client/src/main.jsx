import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/tokens.css'
import './index.css'
import App from './App.jsx'
import { PlanProvider } from './app/PlanProvider.jsx'
import { sessionStore } from './app/planPersistence.js'
import { readLocalPlan } from './app/localPlan.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PlanProvider initialPlan={readLocalPlan(sessionStore())}>
      <App />
    </PlanProvider>
  </StrictMode>,
)
