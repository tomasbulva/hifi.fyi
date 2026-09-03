import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './animations.css'
import App from './App.tsx'
import { initAnalytics, attachGlobalClickTracking } from './core/analytics.ts'
import { initErrorReporting } from './core/errorReport.ts'

async function bootstrap() {
  // Fetch observability config (analytics website ID + Sentry DSN) before
  // first render. Fails soft: if the endpoint is missing, everything stays off.
  try {
    const res = await fetch('/api/analytics-config', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const cfg = await res.json();
      initErrorReporting(cfg.sentryDsn, cfg.release);
      initAnalytics(cfg.analytics);
    }
  } catch {
    // observability is optional — never block startup on it
  }

  attachGlobalClickTracking();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
