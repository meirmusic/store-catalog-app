import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { I18nProvider } from './i18n/I18nContext.jsx'
import ErrorBoundary, { CrashTestHook } from './ErrorBoundary.jsx'
import { installUsageTracking } from './telemetry/usage.js'

installUsageTracking() // SPEC.md 29.4: taps - counted, never what was tapped on

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <CrashTestHook />
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)
