import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PlanProvider } from './app/PlanProvider.jsx'
import { demoPlan } from '../../shared/fixtures/demoPlan.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PlanProvider initialPlan={demoPlan}>
      <App />
    </PlanProvider>
  </StrictMode>,
)
