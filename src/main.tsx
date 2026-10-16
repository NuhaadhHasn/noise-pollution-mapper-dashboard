import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GlobalErrorPage } from './components/GlobalErrorPage'

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
