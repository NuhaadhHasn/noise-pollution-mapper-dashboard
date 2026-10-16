# Playbook 11 — Bundle Splitting

Implementation spec for the defect cluster covering the single 1.42 MB JavaScript chunk: the four route pages are imported statically, `vite.config.ts` has no vendor chunking, and Leaflet's stylesheet is loaded globally. It is build-shape only: no query, rule, index, schema, dependency or behaviour changes.

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors) and `npx eslint <the files the step changed>` (0 errors, no new warnings); run `npm test` and `npm run build` ONCE, at the end of Step 2 (master playbook §1.3). Never run a build, a type check and a dev server at the same time.**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`). If a BEFORE block does not match, STOP and re-read the file — do not guess. Match on exact text, never on line numbers. `routes.tsx`, `vite.config.ts` and `index.css:6-9` are not edited by clusters 01 to 10 (the vitest config is a separate file, 10.4 and 10.7 edit other `index.css` regions), so those anchors match HEAD. `MapContainer.tsx` is rewritten by 10.6; the one anchor used there is a line that is identical at HEAD and after 10.6.

Environment facts (verified):
- `package.json`: `"type": "module"`, `vite ^7.3.1` (installed 7.3.1, Rollup based, so the option is `build.rollupOptions`), `react ^19.2.0` (installed 19.2.4), `react-router-dom ^7.13.1` (installed 7.13.1), `recharts ^2.15.4` (installed 2.15.4), `firebase ^12.10.0` (installed 12.10.0), `leaflet ^1.9.4` (installed 1.9.4), `react-leaflet ^5.0.0`, `leaflet.markercluster ^1.5.3`, `leaflet.heat ^0.2.0`, `typescript ~5.9.3`. This cluster adds no dependency.
- `recharts@2.15.4` runtime dependencies (read from `node_modules/recharts/package.json`): `clsx`, `eventemitter3`, `lodash`, `react-is`, `react-smooth`, `recharts-scale`, `tiny-invariant`, `victory-vendor`. `react-smooth` brings `fast-equals`, `prop-types` and `react-transition-group` (which brings `dom-helpers`). `victory-vendor` re-exports `d3-*`. `clsx` is also used by the app itself, so it is deliberately NOT put in the recharts group.
- All four pages already `export default` a function component: `LoginPage.tsx:20`, `DashboardPage.tsx:24`, `MapPage.tsx:19`, `AnalyticsPage.tsx:16` (HEAD). `React.lazy` needs exactly that.
- Recharts is imported only by `components/analytics/{CategoryChart,NoiseTrendChart,SoundTypeChart}.tsx` and `components/ui/chart.tsx`. Leaflet and its plugins are imported only under `components/map/` (`MapContainer`, `NoiseMarkers`, `MarkerClusterGroup`, `HeatmapLayer`). `Layout`, `ProtectedRoute`, `ThemeContext` and `AuthContext` import neither, so after Step 1 the entry chunk holds neither.
- `leaflet.heat` and `leaflet.markercluster` are side-effect plugins that read the global `L`. Leaflet's UMD build sets `window.L` when it executes. Execution order is fixed by the import order in the source (`HeatmapLayer.tsx:3-4` and `MarkerClusterGroup.tsx:2-3` both import `leaflet` first), and Rollup chunking never reorders execution, so putting all four Leaflet packages in ONE chunk keeps it correct.
- `tsconfig.node.json` type-checks `vite.config.ts` with `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` (no enums or parameter properties). `tsconfig.app.json` has `noUncheckedSideEffectImports: true`; `import 'x.css'` is accepted because `vite/client` declares `*.css`, and `MarkerClusterGroup.tsx:4-5` already does it.
- `vitest.config.ts` (from 01.1) merges `vite.config.ts` with `mergeConfig`. A `build` key is inert under vitest, so Step 2 does not break `npm test`.
- `dist/` is gitignored (`.gitignore:11`), so the build leaves no tracked change. `vercel.json` serves `/assets/*` with `immutable` caching and rewrites every other path to `/index.html`.
- Baseline from `build.log` (audit time, HEAD `353bbdd`): ONE JS chunk `index-BKHYcTwv.js` at 1,422.67 kB / 419.78 kB gzip, ONE CSS file `index-Bd92eCl1.css` at 92.05 kB / 19.84 kB gzip, plus the ">500 kB" warning. Build time 7m25s. `getStorage` is already gone from `src/config/firebase.ts` (03.3), so the firebase chunk holds Auth and Firestore only; this cluster does not touch `firebase.ts`.

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| perf-5 | UNVERIFIED (Medium, confidence high); re-read in the working tree | No route-level code splitting: one 1.42 MB (420 kB gzip) chunk holds leaflet, recharts and firebase and loads on `/login`. `routes.tsx:3-6` imports the four pages statically, `vite.config.ts` has no `manualChunks`, and `index.css:7` imports Leaflet's CSS globally. Steps 1 and 2. |

The finding's last fix-hint item (drop the unused `getStorage`/`storage` in `firebase.ts`) was done in 03.3 and is not repeated here.

Full finding text: grep `perf-5` in `audit/00_MASTER_AUDIT_REPORT.md` and `audit/04_PERFORMANCE_AUDIT.md`.

---

## Pre-reading

Open these files before touching anything:

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md` §1.3 (gates), §2 (conventions 4, 5, 6, 12), §3.3 (shared-file table) and §4.14 (`routes.tsx` and `index.css`).
2. `src/routes.tsx` — whole file (57 lines at HEAD).
3. `vite.config.ts` — whole file (14 lines at HEAD).
4. `src/index.css` — lines 1-10 for the import block; and the `@media (max-width: 640px)` block, which 10.7 rewrote (the 44 px rule is scoped with `:not(.leaflet-container …)`), because Step 2 changes where Leaflet's CSS sits in the cascade.
5. `src/components/map/MapContainer.tsx` — whole file (post-10.6: it has `ResizeSync` and imports `useEffect` and `useMap`).
6. `src/components/map/MarkerClusterGroup.tsx` (lines 1-5, its own CSS imports) and `src/components/map/HeatmapLayer.tsx` (lines 1-4).
7. `src/components/ProtectedRoute.tsx` and `src/components/Layout.tsx` — the `Layout` renders the page as `{children}` inside the 08.2 error boundary, so a `Suspense` placed inside `ProtectedRoute` keeps the sidebar on screen while a page chunk downloads.
8. `src/components/ui/skeleton.tsx` — the `Skeleton` used by the fallback.
9. `vitest.config.ts` (from 01.1), to confirm it merges `vite.config.ts`.
10. `audit/playbook/10_accessibility_layout.md` Step 6 (the `MapContainer.tsx` rewrite) and Step 7e to 7g (the `index.css` rewrite). Step 2 must keep every one of those edits.

---

## Steps

### Step 1 — perf-5: lazy-load route pages behind Suspense

**Goal:** `LoginPage`, `DashboardPage`, `MapPage` and `AnalyticsPage` each become their own chunk, loaded on first visit to their route. A `Suspense` boundary with a page skeleton covers the download. `ProtectedRoute` still wraps the three protected routes, outermost and unchanged, so authentication is decided before any page chunk is requested. After this step recharts is reachable only from the `/dashboard` and `/analytics` chunks, and Leaflet only from the `/dashboard` and `/map` chunks.

**Files:**
- `src/routes.tsx`

**Exact changes**

1a. Replace the four static page imports with `React.lazy` declarations, and add the fallback components. The two new imports at the top (`lazy`, `Suspense`, `ReactNode`; `Skeleton`) are part of this block.

BEFORE (`src/routes.tsx`, lines 1-7, verbatim):
```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import MapPage from '@/pages/MapPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import ProtectedRoute from '@/components/ProtectedRoute';
```

AFTER:
```tsx
import { lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Skeleton } from '@/components/ui/skeleton';

// Route-level code splitting (perf-5). Each page is its own chunk, so recharts
// loads only for /dashboard and /analytics and Leaflet only for /dashboard and
// /map. Do not turn these back into static imports: a static import of any page
// pulls that page's whole dependency tree into the entry chunk again.
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const MapPage = lazy(() => import('@/pages/MapPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));

/** Shown in place of a page while its chunk downloads. */
function PageSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6"
    >
      <span className="sr-only">Loading page</span>
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** One Suspense boundary per page, so a page chunk never suspends the whole app. */
function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}
```

1b. Wrap each page element in `PageSuspense`. For the three protected routes the `Suspense` goes INSIDE `ProtectedRoute`, so `ProtectedRoute` (and through it `Layout` and the 08.2 boundary) stays the outer element and the sidebar remains rendered while the chunk loads.

BEFORE (`src/routes.tsx`, lines 17-52, verbatim):
```tsx
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <MapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />

        {/* Default redirect to dashboard (will check auth) */}
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />
      </Routes>
```

AFTER:
```tsx
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={
            <PageSuspense>
              <LoginPage />
            </PageSuspense>
          }
        />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <PageSuspense>
                <DashboardPage />
              </PageSuspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <PageSuspense>
                <MapPage />
              </PageSuspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <PageSuspense>
                <AnalyticsPage />
              </PageSuspense>
            </ProtectedRoute>
          }
        />

        {/* Default redirect to dashboard (will check auth) */}
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />
      </Routes>
```

Placement notes:
- 1a replaces lines 1-7 only. `function AppRoutes() {` (line 9) and its `const { getBackgroundColor } = useTheme();` line stay exactly as they are, and the blank line between the new `PageSuspense` function and `function AppRoutes()` is the original line 8.
- 1b replaces the `<Routes>` element from its opening tag to its closing tag. The themed wrapper `<div className="min-h-screen transition-colors duration-300" …>` above it (lines 13-16) is untouched, so the fallback renders on the themed background.
- `PageSkeleton` and `PageSuspense` are NOT exported. The file keeps one export (`export default AppRoutes`), so `react-refresh/only-export-components` stays quiet.
- If an earlier cluster left a different line in `routes.tsx` (for example the temporary `throw` that `08_access_resilience.md` uses for a manual check), that was a manual probe and must not be committed; the file should still match these anchors.
- `Layout` is not edited. The Layout error boundary (08.2) wraps `{children}`, so a chunk that fails to load is caught there; the `Suspense` inside `ProtectedRoute` is a child of that boundary.

**Edge cases to preserve**
- `ProtectedRoute` is still the outermost element of each protected route. While `isLoading` it still shows its own loading screen, and when unauthenticated it still redirects to `/login` BEFORE any page chunk is requested (the lazy child is not rendered, so the import never starts).
- The `/` route still redirects to `/dashboard`; the default `Navigate` is not lazy.
- Page components are unchanged and keep their default exports (`React.lazy` needs a module whose `default` is a component).
- Deep link `/map` for a signed-out visitor: redirect to `/login`, and the map chunk is never downloaded.
- The fallback never renders reading data, so conventions 12 and 13 are untouched.
- No Firestore import is added to `routes.tsx`, so the read-only-browser convention (§2.4) is untouched.

**Acceptance criteria**
- `grep -n "^import .* from '@/pages/" src/routes.tsx` prints nothing; `grep -c "lazy(() => import('@/pages/" src/routes.tsx` prints `4`.
- Signed out, hard reload on `/login` with DevTools Network (JS) open and "Disable cache" on: the form renders, and no request URL contains `recharts` or `leaflet` (in dev, Vite serves pre-bundled deps as `.vite/deps/recharts.js` and `.vite/deps/leaflet.js`; they appear only after visiting `/dashboard`).
- Signed in, navigating `/dashboard` to `/analytics` to `/map` and back: each page renders as before; the sidebar and header stay on screen the whole time, and on the first visit to a page the skeleton appears in the content area for the length of the download.
- Signed out, open `/map` directly: you land on `/login` and no Leaflet request is made.
- DevTools → Network → throttling "Slow 3G", first visit to `/analytics`: the skeleton shows inside the layout, then the page replaces it. A screen reader announces "Loading page".

**Verify**
```
npx tsc -b
npx eslint src/routes.tsx
```
Manual: the acceptance checks above, with `npm run dev`. Do NOT run `npm run build` in this step.

**Commit title:** `perf(bundle): lazy-load route pages behind Suspense (perf-5)`

---

### Step 2 — perf-5: split firebase, recharts and leaflet vendor chunks and scope leaflet CSS

**Goal:** Give the three heavy third-party groups their own long-lived chunks (so a deploy that changes only app code does not invalidate them), and make Leaflet's stylesheet load only with the map code instead of with every page. After this step `/login` requests the entry chunk and the firebase chunk, and no recharts or leaflet JS or CSS.

**Files:**
- `vite.config.ts`
- `src/components/map/MapContainer.tsx`
- `src/index.css`

**Exact changes**

2a. `vite.config.ts`: add `build.rollupOptions.output.manualChunks`. The function returns a chunk name for modules inside three package groups and `undefined` for everything else, so react, react-router, radix, lucide, date-fns and the app code keep Rollup's default placement. The id is normalised to forward slashes first (Windows ids can contain backslashes). The regexes are anchored on `/node_modules/<name>/` so `firebase-admin` (not bundled) and `@types/*` never match.

BEFORE (`vite.config.ts`, lines 6-14, verbatim):
```ts
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

AFTER:
```ts
// Vendor chunk groups (perf-5). Each group is a package set that only one kind
// of page needs, so /login never downloads recharts or Leaflet. Packages that
// the recharts group depends on are listed too: a dependency left outside its
// group can make two chunks import each other ("Circular chunk" build warning).
// clsx is NOT in the recharts group: the app's own code uses it.
const FIREBASE_PACKAGES = /\/node_modules\/(?:firebase|@firebase|idb|tslib)\//
const RECHARTS_PACKAGES =
  /\/node_modules\/(?:recharts|recharts-scale|victory-vendor|d3-[^/]+|internmap|react-smooth|react-transition-group|dom-helpers|prop-types|react-is|fast-equals|eventemitter3|lodash|tiny-invariant|decimal\.js-light)\//
// leaflet, its two plugins and the React bindings stay in ONE chunk: both
// plugins read the global L that leaflet sets when it executes.
const LEAFLET_PACKAGES =
  /\/node_modules\/(?:leaflet|leaflet\.markercluster|leaflet\.heat|react-leaflet|@react-leaflet)\//

function manualChunks(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/')
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
```

Placement note: the new constants and `manualChunks` go between the `import path from 'path'` line and the `// https://vite.dev/config/` comment (lines 5-6 are the blank line and that comment; the AFTER block starts at the comment's position, so the new block lands directly above it, separated from the imports by the existing blank line 5). `vitest.config.ts` merges this config; the `build` key is ignored by vitest, so no edit there.

2b. `MapContainer.tsx`: import Leaflet's stylesheet where Leaflet is used. The BEFORE line is identical at HEAD (line 2) and after 10.6 (where it is line 3), so this anchor matches in both states. The CSS import is added after it, above the constants; 10.6's `useEffect`/`useMap` imports on lines 1-2 are not touched.

BEFORE (`src/components/map/MapContainer.tsx`, verbatim; line 2 at HEAD, line 3 after 10.6):
```tsx
import type { LatLngTuple } from 'leaflet';
```

AFTER:
```tsx
import type { LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
```

Placement note: every Leaflet map in the app renders through `MapComponent` (`DashboardPage` mini-map and `MapPage`), and `NoiseMarkers`, `MarkerClusterGroup` and `HeatmapLayer` only render as its children, so this one import covers them all. Do not add a second `leaflet.css` import anywhere. `MarkerClusterGroup.tsx:4-5` keeps importing the markercluster stylesheets.

2c. `index.css`: remove the global Leaflet import. The anchor is the import block and the `@custom-variant` line below it.

BEFORE (`src/index.css`, lines 6-9, verbatim):
```css
@import "shadcn/tailwind.css";
@import "leaflet/dist/leaflet.css";

@custom-variant dark (&:is(.dark *));
```

AFTER:
```css
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));
```

Placement note: this removes exactly one line (the original line 7). Do not touch any other part of `index.css`: 10.4 (lines 58-61, 93-96) and 10.7 (44 px rule scoped with `:not(.leaflet-container button, .sort-button)` and `:not(.leaflet-container a)`, the `table { display: block }` removal, the `prefers-reduced-motion` block) must all stay.

**Edge cases to preserve**
- Cascade order: Leaflet's CSS now arrives with the map chunk, AFTER `index.css`. That is safe because `index.css` contains no `.leaflet-*` selector (grep `leaflet` in it finds only the removed import), and the one global rule that could have fought Leaflet, the 44 px `button, a` rule, is scoped by 10.7 to exclude `.leaflet-container`. Do not undo that scoping.
- No flash of unstyled map: Vite lists a dynamic import's CSS next to its JS and loads both before the page module runs.
- Execution order of the Leaflet plugins is unchanged (`leaflet` before `leaflet.heat` and `leaflet.markercluster`), because all four packages sit in one chunk and Rollup keeps source import order. Heatmap and clustering must still work (see acceptance).
- `firebase-admin` stays out of the browser build (`bundle.txt`: "no server-only markers found in built JS"). The firebase regex requires the slash right after `firebase`, so `firebase-admin/` cannot match, and `grep -rn "firebase-admin" src` must still print nothing.
- No new dependency, no `package.json` or lockfile change, no `chunkSizeWarningLimit` change: if one remaining chunk is still over 500 kB the warning stays, and the commit body says so rather than silencing it.
- The three groups must never include react, react-dom, react-router, radix, lucide, date-fns or clsx. If `/login` then requests a recharts or leaflet chunk, a package in that group is used by app code (see Verify).

**Acceptance criteria**
- `npm run build` succeeds and its output lists separate `vendor-firebase-*.js`, `vendor-recharts-*.js` and `vendor-leaflet-*.js` files, one page chunk per route (`LoginPage-*`, `DashboardPage-*`, `MapPage-*`, `AnalyticsPage-*`), the entry `index-*.js`, and CSS split so that Leaflet's rules are in a CSS file other than the entry CSS.
- The build output has no "Circular chunk" warning. If it has one, add the package it names to the group that already contains its neighbour, and re-run (this is the only permitted adjustment; see Risks).
- `grep -o 'assets/vendor-[a-z]*-[A-Za-z0-9_-]*\.js' dist/index.html | sort -u` prints `vendor-firebase` only. `grep -o 'from"./vendor-[a-z]*' dist/assets/index-*.js | sort -u` also prints only `vendor-firebase`. Neither names `vendor-recharts` or `vendor-leaflet`.
- `grep -c "leaflet-container" dist/assets/index-*.css` prints `0` (the entry CSS has no Leaflet rules), and a CSS file under `dist/assets/` does contain `.leaflet-container`.
- `/login` (signed out, cache disabled) requests no recharts or leaflet JS or CSS.
- `/dashboard` (signed in) renders the mini-map with tiles, zoom control, attribution and marker clusters, and the charts. `/map` renders the map, the heatmap toggle shows the heat layer, and cluster bubbles are styled (the markercluster CSS). `/analytics` renders all charts. No console error mentions `L is not defined` or `Cannot read properties of undefined (reading 'Layer')`.
- Leaflet's zoom buttons and popup close button look the same as before this cluster (30 px zoom buttons; not stretched by the 44 px rule).
- `npm test` passes (vitest still resolves the merged config).
- The commit body carries the before/after chunk table (see below).

**Verify**
```
npx tsc -b
npx eslint vite.config.ts src/components/map/MapContainer.tsx
npm test
npm run build
```
Run `npm test` and `npm run build` ONCE, alone: the build took 7m25s on this machine, so stop the dev server and run nothing else beside it. Then, from the dashboard root (Git Bash):
```
ls -l dist/assets/*.js dist/assets/*.css
grep -o 'assets/vendor-[a-z]*-[A-Za-z0-9_-]*\.js' dist/index.html | sort -u
grep -o 'from"./vendor-[a-z]*' dist/assets/index-*.js | sort -u
grep -c "leaflet-container" dist/assets/index-*.css
```
Manual: the acceptance checks above, using `npm run preview` after the build (stop it when done). `dist/` is gitignored.

Record the chunk table in the commit body, using the sizes the build prints (kB / gzip kB). Fill every cell from the real output; the "Before" row is the audit-time baseline:

| | JS chunks | Largest JS chunk | Entry JS | CSS |
|---|---|---|---|---|
| Before (353bbdd) | 1 | `index-BKHYcTwv.js` 1,422.67 / 419.78 | same file | `index-Bd92eCl1.css` 92.05 / 19.84 |
| After | N | name, size / gzip | `index-*.js` size / gzip | entry CSS size / gzip, plus the map CSS size / gzip |

Add one line stating whether the ">500 kB" warning remains and for which chunk. State that `/login` loads the entry and `vendor-firebase` only.

**Commit title:** `perf(bundle): split firebase, recharts and leaflet vendor chunks and scope leaflet CSS (perf-5)`

(The commit message carries no `Co-Authored-By` trailer and no "Generated with" line: the owner's global rule overrides any default attribution.)

---

## Risks & rollback

- **Step 2's regex groups are the one part that cannot be settled without a build.** No build was run while writing this spec (the machine is resource-constrained). The groups were derived from `recharts@2.15.4`'s real dependency list, but a dependency left out of a group can surface as a "Circular chunk" warning, and a package that app code also uses can drag a vendor chunk into the entry's static imports. The Step 2 acceptance greps catch both. The permitted fix is to move the named package into the group of its neighbour, never to add a catch-all `node_modules` rule (that bundles react and radix into the vendor chunks and defeats the point).
- **Stale tabs after a deploy.** Chunk names are content-hashed and served `immutable`. A browser tab opened before a deploy that then navigates to a not-yet-visited route asks for an old chunk name, which no longer exists. `vercel.json` rewrites that URL to `/index.html`, so the dynamic import fails ("Failed to fetch dynamically imported module"). The Layout boundary (08.2) shows its error card. Its "Try Again" cannot recover, because `React.lazy` caches a rejected import; "Reload Page" does. This is a known cost of lazy routes and is accepted. An automatic reload on `vite:preloadError` would be a small `main.tsx` change, which is outside this cluster (see Out of scope).
- **`LoginPage` is lazy too, as the cluster definition says.** The first visit to `/login` now costs one extra round trip (entry chunk, then the small login chunk, with the firebase chunk preloaded in parallel). The login chunk is small and Vite preloads its dependencies, so the net first-load cost is still far lower than the 420 kB gzip it replaces. If a measurement ever shows otherwise, making `LoginPage` a static import again is a one-line revert of that line in Step 1 and does not affect Step 2.
- **Leaflet CSS now sits after `index.css` in the cascade.** Safe today for the reasons in Step 2's edge cases. If a future rule in `index.css` targets an element Leaflet also styles (`img`, `a`, `button` inside `.leaflet-container`), it will lose to Leaflet's rule; scope it with `:not(.leaflet-container …)` as 10.7 does.
- **The `/dashboard` route still loads Leaflet and recharts**, because it shows a mini-map and charts. That matches the finding ("recharts only for /dashboard and /analytics, Leaflet only for /dashboard and /map"). Splitting the mini-map out of the dashboard chunk is out of scope.
- **Rollback.** Each step reverts on its own, newest first (master §1.7). Reverting Step 2 restores the single global Leaflet stylesheet and default chunking; the lazy pages from Step 1 keep working with it. Reverting Step 1 restores the static imports; `manualChunks` then only splits vendors. Neither step changes data, rules, indexes, dependencies, the IndexedDB schema or any deploy target, so no rollback needs a deploy beyond the normal Vercel one. Nothing here is pushed without the owner's go-ahead (§4.15); a push to `main` is a production deploy.
- **Later clusters that anchor on this one.** 12 (strict types) does not touch `routes.tsx`, `vite.config.ts` or `MapContainer.tsx` imports; `tsc -b` under `strict` already covers `vite.config.ts` through `tsconfig.node.json` (it is already `strict`), and the new code there uses explicit parameter and return types.

## Out of scope

- Preloading or prefetching the next page (for example prefetching the dashboard chunk after a successful sign-in, or on link hover).
- A `vite:preloadError` listener or a `lazyWithRetry` wrapper to recover automatically from stale-tab chunk failures (it belongs in `main.tsx` with the 08.2 root boundary).
- Lazy-loading the dashboard mini-map or individual charts inside their pages, or `import()` of Leaflet plugins on demand.
- A separate `react`/`react-dom`/`react-router` vendor chunk, a `radix-ui` or `date-fns` chunk, and `rollup-plugin-visualizer` or any other bundle analyzer (no dependency may be added).
- Raising or silencing `build.chunkSizeWarningLimit`.
- Removing unused dependencies (`@types/react-router-dom`, and moving `firebase-admin` to devDependencies, which is 03.3).
- Tailwind or CSS purging, and the 92 kB entry CSS beyond moving Leaflet's rules out of it.
- Any change to `src/config/firebase.ts` (the storage removal was 03.3 and the types are 12.1), to the page components, or to `vitest.config.ts`.
- perf-4 (bulk marker add) and every other performance finding; they live in clusters 05 and 09.
