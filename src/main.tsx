import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GlobalErrorPage } from './components/GlobalErrorPage'
import { ConfigErrorPage } from './components/ConfigErrorPage'
import { currentFirebaseEnv, findMissingFirebaseEnv } from './lib/firebaseEnv'

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

const root = createRoot(document.getElementById('root')!)

// build-3: check the Firebase config BEFORE the app is loaded. App is imported
// dynamically on purpose: a static import would evaluate src/config/firebase.ts
// first, and with a variable missing firebase/auth throws at import, leaving a
// blank page before any check could run. Only NAMES are ever shown, never values.
const missingEnv = findMissingFirebaseEnv(currentFirebaseEnv())

if (missingEnv.length > 0) {
  console.error('[config] Missing Firebase environment variables:', missingEnv.join(', '))
  root.render(
    <StrictMode>
      <ConfigErrorPage missing={missingEnv} />
    </StrictMode>,
  )
} else {
  // sec-1: the last line of defence. A render error anywhere (a page, a provider,
  // the router) shows GlobalErrorPage instead of unmounting the whole app to a
  // blank page. This boundary sits OUTSIDE ThemeProvider, AuthProvider,
  // ReadingsProvider and BrowserRouter, so its fallback uses no context and no
  // router hooks (master §4.10).
  import('./App.tsx')
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <ErrorBoundary fallbackRender={({ error }) => <GlobalErrorPage error={error} />}>
            <App />
          </ErrorBoundary>
        </StrictMode>,
      )
    })
    .catch((error: unknown) => {
      // The app chunk, or a module it evaluates at import, failed (offline, a
      // broken deploy). vite:preloadError above handles the stale-chunk case.
      console.error('[startup] The app failed to load:', error)
      root.render(
        <StrictMode>
          <GlobalErrorPage error={error instanceof Error ? error : new Error(String(error))} />
        </StrictMode>,
      )
    })
}
