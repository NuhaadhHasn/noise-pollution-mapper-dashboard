# Bugs and Correctness Audit - Noise Pollution Mapper Web Dashboard

> Generated 2026-10-15 - multi-agent cross-repo audit, read-only. Dimension agents (security, data layer, correctness, React/Vite, UX, performance, build/deploy) read the dashboard repo (`noise-pollution-mapper-dashboard`, HEAD `353bbdd`) and the Flutter app (`noise_pollution_mapper`, master `9b08e68`) as its contract counterpart only. Every Critical/High finding was re-checked by an adversarial verifier; uncertain claims default to refuted. Production facts come from the owner-run read-only probe of 2026-10-16 ~00:20 (`prod_probe.json`, aggregates only, no PII). No file outside `audit/` was modified, `serviceAccountKey.json` was never opened, and no build, install or network call to Firebase was made by the audit.
>
> Status legend: `confirmed` = verifier re-proved it against the code; `partial` = mechanism confirmed, part of the claim corrected; `refuted` = disproved (kept for transparency, excluded from recommendations); `unverified` = not individually re-checked. Severity shown is the post-verification severity. Repo: all findings in this document are `dashboard`, none is cross-repo. Exact BEFORE/AFTER edits live in `08_FIX_IMPLEMENTATION_PLAYBOOK.md`; the step numbers cited below are its master checklist numbers (section 5).

## Executive Summary

Total findings in this area: **13** (0 Critical, 1 High, 8 Medium, 4 Low). One was adversarially verified (`bug-1`, confirmed). The other 12 are `unverified (not individually re-checked)`; they are Medium or Low, so they were not in the verification queue. No finding was refuted. No finding is flagged NEEDS PROD CHECK.

The defects fall into four groups:

1. **The stored timestamp shape is wrong everywhere** (`bug-1`, `bug-8`, `bug-13`). Readings are written to IndexedDB as raw Firestore `Timestamp` instances. The structured clone keeps only `{seconds, nanoseconds}`, so every consumer that calls `toDate()` silently fails. That makes every CSV and JSON export row read `Unknown` and every reading popup read `No timestamp`. The Firestore source data is intact. Production probe: `timestamp` is a Timestamp on all 3,374 docs, so the loss is 100% of export rows.
2. **The map's views disagree with each other** (`bug-2`, `bug-4`, `bug-6`, `bug-9`). The heatmap ignores the marker filters. The marker badge reports the unfiltered total. The Sync button updates IndexedDB but not what is on screen. The date preset forgets itself when the panel closes.
3. **The charts compute wrong or misleading values** (`bug-3`, `bug-7`, `bug-10`, `bug-12`). The week view sorts `W10` before `W2`. The heatmap treats 0 dB as 0.5 and sums dense quiet areas to red. Missing dB counts as 0 in one chart and is ignored in another.
4. **Resilience gaps** (`bug-5`, `bug-11`). Force Full Sync destroys the cache before it fetches. The theme provider throws when storage is blocked.

All fixes are in the playbook except `bug-10`, `bug-11` and `bug-12`, which sit in its section 7 follow-up list. No fix adds a Firestore index.

## Summary Table

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| bug-1 | High | IndexedDB round-trip strips Timestamp.toDate(), so every CSV/JSON export row has timestamp 'Unknown' and every map popup says 'No timestamp' | `src/utils/exportHelpers.ts:61` (dashboard) | confirmed |
| bug-2 | Medium | Heatmap is fed the unfiltered cache and ignores the 'My Readings Only' and date filters applied to markers | `src/components/map/NoiseMarkers.tsx:80` (dashboard) | unverified |
| bug-3 | Medium | Week view of the trend chart sorts unpadded week keys lexically (W10 before W2) and pairs calendar year with ISO week number | `src/components/analytics/NoiseTrendChart.tsx:72` (dashboard) | unverified |
| bug-4 | Medium | Map 'Sync' button and hourly auto-sync update IndexedDB but never refresh markers, count or heatmap, and the sync status text is stale or wrong | `src/components/map/SyncStatus.tsx:36` (dashboard) | unverified |
| bug-5 | Medium | Force Full Sync clears the local cache and first-sync flag before fetching, so a failed fetch leaves the user with no data | `src/utils/syncManager.ts:238` (dashboard) | unverified |
| bug-6 | Medium | DateRangeFilter keeps its selection in local state that resets when the filter panel closes, so it shows 'All time' while the map is still filtered | `src/components/map/DateRangeFilter.tsx:37` (dashboard) | unverified |
| bug-7 | Medium | Heatmap intensity treats 0 dB as 0.5, normalises 30-100 dB unlike the app and marker bands, sums dense quiet areas to red, and has no legend | `src/components/map/HeatmapLayer.tsx:60` (dashboard) | unverified |
| bug-8 | Medium | Map date filter lets client-clock createdAt override the server timestamp and freezes the range end at selection time | `src/components/map/NoiseMarkers.tsx:197` (dashboard) | unverified |
| bug-9 | Medium | Marker-count badge shows the unfiltered total when filters leave zero markers | `src/components/map/NoiseMarkers.tsx:233` (dashboard) | unverified |
| bug-10 | Low | dB statistics count missing dB as 0 and use Math.max(...spread), which throws RangeError at ~100k rows | `src/components/analytics/StatsCards.tsx:14` (dashboard) | unverified |
| bug-11 | Low | ThemeProvider reads localStorage unguarded during first render, white-screening the app when storage is blocked | `src/contexts/ThemeContext.tsx:90` (dashboard) | unverified |
| bug-12 | Low | Trend chart buckets and labels use browser-local time and re-parse non-ISO hour strings | `src/components/analytics/NoiseTrendChart.tsx:82` (dashboard) | unverified |
| bug-13 | Low | Readings with a missing or unparseable timestamp are bucketed to 1 Jan 1970 in the trend chart and table | `src/components/analytics/NoiseTrendChart.tsx:25` (dashboard) | unverified |

## Detailed Findings

### Critical

None. No finding in this area meets the Critical bar (breach, data loss, or a whole feature dead in production). The highest, `bug-1`, loses information only in the browser's view and exports; Firestore holds every value.

### High

#### [bug-1] IndexedDB round-trip strips Timestamp.toDate(), so every CSV/JSON export row has timestamp 'Unknown' and every map popup says 'No timestamp'

**Severity:** High | **Category:** bug | **Repo:** dashboard | **Confidence:** high | **Reported by:** data, security, correctness, ux, react, performance

**Status:** confirmed. The verifier re-proved the mechanism end to end:
- Storage: `syncManager.ts:90-93`, `:119-125`, `:141-147` and `forceFullSync` `:247-250` spread `...doc.data()` (live SDK `Timestamp` instances) into IndexedDB through `db.ts:77-79` `store.put(reading)`.
- The SDK `Timestamp` sets only own data props (`this.seconds = e, this.nanoseconds = t`, `node_modules/@firebase/firestore/dist/common-091f2944.esm.js:1271`, firebase 12.10.0 / @firebase/firestore 4.12.0). `toDate()` is a prototype method, and structured clone drops the prototype, so rows read back as plain `{seconds, nanoseconds}`. There is no `DataCloneError`, because there are no own function props.
- Reachability: every UI consumer reads from IndexedDB, never from an in-memory snapshot. `useSyncedReadings.ts:38/47/72/83` and `NoiseMarkers.tsx:70/90` both call `localDb.getAllReadings()` (`db.ts:52` `store.getAll()`), including on first load. The cache-download path (`cacheDownloader.ts:141`) is dead because `CacheStatus` is imported nowhere.
- Broken consumers: CSV and JSON export gate on `reading.timestamp?.toDate` and emit `Unknown`; the popup gates on `toDate?.()` and shows `No timestamp`.
- The export buttons are reachable by any signed-in user (`AnalyticsPage.tsx:22` -> `:121` `exportToCSV`, `:132` `exportToJSON`, routed at `routes.tsx:39`). `fetchAllUsers` (`userService.ts:16-30`) swallows the users permission-denied, so the page still renders. `NoiseMarkers` is mounted on both `DashboardPage.tsx:141` and `MapPage.tsx:173`.
- Scope: per the production probe, `timestamp` is a Firestore Timestamp on all 3,374 docs, so 100% of export rows and reading popups are affected, and nothing errors.
- High fits: a core feature is wrong for every input, silently. It is not Critical because the Firestore source data is intact.

Verifier corrections: only citation fixes. The trend-chart `toDate` helper is at `NoiseTrendChart.tsx:24` with its `seconds` branch at `:41-44` (a performance-dimension note cited `:128`/`:145`). "Every map popup" should read "every reading popup": the empty-state popup at `NoiseMarkers.tsx:251` shows no timestamp. Two items in the bundled field-contract table are real but separate: the `createdAt` override in the date filter (`bug-8`; `createdAt` exists on only 602 of 3,374 docs, 17.8%) and `confidence || 0` rendering 0% (tracked as `data-2` in the contract audit, `03_CROSS_REPO_CONTRACT_AUDIT.md`).

**Location:** `src/utils/exportHelpers.ts:61` and `:111`; `src/components/map/NoiseMarkers.tsx:362`; root cause `src/types/NoiseReading.ts:24-25`, `src/utils/syncManager.ts:90-93`, `src/utils/db.ts:77-79` (dashboard)

**Description:** Readings are stored raw and read back through IndexedDB, which strips the `Timestamp` prototype. Four hand-written `toDate` handlers exist and only some of them cope with the plain `{seconds, nanoseconds}` shape. The type declaration says `timestamp: Timestamp`, which hides the problem from the compiler. A side effect: the IndexedDB index `store.createIndex('timestamp', 'timestamp', ...)` is built on an object, which is not a valid key, so the index stays empty and `getLatestTimestamp` (`db.ts:100-133`, no callers) would always return 0.

**Evidence:**
- `src/utils/exportHelpers.ts:61-63`: `const timestamp = reading.timestamp?.toDate` / `? format(reading.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss')` / `: 'Unknown';`
- `src/utils/exportHelpers.ts:111-113` (JSON): `timestamp: reading.timestamp?.toDate` / `? format(reading.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss')` / `: 'Unknown',`
- `src/components/map/NoiseMarkers.tsx:362-364`: `{reading.timestamp?.toDate?.()` / `? format(reading.timestamp.toDate(), 'MMM d, yyyy h:mm a')` / `: 'No timestamp'}`
- `src/components/map/NoiseMarkers.tsx:179`: `// Handle Firestore Timestamp object from IndexedDB (stored as { seconds, nanoseconds })`. The code admits the shape.
- `src/utils/syncManager.ts:90-93`: `newReadings = snapshot.docs.map(doc => ({` / `id: doc.id,` / `...doc.data(),` / `})) as NoiseReading[];`
- `src/utils/db.ts:77-79`: `readings.forEach(reading => {` / `store.put(reading);`
- `src/types/NoiseReading.ts:24-25`: `timestamp: Timestamp;` / `createdAt?: Timestamp;`
- Working consumers that handle `seconds`: `src/components/analytics/NoiseTrendChart.tsx:41-43` `// If it's a plain object with seconds (from IndexedDB)` / `if (typeof ts === 'object' && 'seconds' in ts) {`; `src/components/analytics/DataTable.tsx:69-71` (same comment and branch); `NoiseMarkers.tsx:182-183` `if (timestampAny?.seconds) {`.
- Read path: `src/hooks/useSyncedReadings.ts:38` `const cachedReadings = await localDb.getAllReadings();`; `src/components/map/NoiseMarkers.tsx:70` (same call).

**Impact:** The "Research Export" is useless for any time-based analysis. Analytics > Export CSV writes the Timestamp column as `Unknown` on every row, and the JSON export emits `"timestamp": "Unknown"` on every record. Clicking any reading marker on `/map` or `/dashboard` shows `No timestamp`. Nothing errors, so the loss is silent.

**Recommendation:** Normalise at the storage boundary. Map each doc to a plain DTO with `timestamp` and `createdAt` as epoch-millisecond numbers (valid IndexedDB keys, so the `timestamp` index starts working) and type `NoiseReading.timestamp` as `number | null`. Replace the four ad-hoc `toDate` helpers with one shared helper that accepts number, `{seconds}`, `Timestamp` and string. Bump the IndexedDB schema version and force a full re-fetch so old rows are rewritten. Make `confidence` optional, declare `userEmail?` and `deviceInfo?`, and drop the never-written `location` and `'Both'` shapes. Playbook steps 11, 12 and 13 (`04_readings_storage_contract`) carry the exact edits.

---

### Medium

#### [bug-2] Heatmap is fed the unfiltered cache and ignores the 'My Readings Only' and date filters applied to markers

**Severity:** Medium | **Category:** bug | **Repo:** dashboard | **Confidence:** high | **Reported by:** correctness, security, data, ux, react, performance

**Status:** unverified (not individually re-checked). Six dimension agents reported it independently with matching evidence, and the lines below were re-opened for this document.

**Location:** `src/components/map/NoiseMarkers.tsx:80`; `src/pages/MapPage.tsx:182` (dashboard)

**Description:** `NoiseMarkers` hands the parent the raw cache, not the filtered set. The filter runs afterwards and is never reported back. `MapPage` feeds that raw list to the heatmap.

**Evidence:**
- `src/components/map/NoiseMarkers.tsx:80-81`: `if (onDataChange && cachedReadings.length > 0) {` / `onDataChange(cachedReadings);`
- `src/components/map/NoiseMarkers.tsx:97-98`: `if (onDataChange) {` / `onDataChange(updatedReadings);`
- `src/components/map/NoiseMarkers.tsx:117`: `const filteredReadings = readings.filter(reading => {` (the filtered set is never passed up).
- `src/pages/MapPage.tsx:180-182`: `onDataChange={setReadingsData}` ... `<HeatmapLayer readings={readingsData} visible={showHeatmap} />`
- `src/pages/MapPage.tsx:27`: `const [showAllUsers, setShowAllUsers] = useState(false);` and `:209-211` `'Showing only your readings'`.

**Impact:** The default map mode is 'My Readings Only', with an optional date range. Toggling the heatmap shows every user's readings of all time, while the markers and the 'N markers' badge show only the filtered set. The two layers disagree, and the 'only your readings' label is wrong for the heat layer.

**Recommendation:** Compute the filter once (memoised) and feed the same array to markers, badge and heatmap, or call `onDataChange(filteredReadings)` from an effect keyed on the filtered result. Playbook step 31 (`09_map_correctness_perf`).

---

#### [bug-3] Week view of the trend chart sorts unpadded week keys lexically (W10 before W2) and pairs calendar year with ISO week number

**Severity:** Medium | **Category:** bug | **Repo:** dashboard | **Confidence:** high | **Reported by:** correctness, data, ux, react, performance

**Status:** unverified (not individually re-checked). Five dimension agents matched on the same lines.

**Location:** `src/components/analytics/NoiseTrendChart.tsx:72` (dashboard)

**Description:** The bucket key combines the calendar year with an ISO week number that is not zero-padded. Buckets are sorted with `localeCompare`. `getWeekNumber` does ISO-week math (Thursday shift), but the year in the key comes from `getFullYear()`, not the ISO week-year.

**Evidence:**
- `src/components/analytics/NoiseTrendChart.tsx:72-73`: ``const weekNum = getWeekNumber(timestamp);`` / ``key = `${timestamp.getFullYear()}-W${weekNum}`;``
- `src/components/analytics/NoiseTrendChart.tsx:95`: `.sort(([a], [b]) => a.localeCompare(b))`
- `src/components/analytics/NoiseTrendChart.tsx:107-112`: `function getWeekNumber(date: Date): number {` ... `d.setUTCDate(d.getUTCDate() + 4 - dayNum);` (ISO week number).
- `src/components/analytics/NoiseTrendChart.tsx:123`: ``return `Week ${timestamp.split('-W')[1]}`;`` (label carries no year).

**Impact:** Any dataset spanning 10 or more ISO weeks (the data has run since Feb 2026) sorts as `2026-W1, W10, W11 ... W19, W2, W20 ... W9`, so the Average, Max and Min lines zigzag backwards in time. Around New Year, 2027-01-01 falls in ISO week 53 and gets key `2027-W53`, while 2026-12-31 is `2026-W53`. Labels show only `Week 5` with no year, so weeks from different years read as the same week.

**Recommendation:** Key on the ISO week-year with a zero-padded week (`${isoYear}-W${String(w).padStart(2,'0')}`), or sort on a numeric bucket-start time, and put the year in the label. Playbook step 24 (`06_taxonomy_analytics`).

---

#### [bug-4] Map 'Sync' button and hourly auto-sync update IndexedDB but never refresh markers, count or heatmap, and the sync status text is stale or wrong

**Severity:** Medium | **Category:** bug | **Repo:** dashboard | **Confidence:** high | **Reported by:** data, correctness, react, ux

**Status:** unverified (not individually re-checked). Four dimension agents matched; the lines below were re-opened.

**Location:** `src/components/map/SyncStatus.tsx:36`; `src/pages/MapPage.tsx:91` (dashboard)

**Description:** The code comment promises an hourly sync, but the interval only re-reads status metadata. The Sync button does sync, but its completion callback only logs. `NoiseMarkers` loads once in a mount effect and has no refresh trigger. `SyncStatus` also mounts while `NoiseMarkers` is still running its first sync, so its first status read can be stale.

**Evidence:**
- `src/components/map/SyncStatus.tsx:36-37`: `// Auto-sync every hour` / `const interval = setInterval(loadSyncStatus, 60 * 60 * 1000);`
- `src/components/map/SyncStatus.tsx:43`: `const syncStatus = await syncManager.getSyncStatus();` (the only thing `loadSyncStatus` does).
- `src/components/map/SyncStatus.tsx:60`: `const result = await syncManager.syncNewReadings();`
- `src/pages/MapPage.tsx:91-93`: `<SyncStatus onSyncComplete={(result) => {` / `console.log(`Synced ${result.newCount} new readings, total: ${result.totalReadings}`);`
- `src/components/map/NoiseMarkers.tsx:64-114`: one `useEffect` whose deps are only `[onMarkersLoaded, onDataChange]`.
- `src/components/map/SyncStatus.tsx:129`: `• {totalReadings} readings` (the whole cache across all users).

**Impact:** A user clicks Sync and the badge shows `Just now` with the new reading count, but the map still renders the markers it loaded at mount; the heatmap and the marker count stay stale too. Nothing auto-syncs while the page stays open, despite the comment.

**Recommendation:** Move readings and sync state into one shared provider and have the Sync button call its `refresh()`, so every consumer re-reads IndexedDB. Make the interval call a real sync (or delete the comment). Playbook steps 16 and 19 (`05_sync_engine_provider`).

---

#### [bug-5] Force Full Sync clears the local cache and first-sync flag before fetching, so a failed fetch leaves the user with no data

**Severity:** Medium | **Category:** bug | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux, performance

**Status:** unverified (not individually re-checked). Two dimension agents matched; the lines below were re-opened.

**Location:** `src/utils/syncManager.ts:238`; `src/pages/MapPage.tsx:34` (dashboard)

**Description:** `forceFullSync` clears IndexedDB and both metadata keys in separate transactions, then runs the long `getDocs`. The `catch` only rethrows. The UI uses blocking `confirm()` and `alert()` and a full page reload.

**Evidence:**
- `src/utils/syncManager.ts:222-226`: `export async function clearSyncData(): Promise<void> {` / `await localDb.clearAllReadings();` / `await localDb.setSyncMetadata(LAST_SYNC_KEY, null);` / `await localDb.setSyncMetadata(FIRST_SYNC_DONE_KEY, null);`
- `src/utils/syncManager.ts:238`: `await clearSyncData();` runs before `:246` `const snapshot = await getDocs(q);` and `:253` `await localDb.setManyReadings(newReadings);`.
- `src/utils/syncManager.ts:263-265`: `} catch (error) {` / `console.error('[Sync] Force full sync failed:', error);` / `throw error;`
- `src/pages/MapPage.tsx:34`: `if (!confirm('This will clear the cache and fetch ALL readings from Firebase. This may take 2-3 minutes. Continue?')) {`
- `src/pages/MapPage.tsx:42,45`: `window.location.reload(); // Reload to refresh map` / `alert('Failed to fetch all readings. Please try again.');`

**Impact:** If the user is offline, hits permission-denied or quota, or closes the tab during the fetch, the cache and the first-sync flag are already gone. The map and analytics stay empty until a later successful sync, and the alert does not say the previous data was destroyed. `confirm()` and `alert()` block the main thread and bypass the app theme.

**Recommendation:** Fetch into memory first, then clear and bulk-put in one transaction, and set metadata only on success. Replace `confirm`/`alert`/`reload` with the existing Dialog and inline error text. Playbook steps 15 and 19 (`05_sync_engine_provider`).

---

#### [bug-6] DateRangeFilter keeps its selection in local state that resets when the filter panel closes, so it shows 'All time' while the map is still filtered

**Severity:** Medium | **Category:** bug | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux, react

**Status:** unverified (not individually re-checked). Two dimension agents matched; the lines below were re-opened.

**Location:** `src/components/map/DateRangeFilter.tsx:37`; `src/pages/MapPage.tsx:189` (dashboard)

**Description:** The applied range lives in `MapPage`, but the preset the user picked lives in `DateRangeFilter`'s own state. The panel is conditionally rendered, so closing it unmounts the filter and discards the selection. `handleSelect` also computes `end = new Date()` once, at click time.

**Evidence:**
- `src/pages/MapPage.tsx:189`: `{showFilters && (`
- `src/components/map/DateRangeFilter.tsx:37`: `const [selectedOption, setSelectedOption] = useState<DateRangeOption>(DATE_RANGE_OPTIONS[3]); // Default: All time`
- `src/pages/MapPage.tsx:28`: `const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);`
- `src/pages/MapPage.tsx:228-230`: ``{dateRange`` / ``? `From ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}` `` / `: 'Showing all dates'}`

**Impact:** Select 'Last 7 days', close the panel, reopen it: the button reads 'All time' but the helper text beneath reads 'From <date> to <date>' and markers are still filtered. Selecting 'All time' again is the only way to clear. Users cannot trust which filter is active.

**Recommendation:** Make the filter controlled: keep the preset (days) in `MapPage` and compute start and end at filter time. Playbook step 32 (`09_map_correctness_perf`).

---

#### [bug-7] Heatmap intensity treats 0 dB as 0.5, normalises 30-100 dB unlike the app and marker bands, sums dense quiet areas to red, and has no legend

**Severity:** Medium | **Category:** bug | **Repo:** dashboard | **Confidence:** medium | **Reported by:** correctness, ux

**Status:** unverified (not individually re-checked). Confidence is medium because the saturation claim depends on `leaflet.heat` summing point intensities, which was not re-derived here; the mapping lines were re-opened and the arithmetic below follows from them.

**Location:** `src/components/map/HeatmapLayer.tsx:60` (dashboard)

**Description:** The intensity uses a truthiness test, a 30-100 dB scale and gradient stops whose comments do not match the scale. The app's heatmap (`heatmap_point.dart:65-70`) clamps `db / 120.0` with bands at 50 and 70 dB. The 0.35 stop maps to 54.5 dB and the 0.65 stop to 75.5 dB. `leaflet.heat` adds intensities at a location (radius 25, `max: 1.0`).

**Evidence:**
- `src/components/map/HeatmapLayer.tsx:60-62`: `const intensity = reading.decibelLevel` / `? Math.min(1.0, Math.max(0.0, (reading.decibelLevel - 30) / 70))` / `: 0.5;`
- `src/components/map/HeatmapLayer.tsx:76-77`: `0.35: '#FFEB3B',  // Yellow (moderate: 50-60dB)` / `0.65: '#FF9800',  // Orange (loud: 60-70dB)`
- `src/components/map/HeatmapLayer.tsx:84-85`: `if (visible) {` / `heatLayer.addTo(map);` (the layer is built even when hidden).
- `src/components/map/NoiseMarkers.tsx:33-34`: `if (decibelLevel < 50) return '#4CAF50'; // Green - Quiet` / `if (decibelLevel <= 70) return '#FF9800'; // Orange - Moderate`

**Impact:** (1) A reading of 0 dB is falsy and plotted at 0.5, mid-orange. (2) The colour stops land at 54.5 and 75.5 dB, so the comments are wrong: a 70 dB reading renders yellow-orange rather than orange. (3) The same dB gives a different intensity than in the app heatmap. (4) With summed intensities, 20 readings of about 30 dB at one spot (0.0 to 0.07 each) saturate and show red as "very loud", so hot colour means density, not loudness. (5) No legend exists to explain any of it.

**Recommendation:** Test `typeof db === 'number'`. Use the app's `db/120` clamp, or place gradient stops at the 50 and 70 dB boundaries from one shared bands module. Weight by dB but normalise by local count. Add a legend. Playbook step 34 (`09_map_correctness_perf`).

---

#### [bug-8] Map date filter lets client-clock createdAt override the server timestamp and freezes the range end at selection time

**Severity:** Medium | **Category:** bug | **Repo:** dashboard | **Confidence:** high | **Reported by:** correctness

**Status:** unverified (not individually re-checked). Single-dimension finding; the lines below were re-opened. Production note: `createdAt` is present on only 602 of 3,374 docs (17.8%), so the override applies to a minority of rows and the filter behaves two different ways across the dataset.

**Location:** `src/components/map/NoiseMarkers.tsx:197` (dashboard)

**Description:** The filter first derives the reading date from `timestamp` (server clock), then unconditionally overwrites it from `createdAt` (the phone's clock, `firebase_service.dart:174` `DateTime.now()`) whenever that field exists. Separately, the range end is captured once, when a preset is clicked, and the start is "now minus N days" at the current time of day rather than a day boundary.

**Evidence:**
- `src/components/map/NoiseMarkers.tsx:182-183`: `if (timestampAny?.seconds) {` / `readingDate = new Date(timestampAny.seconds * 1000);`
- `src/components/map/NoiseMarkers.tsx:199-202`: `const createdAtAny = read.createdAt as any;` / `if (createdAtAny?.seconds) {` / `readingDate = new Date(createdAtAny.seconds * 1000);`
- `src/components/map/NoiseMarkers.tsx:213-214`: `if (!readingDate || readingDate < filters.dateRange.start ||` / `readingDate > filters.dateRange.end) {`
- `src/components/map/DateRangeFilter.tsx:50-52`: `const endDate = new Date();` / `const startDate = new Date();` / `startDate.setDate(startDate.getDate() - option.days);`
- App side: `heatmap_point.dart:38-44` prefers `timestamp`.

**Impact:** (1) A phone with a wrong clock puts a reading in or out of 'Last 7 days' on a different date than the Trend chart and DataTable, which use `timestamp`. (2) After selecting 'Last 7 days', any reading synced afterwards is later than `end` and is silently hidden until the user re-selects. (3) The oldest day is cut off mid-day.

**Recommendation:** Prefer `timestamp`, fall back to `createdAt` only when it is missing, through the shared `toDate` helper. Store the preset in state and compute start and end at render time using start-of-day and end-of-today boundaries. Playbook steps 11 and 32.

---

#### [bug-9] Marker-count badge shows the unfiltered total when filters leave zero markers

**Severity:** Medium | **Category:** bug | **Repo:** dashboard | **Confidence:** high | **Reported by:** correctness

**Status:** unverified (not individually re-checked). Single-dimension finding; the lines below were re-opened.

**Location:** `src/components/map/NoiseMarkers.tsx:233` (dashboard)

**Description:** After the cache loads, `onMarkersLoaded(cachedReadings.length)` reports the unfiltered total. The effect that reports the filtered count only re-runs when `filteredReadings.length` changes. When that length is 0 both before and after the load, the effect never fires again, so the badge keeps the unfiltered number.

**Evidence:**
- `src/components/map/NoiseMarkers.tsx:76-78`: `if (onMarkersLoaded) {` / `onMarkersLoaded(cachedReadings.length);`
- `src/components/map/NoiseMarkers.tsx:233-237`: `useEffect(() => {` / `onMarkersLoaded(filteredReadings.length);` / `}, [filteredReadings.length, onMarkersLoaded]);`
- `src/pages/MapPage.tsx:27`: `const [showAllUsers, setShowAllUsers] = useState(false);` and `:175` `userId: user?.uid || '',`
- `src/components/map/NoiseMarkers.tsx:253-255`: `No noise readings yet` / `Be the first to contribute data using our mobile app!`

**Impact:** The default view is 'My Readings Only'. A login with no readings of its own (for example an admin account that never recorded) has a filtered length of 0 before and after the load. The badge reads thousands of markers while the map shows a single grey pin saying 'Be the first to contribute'. The same message appears when a date filter simply excludes everything.

**Recommendation:** Drop the unfiltered `onMarkersLoaded` calls and derive the count from the filtered set. Change the empty-state text to 'No readings match the current filters'. Playbook step 31 (`09_map_correctness_perf`), with the empty overlay in step 33.

---

### Low

#### [bug-10] dB statistics count missing dB as 0 and use Math.max(...spread), which throws RangeError at ~100k rows

**Severity:** Low | **Category:** bug | **Repo:** dashboard | **Confidence:** medium | **Reported by:** correctness, performance

**Status:** unverified (not individually re-checked). Today's data is safe: `decibelLevel` is a number on all 3,374 docs and the dataset is far below the spread limit.

**Location:** `src/components/analytics/StatsCards.tsx:14` (dashboard)

**Description:** `StatsCards` filters only `undefined`, uses an arithmetic mean and spreads the whole array into `Math.max`. `CategoryChart` treats a missing dB as 0. The app's analytics screen also uses an arithmetic mean (`analytics_screen.dart:249-251`); only its live dashboard uses an energy mean (`NoiseStats.energyMeanDb`, `noise_stats.dart:10`).

**Evidence:**
- `src/components/analytics/StatsCards.tsx:12`: `const decibelLevels = readings.map((r) => r.decibelLevel).filter((db) => db !== undefined);`
- `src/components/analytics/StatsCards.tsx:14-15,19`: `const avgNoiseLevel = decibelLevels.length > 0` / `? decibelLevels.reduce((sum, db) => sum + db, 0) / decibelLevels.length` ... `? Math.max(...decibelLevels)`
- `src/components/analytics/CategoryChart.tsx:84`: `group.totalDb += reading.decibelLevel || 0;`
- `src/components/analytics/NoiseTrendChart.tsx:99-100`: `maxDb: Math.round(Math.max(...dbLevels) * 10) / 10,` / `minDb: Math.round(Math.min(...dbLevels) * 10) / 10,`

**Impact:** No cross-client mismatch on the analytics numbers today (both are arithmetic means). Both understate the equivalent level of loud-peaked data, and the app's live Leq can differ by several dB from the web 'Avg Noise Level'. A missing dB drags a category average down in one chart while being ignored in another. `Math.max(...array)` throws `RangeError` beyond roughly 120k elements.

**Recommendation:** Pick one definition and label it ('Average (arithmetic)' or Leq). Filter with `Number.isFinite` everywhere and use `reduce` for max and min. In the playbook's section 7 follow-up list (`bug-10`).

---

#### [bug-11] ThemeProvider reads localStorage unguarded during first render, white-screening the app when storage is blocked

**Severity:** Low | **Category:** bug | **Repo:** dashboard | **Confidence:** high | **Reported by:** react

**Status:** unverified (not individually re-checked). The cited lines were re-opened.

**Location:** `src/contexts/ThemeContext.tsx:90` (dashboard)

**Description:** The root provider reads `localStorage` in `useState` initialisers, above every error boundary. Other points on the same file: `isDarkMode` is computed at render from `matchMedia` with no change listener; `hexToCssColor` applies the OKLab matrix row to raw XYZ without the LMS transform or cube root, so the OKLCH it produces is wrong, but it is written to `--primary-color`, which `index.css` never reads; there are 15 `console.log` calls in `src`.

**Evidence:**
- `src/contexts/ThemeContext.tsx:89-91`: `const [theme, setTheme] = useState<Theme>(` / `() => (localStorage.getItem(storageKey) as Theme) || defaultTheme`
- `src/contexts/ThemeContext.tsx:93-95`: `const [primaryColor, setPrimaryColor] = useState<string>(() => {` / ``return localStorage.getItem(`${storageKey}-primaryColor`) || 'Purple';``
- `src/contexts/ThemeContext.tsx:132`: `const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);`
- `src/contexts/ThemeContext.tsx:69`: `const l = 0.210454 * x + 0.793617 * y - 0.004072 * z;`
- `src/contexts/ThemeContext.tsx:125-126`: `document.documentElement.style.setProperty('--primary-color', oklch);` / `document.documentElement.style.setProperty('--primary-color-hex', color);`
- `src/index.css:59,70`: `--primary: var(--primary-color-hex, #6C63FF);` / `--ring: var(--primary-color-hex, #6C63FF);`

**Impact:** In a browser with storage blocked (some private modes, enterprise policy), `localStorage` throws during the first render and the app is a white screen. Theme `system` does not follow OS changes while the tab is open (no UI exposes `system` today). The OKLCH output is wrong but unused, so there is no visible effect now.

**Recommendation:** Wrap storage access in a try/catch helper, delete `hexToCssColor` and `--primary-color`, memoise the context value and remove the console noise. In the playbook's section 7 follow-up list (`bug-11`); the root error boundary in step 29 only softens it.

---

#### [bug-12] Trend chart buckets and labels use browser-local time and re-parse non-ISO hour strings

**Severity:** Low | **Category:** bug | **Repo:** dashboard | **Confidence:** medium | **Reported by:** correctness

**Status:** unverified (not individually re-checked). The Safari behaviour is stated from the JavaScript spec for non-ISO date strings and was not run in a browser.

**Location:** `src/components/analytics/NoiseTrendChart.tsx:82` (dashboard)

**Description:** `date-fns` `format` buckets in the viewer's timezone, and the label formatter re-parses the bucket string with `new Date(...)`. A date-only string such as `'2026-03-05'` parses as UTC midnight, and `'2026-03-05 14:00'` is a non-ISO string that some engines reject.

**Evidence:**
- `src/components/analytics/NoiseTrendChart.tsx:67`: `key = format(timestamp, 'yyyy-MM-dd HH:00');`
- `src/components/analytics/NoiseTrendChart.tsx:82`: `key = format(timestamp, 'yyyy-MM-dd');`
- `src/components/analytics/NoiseTrendChart.tsx:120`: `return format(new Date(timestamp), 'MMM d, h a');`
- `src/components/analytics/NoiseTrendChart.tsx:138`: `return format(new Date(timestamp), 'MMM d');`
- `src/components/analytics/NoiseTrendChart.tsx:141-143`: `} catch (error) {` / `console.error('Error formatting date:', error, timestamp);` / `return timestamp;`

**Impact:** A viewer in UTC-5 sees each day label one day earlier than the bucket, and a reading at 23:30 Colombo time lands on a different day for a viewer in another timezone. Safari-like engines show raw `yyyy-MM-dd HH:00` hour labels. Exports also carry only a local-time string.

**Recommendation:** Bucket explicitly in `Asia/Colombo` (or document browser-local), carry a numeric bucket-start epoch beside the key and format labels from it, and add an ISO-UTC column to the exports. In the playbook's section 7 follow-up list (`bug-12`).

---

#### [bug-13] Readings with a missing or unparseable timestamp are bucketed to 1 Jan 1970 in the trend chart and table

**Severity:** Low | **Category:** bug | **Repo:** dashboard | **Confidence:** medium | **Reported by:** ux

**Status:** unverified (not individually re-checked). Latent today: the production probe shows `timestamp` is a Timestamp on all 3,374 docs, so no row hits the fallback now. It would trigger for a future malformed doc (the rules do not validate field types, see `sec-1` in `05_SECURITY_AUDIT.md`).

**Location:** `src/components/analytics/NoiseTrendChart.tsx:25` (dashboard)

**Description:** The local `toDate` helpers return `new Date(0)` for anything they cannot parse, instead of signalling absence.

**Evidence:**
- `src/components/analytics/NoiseTrendChart.tsx:25`: `if (!timestamp) return new Date(0);`
- `src/components/analytics/NoiseTrendChart.tsx:51-52`: `// Fallback` / `return new Date(0);`
- `src/components/analytics/DataTable.tsx:231`: `{toDate(reading.timestamp).toLocaleString('en-US', {` (renders the 1970 date).

**Impact:** A doc with a null, missing or string timestamp is bucketed to 1970. In day granularity this adds a `1970-01-01` point at the far left that compresses all real data into a sliver, and the table shows `Jan 1, 1970` rows.

**Recommendation:** Return `null` from the shared `toDate` helper, skip nulls in the trend grouping and render an em dash in the table. Covered by playbook step 11 (`04_readings_storage_contract`).
