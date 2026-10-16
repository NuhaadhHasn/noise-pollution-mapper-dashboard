# Performance Audit - Noise Pollution Mapper Web Dashboard

> Generated 2026-10-15 - multi-agent cross-repo audit, read-only. Dimension agents (security, data layer, correctness, React/Vite, UX, performance, build/deploy) read the dashboard repo (`noise-pollution-mapper-dashboard`, HEAD `353bbdd`) and the Flutter app (`noise_pollution_mapper`, master `9b08e68`) as its contract counterpart only. Every Critical/High finding was re-checked by an adversarial verifier; uncertain claims default to refuted. Production facts come from the owner-run read-only probe of 2026-10-16 ~00:20 (`prod_probe.json`, aggregates only, no PII): `noise_readings` holds 3,374 documents. No file outside `audit/` was modified, `serviceAccountKey.json` was never opened, and no build, install or network call to Firebase was made by the audit. Bundle sizes come from the precomputed `build.log` and `bundle.txt`; no profiler or bundle analyzer was run, so timing statements are estimates and are labelled as such.
>
> Status legend: `confirmed` = verifier re-proved it against the code; `partial` = mechanism confirmed, part of the claim corrected; `refuted` = disproved (kept for transparency, excluded from recommendations); `unverified` = not individually re-checked. Severity shown is the post-verification severity. Repo: `dashboard`, `app`, or `both`.

## Executive Summary

Total findings in this area: **6** (0 Critical, 1 High, 4 Medium, 1 Low). One was adversarially verified (`perf-1`, confirmed, with corrections to its impact text). The other five are `unverified (not individually re-checked)`.

Every finding is a dashboard-side cost. None is a cross-repo contract defect, and the Flutter app's own performance findings stay closed in `noise_pollution_mapper/audit/04` and `10`. Three themes:

1. **Read amplification on the shared Firebase project** (`perf-1`, `perf-2`). The landing route `/dashboard` opens an unfiltered `onSnapshot` on the whole `noise_readings` collection just to show a count. That bills about 3,374 reads on every page open, because the Firestore SDK uses its default in-memory cache and drops the documents on unmount. On top of that, five components each run their own IndexedDB load and sync, so a fresh browser profile can start several parallel full-collection first syncs. Reads are a project-wide quota shared with the Flutter app, which is why `perf-1` is High on the Spark plan. The billing plan could not be determined (**NEEDS PROD CHECK**).
2. **Render and map cost that grows linearly with data** (`perf-3`, `perf-4`, `perf-6`). `NoiseMarkers` rebuilds about 3,300 marker icons, filters and popups on every parent render, including every keystroke in a search box that does nothing. The clustering options `chunkedLoading` and `chunkInterval` have no effect because react-leaflet adds markers one at a time.
3. **One 1.42 MB JavaScript chunk for everything** (`perf-5`). `build.log` shows a single `index-BKHYcTwv.js` of 1,422.67 kB (419.78 kB gzip). The login page downloads Leaflet, recharts and the Firestore, Auth and Storage SDKs before showing a form.

Nothing here is a correctness or security defect on its own. `perf-1` does have a failure-mode side effect (skeletons forever when the listener errors), and that part is reported by the correctness and UX documents as well.

## Summary Table

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| perf-1 | High | DashboardPage attaches a full-collection onSnapshot (~3,374 billed reads per visit) only to show a count, with no error callback, so failures leave skeletons forever | `src/pages/DashboardPage.tsx:33` (dashboard) | confirmed - NEEDS PROD CHECK (billing plan) |
| perf-2 | Medium | Each chart/card calls useSyncedReadings independently, so a fresh browser fires up to five parallel full-collection first syncs | `src/hooks/useSyncedReadings.ts:79` (dashboard) | unverified |
| perf-3 | Medium | NoiseMarkers rebuilds every marker icon, position and popup on each parent render, calling setIcon on thousands of clustered markers | `src/components/map/NoiseMarkers.tsx:310` (dashboard) | unverified |
| perf-4 | Medium | MarkerClusterGroup chunkedLoading is ineffective because react-leaflet adds ~3.3k markers one at a time in a synchronous burst | `src/pages/MapPage.tsx:169` (dashboard) | unverified |
| perf-5 | Medium | No route-level code splitting: one 1.42 MB (420 kB gzip) chunk with leaflet, recharts and firebase/storage loads on the login page | `src/routes.tsx:3` (dashboard) | unverified |
| perf-6 | Low | DataTable re-sorts the entire dataset with Date allocations on every page or rows-per-page change | `src/components/analytics/DataTable.tsx:86` (dashboard) | unverified |

## Detailed Findings

### Critical

None. No performance finding is a breach, data loss, or a production feature that is dead today.

### High

#### [perf-1] DashboardPage attaches a full-collection onSnapshot (~3,374 billed reads per visit) only to show a count, with no error callback, so failures leave skeletons forever

**Severity:** High (post-verification; falls to Medium if the project is on the Blaze plan) | **Status:** confirmed - **NEEDS PROD CHECK** (billing plan) | **Category:** performance | **Repo:** dashboard | **Confidence:** high

**Verifier verdict (CONFIRMED):** The finding holds on every point checked in source. `/` redirects to `/dashboard` (`src/routes.tsx:48-50`, `<Navigate to="/dashboard" replace />`), the page sits inside `ProtectedRoute`, and `LoginPage` navigates there after login, so this is the landing page for every session. The listener is an unfiltered, unlimited query on the whole collection and only `.size` is used. The read rule is `isSignedIn()`, so the listener succeeds and bills one read per document (3,374 per the prod probe). There is no cache to soften it: `config/firebase.ts` uses plain `getFirestore(app)` (default memory cache with eager GC), so when the listener unsubscribes the documents are dropped and each return to the page, or F5, re-reads everything. No error callback is passed, and nothing else clears `isLoading`, which gates `StatsCardsSkeleton`, `MapSkeleton` and `ChartSkeleton`. The IndexedDB path (`useSyncedReadings`, `NoiseMarkers`) would render instantly, but `DashboardPage` withholds those components until the network snapshot arrives, so the "instant from IndexedDB" design never shows on this route. `NoiseMarkers` also writes the count through `onMarkersLoaded`, so the "{markerCount} markers" badge depends on whichever source writes last. Severity: on Spark about 15 opens a day (3,374 x 15 = 50,610) reach the 50k/day read quota, which breaks reads project-wide including the Flutter app. High is kept for the default landing route, linear growth with data, and the shared quota. The Spark-or-Blaze question could not be answered this session; `functions/src/cache-export.ts:63,129` defines `onSchedule` functions, which would need Blaze if deployed, but deployment is unverified. That is why a production check is flagged: on Blaze the dollar cost is trivial and severity falls to Medium (first-paint latency plus read amplification).

**Verifier corrections applied to the original claim:**
- "A full re-read after any reconnect" is overstated. Firestore resumes an active listener with a resume token, so only a disconnect longer than about 30 minutes is billed as a fresh full query. The re-read that matters happens on every re-mount or reload.
- Spark read-quota exhaustion blocks reads only. Writes have a separate daily quota, so the Flutter app's writes would not fail. Its reads would.
- "Skeletons forever" is true for listener errors (for example `RESOURCE_EXHAUSTED`, `permission-denied`). When the browser is merely offline, the SDK raises an empty `fromCache` snapshot (the memory cache has no documents) and the page shows the "No Data Available" empty state even though IndexedDB holds data. That is misleading, but it is not a stuck skeleton.
- The document count is 3,374 per the 2026-10-16 prod probe, not about 3,330.

**Location:** `src/pages/DashboardPage.tsx:33` (also `src/config/firebase.ts:29`, `src/components/map/NoiseMarkers.tsx:77,94,235`), dashboard

**Description:**

`DashboardPage` subscribes to the entire `noise_readings` collection on mount and uses nothing from the snapshot except its size. The SDK is initialised without persistent local cache, so each mount is a full billed read. The listener has no error callback. The three page sections that show data (stats cards, map, charts) are all gated on the loading flag this listener clears, so they wait for the full download and never show IndexedDB data first.

**Evidence:**

`src/pages/DashboardPage.tsx:32-39`:
```
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'noise_readings'), (snapshot) => {
      setMarkerCount(snapshot.size);
      setHasData(snapshot.size > 0);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
```
`src/pages/DashboardPage.tsx:59-61` gates the stats cards: `{isLoading ? (` / `<StatsCardsSkeleton />` / `) : hasData ? (`. The map is gated at `:110-111` (`{isLoading ? (` / `<MapSkeleton showHeader={false} showControls={false} />`), and the charts at `:152-154` (`{isLoading ? (` / `<>` / `<ChartSkeleton />`).

`src/config/firebase.ts:29`: `export const db: any = getFirestore(app);` (no `persistentLocalCache`).

`src/pages/DashboardPage.tsx:141`: `<NoiseMarkers onMarkersLoaded={setMarkerCount} />`, which overwrites the same state.

`src/components/map/NoiseMarkers.tsx:77`: `onMarkersLoaded(cachedReadings.length);`, `:94`: `onMarkersLoaded(updatedReadings.length);`, `:235`: `onMarkersLoaded(filteredReadings.length);`.

`prod_probe.json`: `"noise_readings": { "count": 3374`.

**Impact:**

Every `/dashboard` open bills one Firestore read per document in `noise_readings` (3,374 today), plus one per new document while the tab is open. About 15 opens a day is roughly 50k reads, the Spark free daily read quota (billing plan unverified). Reads are a project-wide quota, so exhausting it would also fail the Flutter app's reads. Cost grows linearly with data: 10x readings means about 33k reads per open. The map, stats and charts stay on skeletons until the full download completes, and a listener error leaves them on skeletons indefinitely.

**Recommendation:**

Delete the `onSnapshot`. Derive `hasData` and the count from `useSyncedReadings` or `localDb.getReadingsCount()`, which already hold the same data. If a server-side count is wanted, call `getCountFromServer` once per session (1 read per 1,000 index entries, no index needed). Do not gate rendering on a network round-trip. If any listener stays, pass an error callback that clears loading and renders an error state. No new index is needed; the single existing composite index is untouched. The playbook `08_FIX_IMPLEMENTATION_PLAYBOOK.md` carries the exact edit. **Production check needed:** confirm whether project `noise-pollution-mapper-9ad3d` is on Spark or Blaze.

---

### Medium

#### [perf-2] Each chart/card calls useSyncedReadings independently, so a fresh browser fires up to five parallel full-collection first syncs

**Severity:** Medium | **Status:** unverified (not individually re-checked) | **Category:** performance | **Repo:** dashboard | **Confidence:** high

**Location:** `src/hooks/useSyncedReadings.ts:79`, `src/utils/syncManager.ts:74,131` (dashboard)

**Description:**

`useSyncedReadings` loads the IndexedDB cache and then calls `syncManager.syncNewReadings()` on every mount. Five separate consumers call the hook, and `NoiseMarkers` runs the same load-then-sync pattern on its own. The first-sync guard reads a flag that is only set after the full fetch finishes, so concurrent callers all see "first sync not done" and each fetch the whole collection. Warm visits still do several full IndexedDB `getAll()` structured clones and several delta queries. The hook also contains a second copy of the load logic (`loadData`/`refresh` at `:35-62`) that no consumer references.

**Evidence:**

Consumers (each `const { readings } = useSyncedReadings();`): `src/components/analytics/StatsCards.tsx:8`, `src/components/analytics/NoiseTrendChart.tsx:21`, `src/components/analytics/CategoryChart.tsx:67`, `src/components/analytics/SoundTypeChart.tsx:24`, `src/pages/AnalyticsPage.tsx:22`. `NoiseMarkers` runs its own sync at `src/components/map/NoiseMarkers.tsx:86`: `const syncResult = await syncManager.syncNewReadings();`.

`src/hooks/useSyncedReadings.ts:79`: `const syncResult = await syncManager.syncNewReadings();`

`src/utils/syncManager.ts:74`: `const firstSyncDone = await isFirstSyncDone();` and `:131`: `await setFirstSyncDone();` (set only after the fetch at `:112-130` completes). The first sync is an unbounded query, `:112-115`:
```
        q = query(
          collection(firebaseDb, 'noise_readings'),
          orderBy('timestamp', 'desc')
        );
```
There is no in-flight lock anywhere in the file.

**Impact:**

A brand-new browser profile opening `/dashboard` can have several instances all see `firstSyncDone=false`, and each runs a `getDocs` over the whole collection. That is on the order of 3,374 reads per instance, so up to roughly 17k reads from the sync hooks alone, plus the 3,374 from `perf-1`, and several parallel `setManyReadings` writes. React StrictMode doubles mounts in development. The exact count depends on timing; it was not measured. Warm visits do up to five IndexedDB `getAll()` clones of about 3,374 rows (five copies in memory) and five delta queries (each billed a minimum of one read). Cost scales with data: at 10x it is five 33k-row clones per navigation.

**Recommendation:**

Lift the readings into a single provider (React context) mounted under `ProtectedRoute` that loads and syncs once and exposes `readings`, `loading` and `refresh`. Add a module-level in-flight promise in `syncNewReadings` so concurrent callers share one sync. Remove the unused duplicate `loadData`/`refresh`, or make the effect call it. Keep the existing query shapes so no new index is needed.

---

#### [perf-3] NoiseMarkers rebuilds every marker icon, position and popup on each parent render, calling setIcon on thousands of clustered markers

**Severity:** Medium | **Status:** unverified (not individually re-checked) | **Category:** performance | **Repo:** dashboard | **Confidence:** high

**Location:** `src/components/map/NoiseMarkers.tsx:310` (dashboard)

**Description:**

`createMarkerIcon` builds a new Leaflet `Icon` (with a `btoa`-encoded SVG data URL) for every marker on every render, although only three colours exist. react-leaflet's `Marker` calls `setIcon` whenever the `icon` prop identity changes, so each parent re-render re-icons every marker. The filtered list is recomputed on every render, not memoised, and logs a `console.warn` for every invalid reading each time. `MapPage` re-renders on every keystroke of a search box whose value is not used by anything, and passes `NoiseMarkers` a fresh `filters` object each time.

**Evidence:**

`src/components/map/NoiseMarkers.tsx:11-13`: `function createMarkerIcon(color: string): Icon {` / `return new Icon({` / ``iconUrl: `data:image/svg+xml;base64,${btoa(` ``.

`src/components/map/NoiseMarkers.tsx:117`: `const filteredReadings = readings.filter(reading => {`. `:145`: `console.warn('Invalid location data for reading:', reading.id, reading);`. `:151`: `console.warn('Invalid decibel level for reading:', reading.id);`.

`src/components/map/NoiseMarkers.tsx:307-311`:
```
          <Marker
            key={reading.id}
            position={[lat, lng] as LatLngExpression}
            icon={createMarkerIcon(getMarkerColor(reading.decibelLevel))}
          >
```
`node_modules/react-leaflet/lib/Marker.js:13`: `marker.setIcon(props.icon);` (guarded by `props.icon !== prevProps.icon`).

`src/pages/MapPage.tsx:23`: `const [searchQuery, setSearchQuery] = useState('');`, `:81-82`: `value={searchQuery}` / `onChange={(e) => setSearchQuery(e.target.value)}`. `searchQuery` has no other use in the file (grep shows only lines 23, 81, 82). `src/pages/MapPage.tsx:174`: `filters={{` (a new object literal each render).

**Impact:**

With about 3,374 readings, every `MapPage` keystroke, heatmap toggle or filter-panel toggle runs thousands of filter predicates, allocates thousands of `Icon` objects and base64 strings, reconciles thousands of `Marker`/`Popup` trees and calls `setIcon` on every marker already on the map. Typing into the dead "Search..." box janks the page, and the console fills with warn spam if documents have bad coordinates. On `/dashboard` each `setMarkerCount` call re-renders the same tree. Cost grows linearly with data. Timing was not measured.

**Recommendation:**

Create the icons once at module level, keyed by colour (three entries). Memoise the filtered list with `useMemo` on primitive dependencies, and memoise the `filters` object in the parent. Memoise the marker list or wrap the marker in `React.memo`. Remove the per-render `console.warn`. Consider rendering popup content only when a popup opens.

---

#### [perf-4] MarkerClusterGroup chunkedLoading is ineffective because react-leaflet adds ~3.3k markers one at a time in a synchronous burst

**Severity:** Medium | **Status:** unverified (not individually re-checked) | **Category:** performance | **Repo:** dashboard | **Confidence:** medium

**Location:** `src/pages/MapPage.tsx:169` (dashboard)

**Description:**

The map page passes `chunkedLoading: true` and a `chunkInterval` to the cluster group. In leaflet.markercluster, `chunkedLoading` is read only inside the bulk `addLayers` path. react-leaflet adds each `<Marker>` through `container.addLayer(...)` one at a time, so the option is never consulted. The dashboard overview mounts `<MarkerClusterGroup>` with no options at all. The wrapper's update function is empty.

**Evidence:**

`src/pages/MapPage.tsx:169-172`:
```
              chunkedLoading: true,
              chunkInterval: 100,  // Faster chunks (was 200ms)
              chunkDelay: 0,  // No delay between chunks (was 50ms)
```
`node_modules/leaflet.markercluster/src/MarkerClusterGroup.js:43`: `chunkedLoading: false,` (default) and `:201`: `chunked = this.options.chunkedLoading,` (inside the bulk path).

`node_modules/@react-leaflet/core/lib/layer.js:9`: `container.addLayer(element.instance);` (one call per marker).

`src/components/map/MarkerClusterGroup.tsx:21-23`:
```
function updateCluster() {
  // Update cluster options if needed
}
```
`src/pages/DashboardPage.tsx:140`: `<MarkerClusterGroup>` (no options).

**Impact:**

All of the roughly 3,374 `addLayer` calls run in one synchronous burst inside React's commit phase, blocking the main thread for the duration (cluster-index insertion per marker; the duration was not measured, but expect it to be noticeable on phones). The "faster chunks" settings give a false sense of tuning. When a filter shrinks the list, React unmounts each excluded marker individually, which means thousands of `removeLayer` calls.

**Recommendation:**

Build the cluster group imperatively in one effect: create the markers, then call `clearLayers()` and `addLayers(markers)` (the bulk path that honours `chunkedLoading`) whenever the filtered array changes, instead of one React `<Marker>` per reading. Give the dashboard overview the same sensible options. Note the cited line `MarkerClusterGroup.tsx:395-397` in the original finding does not exist; the empty function is at `:21-23`.

---

#### [perf-5] No route-level code splitting: one 1.42 MB (420 kB gzip) chunk with leaflet, recharts and firebase/storage loads on the login page

**Severity:** Medium | **Status:** unverified (not individually re-checked) | **Category:** performance | **Repo:** dashboard | **Confidence:** high

**Location:** `src/routes.tsx:3` (dashboard)

**Description:**

All four pages are imported statically, nothing uses `React.lazy`, and `vite.config.ts` has no `manualChunks`. The production build emits a single JavaScript chunk and a single CSS file. Leaflet's stylesheet is imported globally. Firebase Storage is initialised at module load, although nothing uses it and the project has no bucket.

**Evidence:**

`build.log`:
```
.../dist-audit/assets/index-Bd92eCl1.css     92.05 kB │ gzip:  19.84 kB
.../dist-audit/assets/index-BKHYcTwv.js   1,422.67 kB │ gzip: 419.78 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
```
`bundle.txt`: `1,422,665 bytes  index-BKHYcTwv.js`, `92,045 bytes  index-Bd92eCl1.css`, `no server-only markers found in built JS`.

`src/routes.tsx:3-6`: `import LoginPage from '@/pages/LoginPage';` / `import DashboardPage from '@/pages/DashboardPage';` / `import MapPage from '@/pages/MapPage';` / `import AnalyticsPage from '@/pages/AnalyticsPage';`. A grep of `src` finds no `React.lazy`, `lazy(` or `Suspense` outside `components/ui`; `vite.config.ts` has no `manualChunks` or `rollupOptions`.

`src/index.css:7`: `@import "leaflet/dist/leaflet.css";`. `src/config/firebase.ts:12`: `import { getStorage } from 'firebase/storage';` and `:30`: `export const storage: any = getStorage(app);` (no importer of `storage` from `@/config/firebase` anywhere in `src`).

**Impact:**

Unauthenticated visitors on `/login` download and parse about 420 kB gzip (1.4 MB parsed) containing Leaflet, markercluster, leaflet.heat, recharts and its d3 dependencies, and the Firestore, Auth and Storage SDKs, plus 19.8 kB gzip of CSS. On a mid-range phone over a slow connection that is likely several seconds before the form is interactive (an estimate, not measured). With a single hash, all of it re-downloads on every deploy. Which libraries dominate was not measured (no analyzer output).

**Recommendation:**

Convert the four pages in `routes.tsx` to `React.lazy` with a `Suspense` fallback, so recharts loads only for `/dashboard` and `/analytics`, and Leaflet only for `/dashboard` and `/map`. Add `build.rollupOptions.output.manualChunks` for firebase, recharts and leaflet vendor groups. Move the Leaflet CSS import into the map components. Remove the unused `getStorage` import and `storage` export.

---

### Low

#### [perf-6] DataTable re-sorts the entire dataset with Date allocations on every page or rows-per-page change

**Severity:** Low | **Status:** unverified (not individually re-checked) | **Category:** performance | **Repo:** dashboard | **Confidence:** medium

**Location:** `src/components/analytics/DataTable.tsx:86` (dashboard)

**Description:**

Sorting and pagination share one `useMemo`, so changing the page re-sorts the whole dataset. The default sort allocates two `Date` objects per comparison through the local `toDate`.

**Evidence:**

`src/components/analytics/DataTable.tsx:86`: `const sorted = [...data].sort((a, b) => {`. `:92-93`: `aVal = toDate(a.timestamp).getTime();` / `bVal = toDate(b.timestamp).getTime();`. `:129`: `}, [data, sortField, sortDirection, currentPage, rowsPerPage]);`.

**Impact:**

Clicking Next on about 3,374 rows does an O(n log n) copy and sort (tens of thousands of comparisons and Date allocations). Probably a few milliseconds today, but it grows with the data: at 100k rows it would be a visible stall per page click. Not measured.

**Recommendation:**

Split into two memos: the sort keyed on `[data, sortField, sortDirection]` (precompute timestamp milliseconds once per row), then the slice keyed on `[sorted, currentPage, rowsPerPage]`.

---

### Enhancement

None recorded for this area.
