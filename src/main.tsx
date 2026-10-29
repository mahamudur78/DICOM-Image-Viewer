import { createRoot } from 'react-dom/client'
import './index.css'
import { languageReady } from './i18n'
import './theme'
import App from './App.tsx'
import { ErrorBoundary } from './notifications/ErrorBoundary'
import { reportUnhandledErrors } from './notifications/reportErrors'

reportUnhandledErrors()

// Offline use: the service worker (written by the production build) caches the app.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined))
}

// StrictMode is intentionally omitted: its double mount would create and
// destroy the Cornerstone rendering engine and WebGL context twice.
void languageReady.then(() =>
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  ),
)
