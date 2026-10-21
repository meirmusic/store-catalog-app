import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// SPEC.md 32.6: the fonts are part of the app (no Google Fonts) - the same
// files on every device, offline from the first open, like the share card.
import '@fontsource/assistant/hebrew-400.css'
import '@fontsource/assistant/latin-400.css'
import '@fontsource/assistant/hebrew-600.css'
import '@fontsource/assistant/latin-600.css'
import '@fontsource/assistant/hebrew-700.css'
import '@fontsource/assistant/latin-700.css'
import '@fontsource/frank-ruhl-libre/hebrew-700.css'
import '@fontsource/frank-ruhl-libre/latin-700.css'
import '@fontsource/cormorant-garamond/latin-500.css'
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
