import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode is intentionally omitted: its double mount would create and
// destroy the Cornerstone rendering engine and WebGL context twice.
createRoot(document.getElementById('root')!).render(<App />)
