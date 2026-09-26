import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/tokens.css'
import './index.css'
import App from './App.jsx'
import { PlanProvider } from './app/PlanProvider.jsx'
import { DemoLoader } from './app/DemoLoader.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PlanProvider>
      <DemoLoader><App /></DemoLoader>
    </PlanProvider>
  </StrictMode>,
)
