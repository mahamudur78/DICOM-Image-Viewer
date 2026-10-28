import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { ErrorBoundary } from './notifications/ErrorBoundary'
import { reportUnhandledErrors } from './notifications/reportErrors'

reportUnhandledErrors()

// StrictMode is intentionally omitted: its double mount would create and
// destroy the Cornerstone rendering engine and WebGL context twice.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
