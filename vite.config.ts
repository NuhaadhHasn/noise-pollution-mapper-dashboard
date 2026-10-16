import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Vendor chunk groups (perf-5). Each group is a package set that only one kind
// of page needs, so /login never downloads recharts or Leaflet. Packages that
// the recharts group depends on are listed too: a dependency left outside its
// group can make two chunks import each other ("Circular chunk" build warning).
// clsx is NOT in the recharts group: the app's own code uses it (CORE_PACKAGES).
// Shared runtime that the always-loaded entry needs. It MUST be its own group,
// checked first: Rollup moves a manual chunk's unassigned dependencies INTO that
// chunk, so without this react/react-dom land in vendor-leaflet (via
// react-leaflet) and clsx in vendor-recharts (via recharts), and the entry then
// imports both heavy chunks statically (verified with a source-map build).
const CORE_PACKAGES = /\/node_modules\/(?:react|react-dom|scheduler|clsx)\//
const FIREBASE_PACKAGES = /\/node_modules\/(?:firebase|@firebase|idb|tslib)\//
const RECHARTS_PACKAGES =
  /\/node_modules\/(?:recharts|recharts-scale|victory-vendor|d3-[^/]+|internmap|react-smooth|react-transition-group|dom-helpers|prop-types|react-is|fast-equals|eventemitter3|lodash|tiny-invariant|decimal\.js-light)\//
// leaflet, its two plugins and the React bindings stay in ONE chunk: both
// plugins read the global L that leaflet sets when it executes.
const LEAFLET_PACKAGES =
  /\/node_modules\/(?:leaflet|leaflet\.markercluster|leaflet\.heat|react-leaflet|@react-leaflet)\//

function manualChunks(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/')
  if (CORE_PACKAGES.test(normalized)) return 'vendor-core'
  if (FIREBASE_PACKAGES.test(normalized)) return 'vendor-firebase'
  if (RECHARTS_PACKAGES.test(normalized)) return 'vendor-recharts'
  if (LEAFLET_PACKAGES.test(normalized)) return 'vendor-leaflet'
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
