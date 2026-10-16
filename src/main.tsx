import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GlobalErrorPage } from './components/GlobalErrorPage'

// Stale-tab recovery (11.3). After a deploy, a tab opened on the previous build
// asks for chunk names that no longer exist, and Vite fires vite:preloadError.
// Reload once to pick up the new index.html and its chunk names. The guard
// stops a reload loop when the chunk is genuinely unreachable (offline, or a
// broken deploy): within 10 s of the last automatic reload the error is let
// through to the 08.2 boundary instead.
const CHUNK_RELOAD_KEY = 'chunk-reload-at'
window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)
  } catch {
    // sessionStorage blocked: fall through and reload once
  }
  if (Date.now() - last < 10_000) return
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    // sessionStorage blocked: the reload still happens
  }
  event.preventDefault()
  window.location.reload()
})

// sec-1: the last line of defence. A render error anywhere (a page, a provider,
// the router) shows GlobalErrorPage instead of unmounting the whole app to a
// blank page. This boundary sits OUTSIDE ThemeProvider, AuthProvider,
// ReadingsProvider and BrowserRouter, so its fallback uses no context and no
// router hooks (master §4.10).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackRender={({ error }) => <GlobalErrorPage error={error} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
