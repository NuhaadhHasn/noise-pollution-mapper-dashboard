# UI/UX Audit - Noise Pollution Mapper Web Dashboard

> Generated 2026-10-15 - multi-agent cross-repo audit, read-only. Dimension agents (security, data layer, correctness, React/Vite, UX, performance, build/deploy) read the dashboard repo (`noise-pollution-mapper-dashboard`, HEAD `353bbdd`) and the Flutter app (`noise_pollution_mapper`, master `9b08e68`) as its contract counterpart only. Every Critical/High finding was re-checked by an adversarial verifier; uncertain claims default to refuted. Production facts come from the owner-run read-only probe of 2026-10-16 ~00:20 (`prod_probe.json`, aggregates only, no PII). No file outside `audit/` was modified, `serviceAccountKey.json` was never opened, and no build, install or network call to Firebase was made by the audit.
>
> Status legend: `confirmed` = verifier re-proved it against the code; `partial` = mechanism confirmed, part of the claim corrected; `refuted` = disproved (kept for transparency, excluded from recommendations); `unverified` = not individually re-checked. Severity shown is the post-verification severity. Repo: all findings in this document are `dashboard`, none is cross-repo. Accessibility findings are in `07_ACCESSIBILITY_AUDIT.md`. Exact BEFORE/AFTER edits live in `08_FIX_IMPLEMENTATION_PLAYBOOK.md`; the step numbers cited below are its master checklist numbers (section 5).

## Executive Summary

Total findings in this area: **14** (0 Critical, 0 High, 5 Medium, 9 Low). None was individually verified: every one is Medium or Low, which was outside the verification queue, so each is `unverified (not individually re-checked)`. For this document the cited lines were re-opened and the quotes below are verbatim. No finding was refuted. No finding is flagged NEEDS PROD CHECK.

The themes:

1. **The dashboard says "no data" when it means "loading" or "failed"** (`ux-1`, `ux-2`, `ux-9`). The analytics components ignore the sync hook's `loading` and `error` state, so a first visit or a rejected sync reads as "Start recording noise". The map's default 'My Readings Only' filter plus a fake grey "Be the first to contribute" pin makes a researcher with no readings of their own think the project is empty.
2. **Numbers without their caveats** (`ux-3`, `ux-12`). dB values, Peak and Average are presented as measured fact, with none of the app's "uncalibrated estimate" disclosure. The overview is labelled "Real-time" for data that refreshes only on page load.
3. **Layout that fails at the edges** (`ux-4`, `ux-5`, `ux-13`). The Leaflet map is a fixed 400/600 px tall inside a 256-320 px window, which hides the required OpenStreetMap attribution on the overview. A global 44 px min-height rule distorts Leaflet controls, and the map's top bar can overflow on a 360 px phone (derived from markup, not measured).
4. **Dead or misleading controls and copy** (`ux-6`, `ux-7`, `ux-8`, `ux-10`, `ux-11`, `ux-14`). A search box, a "Current location" button and a "coming soon" panel do nothing. A dialog tells users to download a cache file no UI offers. There is no 404 route, and the title and favicon are Vite defaults.

Fixes for `ux-1`, `ux-2`, `ux-3`, `ux-4`, `ux-5` and `ux-7` are in the playbook. `ux-6`, `ux-8` (remainder), `ux-9`, `ux-10`, `ux-11`, `ux-12`, `ux-13` and `ux-14` are in its section 7 follow-up list.

## Summary Table

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| ux-1 | Medium | Analytics ignores the sync hook's loading and error state, so in-progress or failed syncs render as 'No data available - Start recording noise' | `src/pages/AnalyticsPage.tsx:22` (dashboard) | unverified |
| ux-2 | Medium | Overview shows all users but /map defaults to 'My Readings Only' and shows a false 'Be the first to contribute' pin | `src/pages/MapPage.tsx:27` (dashboard) | unverified |
| ux-3 | Medium | dB values, Peak and Avg Noise Level are presented as measured fact with none of the app's uncalibrated-estimate disclosure, including in exports | `src/components/analytics/StatsCards.tsx:58` (dashboard) | unverified |
| ux-4 | Medium | Overview mini-map is clipped (OSM attribution hidden, centre off-screen) and the full-page map does not fill its container | `src/components/map/MapContainer.tsx:34` (dashboard) | unverified |
| ux-5 | Medium | Map top-bar controls overflow 360px phones and a global 44px min-height distorts Leaflet controls and table layout | `src/pages/MapPage.tsx:54` (dashboard) | unverified |
| ux-6 | Low | Map search box, 'Current location' button and 'More filters coming soon' panel are non-functional in production | `src/pages/MapPage.tsx:79` (dashboard) | unverified |
| ux-7 | Low | All-users confirmation dialog recommends a 'shared cache file' download no UI offers and no bucket can serve, and calls 'My Readings Only' secure | `src/components/map/UserFilterToggle.tsx:108` (dashboard) | unverified |
| ux-8 | Low | Routing and auth UX gaps: no 404 route, return path lost after login, 'Remember me' writes but never reads, 'Request access' implies gating that does not exist | `src/routes.tsx:17` (dashboard) | unverified |
| ux-9 | Low | DataTable pagination is not clamped: '1/0' and 'Showing -9 to 0 of 0' with enabled Next/Last, stale page after data shrinks | `src/components/analytics/DataTable.tsx:347` (dashboard) | unverified |
| ux-10 | Low | Trend chart draws max/min lines with dot={false}, so a single bucket shows only the average point | `src/components/analytics/NoiseTrendChart.tsx:244` (dashboard) | unverified |
| ux-11 | Low | Print button prints only the current 10-row table page with no warning | `src/pages/AnalyticsPage.tsx:143` (dashboard) | unverified |
| ux-12 | Low | 'Real-time' subtitle overstates freshness of cache-backed data refreshed only on page load | `src/pages/DashboardPage.tsx:54` (dashboard) | unverified |
| ux-13 | Low | Markers outside the hard-coded Sri Lanka maxBounds are counted in the badge and heatmap but can never be panned to | `src/components/map/MapContainer.tsx:32` (dashboard) | unverified |
| ux-14 | Low | Document title and favicon are Vite defaults and never change per route | `index.html:7` (dashboard) | unverified |

## Detailed Findings

### Critical

None.

### High

None. No UI/UX finding reached High: each one misleads or inconveniences a user but leaves the underlying data correct. The related High finding `bug-1` (timestamps lost in exports and popups) is in `01_BUGS_AND_CORRECTNESS.md`.

### Medium

#### [ux-1] Analytics ignores the sync hook's loading and error state, so in-progress or failed syncs render as 'No data available - Start recording noise'

**Severity:** Medium | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux, react

**Status:** unverified (not individually re-checked). Two dimension agents matched; the lines below were re-opened.

**Location:** `src/pages/AnalyticsPage.tsx:22`; `src/hooks/useSyncedReadings.ts:51` (dashboard)

**Description:** `useSyncedReadings` sets `error` and `loading`, but every consumer destructures only `{ readings }`. The charts then show their "empty" copy for a state that is not empty.

**Evidence:**
- `src/pages/AnalyticsPage.tsx:22`: `const { readings } = useSyncedReadings();` (also `StatsCards.tsx:8`, `NoiseTrendChart.tsx:21`, `CategoryChart.tsx:67`, `SoundTypeChart.tsx:24`).
- `src/hooks/useSyncedReadings.ts:52-54`: `console.error('[useSyncedReadings] Error loading data:', err);` / `setError(err instanceof Error ? err : new Error('Failed to load readings'));` / `setLoading(false);`
- `src/pages/AnalyticsPage.tsx:82`: `Analyzing {markerCount.toLocaleString()} noise readings`
- `src/components/analytics/CategoryChart.tsx:109,112`: `No data available` / `Start recording noise to see categories`
- `src/components/analytics/NoiseTrendChart.tsx:156,159`: `No data available` / `Start recording noise to see trends`

**Impact:** First visit on a fresh browser: IndexedDB is empty during the multi-second first download, so the page shows `Analyzing 0 noise readings`, zero stats and three "Start recording noise" empty cards. If the sync is rejected (permission-denied, quota, offline), the same empty state stays permanently and the error exists only in the console. A new or non-admin user cannot tell "no data" from "failed to load". The copy also tells researchers to record noise, which is not their job.

**Recommendation:** Hoist one `useSyncedReadings()` into `AnalyticsPage` (or a shared provider), pass readings down, show skeletons while loading and an error state with a retry (`refresh()` already exists in the hook) when `error` is set, and reword the empty copy. Playbook steps 16 and 17 (`05_sync_engine_provider`).

---

#### [ux-2] Overview shows all users but /map defaults to 'My Readings Only' and shows a false 'Be the first to contribute' pin

**Severity:** Medium | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). Single-dimension finding; the lines below were re-opened.

**Location:** `src/pages/MapPage.tsx:27`; `src/components/map/NoiseMarkers.tsx:245` (dashboard)

**Description:** `DashboardPage` renders `NoiseMarkers` with no filters, so it shows every reading. `MapPage` defaults `showAllUsers` to false and filters on the signed-in uid. When nothing matches, `NoiseMarkers` renders a grey marker at the map centre whose popup claims nobody has contributed.

**Evidence:**
- `src/pages/MapPage.tsx:27`: `const [showAllUsers, setShowAllUsers] = useState(false); // Phase 1: User filter`
- `src/pages/MapPage.tsx:174-178`: `filters={{` / `userId: user?.uid || '',` / `showAllUsers,` / `dateRange: dateRange || undefined,`
- `src/pages/DashboardPage.tsx:141`: `<NoiseMarkers onMarkersLoaded={setMarkerCount} />`
- `src/components/map/NoiseMarkers.tsx:245-255`: `if (filteredReadings.length === 0) {` ... `<p className="font-semibold mb-1">No noise readings yet</p>` / `Be the first to contribute data using our mobile app!`
- `src/pages/MapPage.tsx:136`: `<span className="font-semibold text-sm">{markerCount} markers</span>`

**Impact:** A researcher with no readings of their own sees thousands of markers on the Dashboard card, clicks through to the full map and gets a lone grey pin whose popup says "No noise readings yet". That is false for a project with 3,374 readings in production. Recovering requires finding the hidden filter panel.

**Recommendation:** Default `/map` to all readings (the rules already allow it), or make the empty state say "No readings match your filters" with a Clear filters action, rendered as an overlay rather than a Marker. Playbook step 33 (`09_map_correctness_perf`). See also `bug-9`.

---

#### [ux-3] dB values, Peak and Avg Noise Level are presented as measured fact with none of the app's uncalibrated-estimate disclosure, including in exports

**Severity:** Medium | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). A grep of the dashboard `src/` for `uncalibrated`, `calibrat` and `estimate` returns no matches (re-run for this document).

**Location:** `src/components/analytics/StatsCards.tsx:58` (dashboard)

**Description:** The Flutter app tells its users the numbers are rough. The dashboard, which is aimed at researchers, shows one-decimal dB, a "Peak Noise" that can be one miscalibrated phone, and Low/Moderate/High bands, with no caveat anywhere, including in the exported files.

**Evidence:**
- `src/components/analytics/StatsCards.tsx:58`: `<h3 className="text-xs sm:text-sm font-medium text-gray-500">Avg Noise Level</h3>`; `:65` `{stats.avgNoiseLevel} <span className="text-sm font-normal text-gray-500">dB</span>`; `:75` `Peak Noise`.
- `src/components/map/NoiseMarkers.tsx:326`: `{reading.decibelLevel.toFixed(1)} dB`
- `src/components/analytics/NoiseTrendChart.tsx:250,258`: `name="Maximum"` / `name="Minimum"`
- `src/utils/exportHelpers.ts:20`: `'Noise Level (dB)',`
- App disclosure, `noise_pollution_mapper/lib/screens/dashboard_screen.dart:1015`: `'Uncalibrated estimate from your phone microphone — '`

**Impact:** The 50 and 70 dB bands read as regulatory-style findings. Exported CSV and JSON carry no caveat either, so the numbers detach from their limits when shared.

**Recommendation:** Add a one-line note under the stats row, chart headers and map: "dB values are uncalibrated estimates from phone microphones; levels vary by device." Add a `note` field to the JSON metadata and a first CSV comment row, and consider whole-dB rounding. Playbook step 27 (`07_export_privacy`).

---

#### [ux-4] Overview mini-map is clipped (OSM attribution hidden, centre off-screen) and the full-page map does not fill its container

**Severity:** Medium | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). Derived from the CSS classes and container sizes below; not measured in a browser.

**Location:** `src/components/map/MapContainer.tsx:34` (dashboard)

**Description:** The Leaflet container has a fixed height of 400 px (600 px from `md`), independent of its parent. On the overview it sits in a 256-320 px clip window. On `/map` the parent is `calc(100vh - 7rem)` and the map is absolutely positioned to fill it, but the map's own height class still wins.

**Evidence:**
- `src/components/map/MapContainer.tsx:34`: `className="w-full h-[400px] md:h-[600px] z-0"`
- `src/components/map/MapContainer.tsx:39`: `attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'`
- `src/pages/DashboardPage.tsx:109`: `<div className="h-64 sm:h-72 lg:h-80 w-full overflow-hidden">`
- `src/pages/MapPage.tsx:52`: `style={{ height: 'calc(100vh - 7rem)' }}` and `:141-143` `className="absolute inset-0 w-full h-full"`

**Impact:** On the Dashboard the map is 400-600 px tall inside a 256-320 px window, so 40-50% of it, including the OpenStreetMap attribution the licence requires, is cut off, and the map centre sits below the visible area. On `/map` at tall viewports the map stops at 600 px and leaves a grey gap, with the 'N markers' badge floating off the map. On phones the 400 px map can leave a gap under it.

**Recommendation:** Make the map `h-full` and let the parent define the height, so the attribution stays visible. Playbook step 42 (`10_accessibility_layout`).

---

#### [ux-5] Map top-bar controls overflow 360px phones and a global 44px min-height distorts Leaflet controls and table layout

**Severity:** Medium | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** medium | **Reported by:** ux

**Status:** unverified (not individually re-checked). Confidence is medium: the 360 px overflow is derived from the markup and was not measured.

**Location:** `src/pages/MapPage.tsx:54`; `src/index.css:164` (dashboard)

**Description:** The top bar is capped at `calc(100vw - 2rem)` but its right-hand control group is `shrink-0` and holds the sync widget plus three icon buttons. Below 640 px, `index.css` forces every `button` and `a` to at least 44 px tall and turns every `table` into a block.

**Evidence:**
- `src/pages/MapPage.tsx:60-61`: `maxWidth: 'calc(100vw - 2rem)',` / `minWidth: '280px'`
- `src/pages/MapPage.tsx:89`: `<div className="flex gap-1.5 shrink-0 border-t sm:border-t-0 sm:border-l ...">`
- `src/components/map/SyncStatus.tsx:109-111`: `<div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${` ... `} backdrop-blur-sm shadow-lg`}>`
- `src/index.css:164-169`: `@media (max-width: 640px) {` / `button,` / `a {` / `min-height: 44px;`
- `src/index.css:176-179`: `table {` / `display: block;` / `overflow-x: auto;`

**Impact:** At 360 px the controls row can be wider than the bar and spill past the card and the screen edge, so Filters or Crosshair may be pushed off-screen. Leaflet's zoom buttons and popup close control are `a` elements, so they become 44 px tall with misaligned glyphs. `display: block` on tables removes table semantics in several browsers (see also `a11y-2`).

**Recommendation:** Let the controls row wrap or collapse the sync widget to an icon on small screens. Scope the 44 px rule to an app-level class and exclude `.leaflet-container a`. Wrap tables in an `overflow-x-auto` div instead of changing `display`. Playbook step 43 (`10_accessibility_layout`).

---

### Low

#### [ux-6] Map search box, 'Current location' button and 'More filters coming soon' panel are non-functional in production

**Severity:** Low | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux, react

**Status:** unverified (not individually re-checked). The lines below were re-opened.

**Location:** `src/pages/MapPage.tsx:79` (dashboard)

**Description:** The search state is bound to an input but never read by any filter. The crosshair button has no handler. The filter panel advertises two filters that do not exist, although `NoiseMarkers` already accepts `categories` and `dbRange`.

**Evidence:**
- `src/pages/MapPage.tsx:23`: `const [searchQuery, setSearchQuery] = useState('');` (read only at `:81-82` as `value={searchQuery}`).
- `src/pages/MapPage.tsx:118-126`: `<Button` / `variant="outline"` ... `title="Current location"` (no `onClick`).
- `src/pages/MapPage.tsx:263-269`: `More filters coming soon:` / `<li>• Category</li>` / `<li>• Noise level</li>`
- `src/components/map/NoiseMarkers.tsx:41-42`: `categories?: string[];` / `dbRange?: { min: number; max: number };`

**Impact:** A user types a place into 'Search...' and nothing happens, and the crosshair does nothing. There is no way to filter to the new Quiet or Uncertain classes, or to Pollution vs Ambient.

**Recommendation:** Wire search (filter on `locationName` and `soundClass`) and category and dB-range filters, or remove the controls and the placeholder list. In the playbook's section 7 follow-up list (`ux-6`).

---

#### [ux-7] All-users confirmation dialog recommends a 'shared cache file' download no UI offers and no bucket can serve, and calls 'My Readings Only' secure

**Severity:** Low | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). A grep across `src/` finds `CacheStatus` referenced only in its own file; the project has no Storage bucket (FACTS).

**Location:** `src/components/map/UserFilterToggle.tsx:108` (dashboard)

**Description:** The dialog copy points to a feature that was never reachable. The only code that downloads a shared cache (`CacheStatus`, `cacheDownloader`) is dead and would fail without a bucket. 'My Readings Only' is described as secure, but it is a client-side filter over data every signed-in user has already downloaded in full.

**Evidence:**
- `src/components/map/UserFilterToggle.tsx:108`: `For best performance with all users' data, download the shared cache file. This will load all readings instantly.`
- `src/components/map/UserFilterToggle.tsx:22-23`: `Default: My Readings Only (secure, minimal Firebase reads)` / `Optional: All Users (requires downloading shared cache)`
- `src/components/map/CacheStatus.tsx:173`: `<p>Downloading all noise readings from Firebase Storage...</p>`

**Impact:** Every user switching to All Users is told to perform an action with no button anywhere. The 'secure' wording gives a false sense of access control.

**Recommendation:** Delete the recommendation paragraph and the comment claims, remove the dead cache pipeline, and describe the filter as "show only readings you recorded". Playbook step 8 (`03_dead_storage_pipeline`).

---

#### [ux-8] Routing and auth UX gaps: no 404 route, return path lost after login, 'Remember me' writes but never reads, 'Request access' implies gating that does not exist

**Severity:** Low | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** react, ux

**Status:** unverified (not individually re-checked). A grep of `src/` for `remembered_email` finds only the two writes at `LoginPage.tsx:38,40`; a grep for `document.title` finds nothing.

**Location:** `src/routes.tsx:17`; `src/pages/LoginPage.tsx:36`; `src/components/ProtectedRoute.tsx:25` (dashboard)

**Description:** Four small gaps in one flow. Routes are defined for `/login`, `/dashboard`, `/map`, `/analytics` and `/` only. The protected-route redirect carries no origin. The remember-me checkbox stores the email but nothing reads it back, and the storage write sits inside the sign-in `try`. The "Request access" link implies an approval process, although any account registered through the app can already sign in (`sec-4` in `05_SECURITY_AUDIT.md`).

**Evidence:**
- `src/routes.tsx:17-52`: `<Routes>` containing `path="/login"`, `"/dashboard"`, `"/map"`, `"/analytics"` and `"/"`; no `path="*"`.
- `src/components/ProtectedRoute.tsx:26`: `return <Navigate to="/login" replace />;`
- `src/pages/LoginPage.tsx:36-42`: `await signInWithEmailAndPassword(auth, email, password);` / `if (rememberMe) {` / `localStorage.setItem('remembered_email', email);` / `} else {` / `localStorage.removeItem('remembered_email');`
- `src/pages/LoginPage.tsx:44-45`: `const errorMessage = err instanceof Error ? err.message : 'Login failed';` / `setError(errorMessage);`
- `src/pages/LoginPage.tsx:23`: `const [email, setEmail] = useState('');` (never prefilled).
- `src/pages/LoginPage.tsx:259`: `href="mailto:admin@noisemapper.lk?subject=Dashboard Access Request"`

**Impact:** A mistyped URL such as `/analytic` renders a blank themed page. A deep link to `/analytics` while signed out always lands on `/dashboard` after login. Ticking 'Remember me' stores the plaintext email for no visible effect. A signed-in user who opens `/login` sees the form again. If `localStorage` throws after a successful sign-in, a login error is shown to a signed-in user.

**Recommendation:** Add a NotFound route, pass `state={{ from: location }}` and honour it after login, prefill the email (guarded) or drop the checkbox, redirect authenticated users away from `/login`, move the storage write out of the sign-in `try`, and confirm or replace the contact address. The sign-out clearing of the remembered email is playbook step 20 (`05_sync_engine_provider`); the rest is in the section 7 follow-up list (`ux-8`).

---

#### [ux-9] DataTable pagination is not clamped: '1/0' and 'Showing -9 to 0 of 0' with enabled Next/Last, stale page after data shrinks

**Severity:** Low | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux, correctness, react

**Status:** unverified (not individually re-checked). The lines below were re-opened and the arithmetic follows from them.

**Location:** `src/components/analytics/DataTable.tsx:347` (dashboard)

**Description:** `totalPages` is 0 for an empty dataset, and the Next and Last buttons compare against it with strict equality. `currentPage` is only reset by the rows-per-page handler.

**Evidence:**
- `src/components/analytics/DataTable.tsx:132-134`: `const totalPages = Math.ceil(data.length / rowsPerPage);` / `const startIndex = (currentPage - 1) * rowsPerPage + 1;` / `const endIndex = Math.min(currentPage * rowsPerPage, data.length);`
- `src/components/analytics/DataTable.tsx:320`: `Showing {startIndex} to {endIndex} of {data.length}`
- `src/components/analytics/DataTable.tsx:345`: `{currentPage}/{totalPages}`
- `src/components/analytics/DataTable.tsx:351`: `disabled={currentPage === totalPages}`
- `src/components/analytics/DataTable.tsx:359`: `onClick={() => setCurrentPage(totalPages)}`
- `src/pages/AnalyticsPage.tsx:153`: `<DataTable data={readings} userMap={userMap} />` (rendered unconditionally).

**Impact:** On a brand-new project, a failed sync or an empty cache, the table shows `Showing 1 to 0 of 0` and `1/0` with Next and Last enabled. Pressing Last sets page 0 and shows `Showing -9 to 0 of 0`. After a data change, `currentPage` can sit beyond `totalPages`.

**Recommendation:** `const totalPages = Math.max(1, ...)`, clamp `currentPage` in an effect, disable Next and Last on `currentPage >= totalPages`, and hide the footer when the table is empty. In the playbook's section 7 follow-up list (`ux-9`).

---

#### [ux-10] Trend chart draws max/min lines with dot={false}, so a single bucket shows only the average point

**Severity:** Low | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). The lines below were re-opened.

**Location:** `src/components/analytics/NoiseTrendChart.tsx:244` (dashboard)

**Description:** The Average line has dots, but the Maximum and Minimum lines are drawn with `dot={false}`. A line needs two points to be visible.

**Evidence:**
- `src/components/analytics/NoiseTrendChart.tsx:244-250`: `<Line` / `type="monotone"` / `dataKey="maxDb"` / `stroke="#F44336"` / `strokeWidth={2}` / `dot={false}` / `name="Maximum"`
- `src/components/analytics/NoiseTrendChart.tsx:252-258`: the same shape for `minDb` with `stroke="#4CAF50"` and `name="Minimum"`.
- `src/components/analytics/NoiseTrendChart.tsx:235`: `<Legend />`

**Impact:** For a new deployment, a single day, or Month granularity with one month of data, there is one bucket. Maximum and Minimum vanish while the legend still lists them, so the chart looks broken.

**Recommendation:** Show dots on max and min when there are fewer than 3 buckets, or render a single-bucket summary. In the playbook's section 7 follow-up list (`ux-10`).

---

#### [ux-11] Print button prints only the current 10-row table page with no warning

**Severity:** Low | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). The lines below were re-opened.

**Location:** `src/pages/AnalyticsPage.tsx:143` (dashboard)

**Description:** The print stylesheet hides everything except `.data-export-section`, and the table renders only the current page of rows.

**Evidence:**
- `src/pages/AnalyticsPage.tsx:143`: `onClick={() => window.print()}`
- `src/components/analytics/DataTable.tsx:128`: `return sorted.slice(startIndex, endIndex);`
- `src/index.css:204-206`: `@media print {` / `/* Hide everything by default */` / `body * {` and `:214` `button,` inside `display: none !important;`.

**Impact:** On a dataset of thousands of readings, Print produces a one-page printout of 10 rows with no pagination controls, no chart and no caveat, which looks like the full report.

**Recommendation:** Print the whole filtered dataset under `@media print`, or relabel the button 'Print this page' and include the 'Showing X of N' text. In the playbook's section 7 follow-up list (`ux-11`).

---

#### [ux-12] 'Real-time' subtitle overstates freshness of cache-backed data refreshed only on page load

**Severity:** Low | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). The lines below were re-opened.

**Location:** `src/pages/DashboardPage.tsx:54` (dashboard)

**Description:** Data flows from IndexedDB, with a delta sync only on mount, so the page does not update while it is open. The same "real-time" claim appears in two code comments.

**Evidence:**
- `src/pages/DashboardPage.tsx:54`: `Real-time noise pollution monitoring for Sri Lanka`
- `src/components/map/NoiseMarkers.tsx:54`: ` * - Real-time Firestore sync`
- `src/components/map/NoiseMarkers.tsx:86`: `const syncResult = await syncManager.syncNewReadings();` (once, inside the mount effect).
- `src/components/map/SyncStatus.tsx:37`: `const interval = setInterval(loadSyncStatus, 60 * 60 * 1000);` (status read only, see `bug-4`).

**Impact:** A viewer who leaves the dashboard open sees counts and charts that never update, contradicting the subtitle.

**Recommendation:** Reword to "Community noise readings for Sri Lanka" and show the last-synced time on the overview. In the playbook's section 7 follow-up list (`ux-12`).

---

#### [ux-13] Markers outside the hard-coded Sri Lanka maxBounds are counted in the badge and heatmap but can never be panned to

**Severity:** Low | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** low | **Reported by:** ux

**Status:** unverified (not individually re-checked). Confidence is low: no out-of-bounds coordinate is known to exist in the data, and the production probe reports aggregates only.

**Location:** `src/components/map/MapContainer.tsx:32` (dashboard)

**Description:** The map is locked to a box around Sri Lanka, with viscosity 1.0. The badge and the heatmap count every reading that has numeric coordinates, in or out of the box.

**Evidence:**
- `src/components/map/MapContainer.tsx:5-8`: `const SRI_LANKA_BOUNDS: LatLngTuple[] = [` / `[5.9, 79.5],  // Southwest corner` / `[9.9, 82.0],  // Northeast corner`
- `src/components/map/MapContainer.tsx:32-33`: `maxBounds={SRI_LANKA_BOUNDS}` / `maxBoundsViscosity={1.0}`
- `src/pages/MapPage.tsx:136`: `{markerCount} markers`

**Impact:** Readings with coordinates outside the box (developer or emulator devices, rounded or zero coordinates from the anonymize preference, travel) raise the badge and heatmap but cannot be reached, so the count reads 'N markers' while fewer are reachable.

**Recommendation:** Count only in-bounds markers, or fit the bounds to the data, and show an 'M readings outside Sri Lanka not shown' note. In the playbook's section 7 follow-up list (`ux-13`).

---

#### [ux-14] Document title and favicon are Vite defaults and never change per route

**Severity:** Low | **Category:** ui-ux | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux, build

**Status:** unverified (not individually re-checked). The lines below were re-opened.

**Location:** `index.html:7` (dashboard)

**Description:** The page title is the repository slug, the icon is the Vite logo, there is no meta description or theme colour, and no route sets `document.title`.

**Evidence:**
- `index.html:5`: `<link rel="icon" type="image/svg+xml" href="/vite.svg" />`
- `index.html:7`: `<title>noise-pollution-mapper-dashboard</title>`
- A grep of `src/` for `document.title` returns no matches.

**Impact:** Browser tabs, history and bookmarks show a repository slug and the Vite logo. SPA route changes never announce a new page title to assistive technology (see also `a11y-1` in `07_ACCESSIBILITY_AUDIT.md`).

**Recommendation:** Set a human title and icon, add a `theme-color` meta, and update `document.title` per page with a small hook. In the playbook's section 7 follow-up list (`ux-14`).
