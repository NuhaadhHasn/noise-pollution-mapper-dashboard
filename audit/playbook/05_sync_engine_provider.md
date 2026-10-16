# Playbook 05 — Sync Engine & ReadingsProvider

Implementation spec for the defect cluster covering the dashboard's IndexedDB sync engine and everything that reads it: the browser-clock delta cursor that misses back-dated offline uploads, the upsert-only cache that never evicts deleted or rewritten readings, the five independent per-component syncs, the full-collection `onSnapshot` on the landing page, the Sync button that never refreshes the map, the false "no data" states, and the cache that outlives sign-out.

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors) and `npx eslint <the files the step changed>` (0 errors, no new warnings); Steps 1, 2 and 7 also run `npx vitest run src/utils/__tests__/syncManager.test.ts`. Run `npm test` and `npm run build` ONCE, at the end of Step 7 (master playbook §1.3).**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`), except blocks labelled "Step N AFTER text", which are copied verbatim from an earlier step of this spec. If a BEFORE block does not match, STOP: check master §4 and the "Cluster 04 contract" below, then apply semantically. Never guess, never revert another cluster's work. Match on exact text, never on line numbers.

Environment facts (verified):
- Dashboard HEAD `353bbdd`. Every file this spec touches is LF in the index and the working tree (`git ls-files --eol`: `i/lf w/lf`). Write new files with LF. Several BEFORE blocks contain lines that end in spaces (for example ` * ` in doc comments and indented blank lines in `NoiseMarkers.tsx`); they are part of the anchor.
- `package.json`: `react`/`react-dom` `^19.2.0` (installed 19.2.4), `react-router-dom` `^7.13.1` (7.13.1), `firebase` `^12.10.0` (12.10.0; `getDocs`, `query`, `where`, `orderBy`, `Timestamp.fromMillis`, `type Query`, `type DocumentData` all come from `firebase/firestore`), `typescript` `~5.9.3` (5.9.3), `vite` `^7.3.1` (7.3.1), `radix-ui` `^1.4.3` (wrapped by `@/components/ui/dialog`), `lucide-react` `^0.575.0` (`RefreshCw`, `CheckCircle`, `Clock`, `AlertCircle` exist).
- `eslint-plugin-react-hooks` `^7.0.1` (installed 7.0.1). Its `recommended` flat config, which `eslint.config.js` uses, includes the React Compiler rules. Three of them shape the code below:
  - `set-state-in-effect`: no setState called synchronously in an effect body. Every state update below runs after an `await`, inside a nested callback (timer, listener, async IIFE), or in an event handler.
  - `purity`: no `Date.now()` during render. `SyncStatus` keeps `now` in state, refreshed by a timer.
  - `refs`: no `ref.current` read during render. Refs are read only in effects and callbacks.
- `eslint-plugin-react-refresh` `^0.4.24` (installed 0.4.26) runs `only-export-components` as an error. Exporting a `createContext` value next to a component is reported, so `ReadingsContext.tsx` uses the same `// eslint-disable-next-line react-refresh/only-export-components` line as `src/contexts/AuthContext.tsx:60`.
- `tsconfig.app.json`: `strict: false`, `verbatimModuleSyntax: true` (type-only imports need `type`), `erasableSyntaxOnly: true` (no enums, no constructor parameter properties, so the test's fake `Timestamp` declares its fields), `noUnusedLocals: false`, `include: ["src"]` (the test file is type-checked by `tsc -b`). Cluster 12 later enables `strict`; the code below narrows nulls explicitly so it survives that.
- `src/main.tsx` renders `<App />` inside `<StrictMode>`, so in dev every effect runs twice. The provider's generation counter and the single-flight lock keep that to one extra IndexedDB read, never a second Firestore query.
- Test runner (cluster 01): `vitest@4.1.11`, `environment: 'node'`, include glob `src/**/*.test.{ts,tsx}`, explicit `import { describe, it, expect, vi } from 'vitest'`, no jsdom, no `@testing-library`. The provider is a React component and therefore has no unit test here; it is verified manually. `vi.hoisted`, `vi.mocked` and `vi.waitFor` exist in vitest 4. Since vitest 3, `vi.restoreAllMocks()` restores only `vi.spyOn` spies and leaves `vi.fn()` mocks alone.
- Production (2026-10-16 probe): `noise_readings` holds 3,374 docs, and every `timestamp` is a Firestore Timestamp. A full fetch costs about 3,374 billed reads. A delta costs one read per returned doc, with a minimum of 1. The billing plan (Spark or Blaze) is unverified.
- Index rule: the only composite index is `noise_readings (userId ASC, timestamp DESC)`. This spec uses only the full fetch `orderBy('timestamp','desc')` and the delta `where('timestamp','>', …)`, both served by the automatic single-field index. No `'>='`, no new index, no `onSnapshot`.
- Read-only browser (master §2.4): this spec adds no Firestore write. `replaceAllReadings` writes IndexedDB only.

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| data-1 | CONFIRMED (High, cross-repo) | The delta keys on `timestamp > lastSync`, where `lastSync` is the browser clock taken after the fetch and the IndexedDB write (`syncManager.ts:135-138`, `:156-157`). Offline uploads carry their capture time (`APP:lib/services/sync_service.dart:319`) and are never fetched; late writes in the post-query window are skipped too. Step 1 moves to a server-time watermark with a 10-minute overlap. Step 2 bounds the back-dating residual to 24 h. |
| priv-1 | PARTIAL (High; root mechanism confirmed) | The cache is upsert-only (`db.ts:93-95`) and never evicts readings deleted, anonymized or rewritten in the app. The only removal sits behind `confirm()` in Fetch All. Step 2 adds a periodic atomic full replace. The one-time purge of caches that already exist is cluster 04.4's `DB_VERSION` bump. Pre-2026-09-09 raw `userEmail` values sit at rest only and are never displayed (verifier correction). |
| perf-1 | CONFIRMED (High; NEEDS PROD CHECK: billing plan) | `/dashboard`, the landing page of every session, attaches an unfiltered `onSnapshot` (`DashboardPage.tsx:33-37`) only for `.size`: about 3,374 billed reads per visit, no error callback, skeletons forever on a listener error. Step 5. |
| perf-2 | UNVERIFIED (Medium) | `StatsCards`, `NoiseTrendChart`, `CategoryChart`, `SoundTypeChart` and `AnalyticsPage` each call `useSyncedReadings()`, and `NoiseMarkers` runs its own sync. A fresh browser starts up to five parallel full syncs, and the first-sync guard is racy (`syncManager.ts:74`, `:131`). The master report notes the SDK may share one watch target, so the multiplied cost may be local CPU and IndexedDB work rather than billed reads. Step 1 (single flight) and Step 3 (one provider). |
| bug-5 | UNVERIFIED (Medium) | `forceFullSync` clears the cache before fetching (`syncManager.ts:238`), so a failed fetch leaves no data. The UI uses `confirm()`, `alert()` and `window.location.reload()` (`MapPage.tsx:33-49`). Step 2 (data) and Step 6 (UI). |
| ux-1 | UNVERIFIED (Medium) | Every consumer destructures only `{ readings }`. Loading and error are dropped, so a first download or a failed sync renders "No data available / Start recording noise" (`AnalyticsPage.tsx:22`, the three charts). Step 3 defines `loading`; Step 4 renders it. |
| bug-4 | UNVERIFIED (Medium) | The Sync button writes IndexedDB, but MapPage's callback only logs (`MapPage.tsx:91-93`). Markers load once (`NoiseMarkers.tsx:64-114`). "Auto-sync every hour" only re-reads status (`SyncStatus.tsx:36-37`). Step 6. |
| priv-4 | UNVERIFIED (Medium) | Sign-out leaves the origin-wide IndexedDB cache (GPS, author labels) and a never-read `remembered_email` in localStorage (`AuthContext.tsx:37-44`, `LoginPage.tsx:37-41`). Step 7. |

Full finding text and verifier evidence: grep the IDs in `audit/00_MASTER_AUDIT_REPORT.md`, `audit/01_BUGS_AND_CORRECTNESS.md` (bug-4, bug-5), `audit/02_UI_UX_AUDIT.md` (ux-1), `audit/03_CROSS_REPO_CONTRACT_AUDIT.md` (data-1), `audit/04_PERFORMANCE_AUDIT.md` (perf-1, perf-2) and `audit/05_SECURITY_AUDIT.md` (priv-1, priv-4).

---

## Pre-reading

Open these files before touching anything. Read them fresh from disk: clusters 01–04 have already changed some of them.

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md` §2 (conventions), §4.4 (sync metadata and constants), §4.5 (provider placement and API), §4.8 (MapPage), §4.9 (pages and login), §4.15 (never push between 04.4 and the end of 05).
2. `audit/playbook/04_readings_storage_contract.md`: the AFTER text of 04.1 (1a `openDB()`, 1b `getSyncMetadata`), 04.2 (2a `src/lib/readings.ts`; 2g and 2r, the imports it adds to `NoiseMarkers.tsx` and `NoiseTrendChart.tsx`), 04.3 (3a the `NoiseReading` type, 3d `normalizeReading`, 3g–3l `syncManager.ts`) and 04.4 (`DB_VERSION` 2).
3. `src/utils/syncManager.ts` (whole file, post-04), `src/utils/db.ts` (whole file, post-04).
4. `src/hooks/useSyncedReadings.ts` (106 lines), `src/App.tsx` (18 lines), `src/contexts/AuthContext.tsx` (67 lines), `src/routes.tsx` (each route has its own `ProtectedRoute`, `:22-45`).
5. `src/components/map/NoiseMarkers.tsx` (`:1-114` load/sync effect; `:232-237` marker-count effect), `src/components/map/SyncStatus.tsx` (whole), `src/pages/MapPage.tsx` (whole).
6. `src/pages/DashboardPage.tsx` (whole), `src/pages/AnalyticsPage.tsx` (whole), `src/components/analytics/StatsCards.tsx`, `NoiseTrendChart.tsx`, `CategoryChart.tsx`, `SoundTypeChart.tsx`, `ChartSkeleton.tsx`, `StatsCardsSkeleton.tsx`, `src/components/EmptyState.tsx`.
7. `src/components/ui/dialog.tsx` and `src/components/map/UserFilterToggle.tsx:78-138` (the existing Dialog usage on the map page, including its `z-[9999]` content class).
8. `src/pages/LoginPage.tsx:20-49` and `:209-225`.
9. `vitest.config.ts` and `src/lib/__tests__/utils.test.ts` from cluster 01 (test layout and style).

### Cluster 04 contract (this spec builds on it; confirm before Step 1)

Checked against `audit/playbook/04_readings_storage_contract.md`:
1. **`src/lib/readings.ts`** (04.2, 04.3) exports `toMillis`, `toDate`, `getReadingDate`, `getCoordinates` and `normalizeReading(id: string, data: Record<string, unknown>): NoiseReading | null`. It is a pure module with no `firebase/firestore` import. `toMillis` reads epoch numbers, ISO strings, Dates, live or structured-cloned `{ seconds, nanoseconds }` Timestamps, and any object with `toMillis()`/`toDate()`.
2. **`src/types/NoiseReading.ts`** (04.3) has `timestamp: number | null`, `createdAt?: number | null` (epoch ms), finite `latitude`/`longitude: number`, and `soundType?: 'Pollution' | 'Ambient'`.
3. **`src/utils/syncManager.ts`** (04.3, steps 3g–3l):
   - it imports `type Query` and `normalizeReading`;
   - it defines `fetchReadings(q: Query): Promise<NoiseReading[]>` directly below `MAX_INITIAL_READINGS`;
   - all four `{ id: doc.id, ...doc.data() }` mapping sites call `fetchReadings(q)`;
   - the sync algorithm, the `cacheDownloaded` branch, `lastSyncTime`/`firstSyncDone` and `updatedCount: 0` are left for this cluster;
   - the header comment (lines 1-9) is unchanged.
4. **`src/utils/db.ts`**:
   - 04.1 keeps the name `openDB()`, which returns one cached connection. Every helper still calls `await openDB()`.
   - `getSyncMetadata` now rethrows `DbBlockedError` and `VersionError` (it returns `null` for other errors). A blocked upgrade therefore surfaces as a sync error, which Step 4 renders through `error.message` (`DB_BLOCKED_MESSAGE` is written for users).
   - 04.2 imports `toMillis` and rewrites `getLatestTimestamp`.
   - 04.4 sets `DB_VERSION = 2`, and its upgrade clears `sync_metadata`.
   - `clearAllReadings` and `getReadingsCount` are byte-identical to HEAD, which is what Step 2 anchors on.
   - **Do NOT bump `DB_VERSION` again** (master §4.4). The stored shape does not change here, and the metadata keys this spec introduces (`maxTimestampMs`, `lastSyncAt`, `lastFullSyncAt`, `cacheOwnerUid`) are all absent after the v2 purge, so the first load is a full fetch.
5. **Other 04 edits in files this spec touches.** None overlaps a BEFORE block below, so these blocks match the post-04 text verbatim.
   - `NoiseMarkers.tsx`: 04.2 inserts an import after line 6 and edits `:116-153`, `:172-217`, `:265-300` and `:361-364`.
   - `NoiseTrendChart.tsx`: 04.2 inserts an import after line 7, deletes the local `toDate` (`:23-55`), and edits `:61-63`.
   - `SoundTypeChart.tsx`: 04.3 rekeys the colour map (`:15-20`).
   - The only whole-file rewrite here is `syncManager.ts` (Step 1), under the carry-over rule above.

---

## Steps

### Step 1 — data-1, perf-2: server-time watermark, overlap window, single-flight sync

**Goal:** The delta cursor becomes the newest server `timestamp` actually received from Firestore, persisted as `maxTimestampMs`, and never the browser clock. Every delta re-queries `OVERLAP_MS` (10 minutes) behind it with `'>'`; IndexedDB `put()` is idempotent, so the overlap only re-writes rows. Concurrent callers share one in-flight sync, so the components that still sync on their own until Step 3 cause one `getDocs`, not five. The dead `cacheDownloaded` branch, the `lastSyncTime`/`firstSyncDone` keys, `MAX_INITIAL_READINGS`/`limit` and the hard-coded `updatedCount: 0` are deleted. The wall clock survives only as `lastSyncAt`, which is for display.

**Files:**
- `src/utils/syncManager.ts` (whole file rewritten)
- `src/components/map/SyncStatus.tsx` (one prop type; Step 6 rewrites the component)
- `src/utils/__tests__/syncManager.test.ts` (new)

**Exact changes**

1a. `src/utils/syncManager.ts`: replace the whole file.

**Cluster 04.3 carry-over.** 04.3 (its steps 3g and 3h) added `import type { Query } from 'firebase/firestore';`, `import { normalizeReading } from '@/lib/readings';` and `fetchReadings(q: Query)` to this file. The AFTER below reproduces 04.3's `fetchReadings` verbatim, doc comment and dropped-doc `console.warn` included, and folds both imports into the import block. Nothing has to be merged by hand.
- If the post-04 file's `fetchReadings` differs from 04.3's AFTER text (a later fix), keep the post-04 version of that one function.
- Nothing else in the post-04 file survives. `syncNewReadings`, `forceFullSync`, `getSyncStatus`, `formatTimeAgo` and `clearSyncData` are all rewritten below, and the `cacheDownloaded` branch, `lastSyncTime`/`firstSyncDone`, `MAX_INITIAL_READINGS`/`limit` and `updatedCount` are deleted.

BEFORE (`src/utils/syncManager.ts`, lines 1-9, verbatim; the WHOLE file is replaced, through its last line). Cluster 04 leaves this header comment untouched (04.3 edits lines 11-14 and inserts below line 24), so it matches the post-04 file. Line 3 ends in a space:
```ts
/**
 * Sync Manager - Handles delta sync between Firebase and IndexedDB
 * 
 * Features:
 * - Track last sync timestamp
 * - Fetch only new/updated readings (delta sync)
 * - Merge cached + new data
 * - Sync status tracking
 */
```

AFTER (the complete file):
```ts
/**
 * Sync Manager - keeps the IndexedDB readings cache in step with Firestore.
 *
 * Cursor (data-1): the delta sync is keyed on a SERVER-time watermark, the
 * newest `timestamp` actually received from Firestore, never on the browser
 * clock. Each delta re-queries OVERLAP_MS behind the watermark, so a write
 * that became visible late is still fetched. IndexedDB put() is an
 * idempotent upsert, so the overlap only re-writes rows.
 *
 * Single flight (perf-2): concurrent callers share one in-flight sync.
 *
 * Query shapes (project index rule): the full fetch
 * `orderBy('timestamp', 'desc')` and the delta `where('timestamp', '>', ...)`.
 * Never a greater-or-equal range, and never a query that needs another
 * composite index.
 */

import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  type Query,
} from 'firebase/firestore';
import { db as firebaseDb } from '@/config/firebase';
import * as localDb from '@/utils/db';
import { normalizeReading } from '@/lib/readings';
import type { NoiseReading } from '@/types/NoiseReading';

/** Each delta re-queries this far behind the watermark (idempotent re-puts). */
export const OVERLAP_MS = 10 * 60_000;

/**
 * A capture `timestamp` more than this far ahead of the browser clock (a phone
 * with a wrong clock) never moves the watermark, so one bad doc cannot stall
 * the delta. The cap can only make the next delta re-read more, never less.
 */
export const MAX_FUTURE_SKEW_MS = 24 * 3_600_000;

/** sync_metadata key: newest server `timestamp` in the cache (epoch ms). */
const WATERMARK_KEY = 'maxTimestampMs';
/** sync_metadata key: wall-clock time of the last successful sync (epoch ms). Display only. */
const LAST_SYNC_AT_KEY = 'lastSyncAt';
/** Every sync_metadata key this module writes; clearSyncData() resets them all. */
const SYNC_METADATA_KEYS = [WATERMARK_KEY, LAST_SYNC_AT_KEY];

export interface SyncResult {
  /** 'full': the whole collection was fetched. 'delta': only `timestamp >` (watermark - OVERLAP_MS). */
  mode: 'full' | 'delta';
  /** Docs the query returned and that were written to IndexedDB (a delta includes overlap re-writes). */
  newCount: number;
  /** Rows in the cache after the sync. */
  totalReadings: number;
  /** Wall-clock time the sync finished. Display only; never a query cursor. */
  lastSync: Date;
}

async function readNumber(key: string): Promise<number | null> {
  const value = await localDb.getSyncMetadata(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The delta cursor: newest server `timestamp` (epoch ms) in the cache, or null before the first fetch. */
export function getWatermark(): Promise<number | null> {
  return readNumber(WATERMARK_KEY);
}

/**
 * The watermark after storing `readings`: their newest `timestamp`, never
 * lower than `previous` (pass null after a full fetch). Timestamps more than
 * MAX_FUTURE_SKEW_MS ahead of `nowMs` are ignored. Pure, for tests.
 */
export function nextWatermark(
  readings: NoiseReading[],
  previous: number | null,
  nowMs: number,
): number | null {
  const ceiling = nowMs + MAX_FUTURE_SKEW_MS;
  let watermark = previous;
  for (const reading of readings) {
    const ts = reading.timestamp;
    if (
      typeof ts === 'number' &&
      Number.isFinite(ts) &&
      ts <= ceiling &&
      (watermark === null || ts > watermark)
    ) {
      watermark = ts;
    }
  }
  return watermark;
}

function fullQuery(): Query {
  return query(collection(firebaseDb, 'noise_readings'), orderBy('timestamp', 'desc'));
}

function deltaQuery(watermarkMs: number): Query {
  // Strictly '>' (project index rule): a single-field range served by the
  // automatic index.
  return query(
    collection(firebaseDb, 'noise_readings'),
    where('timestamp', '>', Timestamp.fromMillis(watermarkMs - OVERLAP_MS)),
  );
}

/**
 * Run a noise_readings query and normalize every doc into the plain
 * NoiseReading DTO that IndexedDB stores (bug-1, sec-1). A doc no app
 * version writes is dropped here, so it is never cached and never reaches a
 * chart, table, popup or export. Only the count of dropped docs is logged,
 * never their content (convention 2.13).
 *
 * The callers' query shapes are unchanged: the full fetch is
 * orderBy('timestamp', 'desc') and the delta is where('timestamp', '>', ...).
 */
export async function fetchReadings(q: Query): Promise<NoiseReading[]> {
  const snapshot = await getDocs(q);
  const readings: NoiseReading[] = [];
  let dropped = 0;
  for (const doc of snapshot.docs) {
    const reading = normalizeReading(doc.id, doc.data());
    if (reading) {
      readings.push(reading);
    } else {
      dropped++;
    }
  }
  if (dropped > 0) {
    console.warn(`[Sync] Skipped ${dropped} malformed reading(s) of ${snapshot.size}`);
  }
  return readings;
}

// The sync every caller currently shares, if one is running.
let inflight: Promise<SyncResult> | null = null;

/** Start `task` as THE shared sync: callers that arrive while it runs get the same promise. */
function share(task: () => Promise<SyncResult>): Promise<SyncResult> {
  const run: Promise<SyncResult> = task().finally(() => {
    if (inflight === run) {
      inflight = null;
    }
  });
  inflight = run;
  return run;
}

async function performSync(forceFull: boolean): Promise<SyncResult> {
  try {
    const watermark = await getWatermark();
    // No watermark yet means nothing has been fetched: a full fetch.
    const deltaFrom = forceFull ? null : watermark;
    const full = deltaFrom === null;

    let readings: NoiseReading[];
    if (deltaFrom === null) {
      readings = await fetchReadings(fullQuery());
      await localDb.setManyReadings(readings);
    } else {
      readings = await fetchReadings(deltaQuery(deltaFrom));
      if (readings.length > 0) {
        await localDb.setManyReadings(readings);
      }
    }

    // Cursors are written only after the rows are stored: if anything above
    // failed, the old watermark stays and the next sync re-reads.
    const finishedAt = Date.now();
    const next = nextWatermark(readings, deltaFrom, finishedAt);
    if (next !== null) {
      await localDb.setSyncMetadata(WATERMARK_KEY, next);
    }
    await localDb.setSyncMetadata(LAST_SYNC_AT_KEY, finishedAt);

    const totalReadings = await localDb.getReadingsCount();
    console.log(`[Sync] ${full ? 'Full' : 'Delta'} sync: ${readings.length} fetched, ${totalReadings} cached`);

    return {
      mode: full ? 'full' : 'delta',
      newCount: readings.length,
      totalReadings,
      lastSync: new Date(finishedAt),
    };
  } catch (error) {
    console.error('[Sync] Sync failed:', error);
    throw error;
  }
}

/**
 * Bring the cache up to date: a full fetch when nothing has been fetched yet,
 * otherwise a delta from the watermark. Every caller that arrives while a sync
 * is running gets that same sync (one getDocs, not one per component).
 */
export function syncNewReadings(): Promise<SyncResult> {
  return inflight ?? share(() => performSync(false));
}

/**
 * "Fetch All Readings": clear the cache, then re-download every reading.
 */
export async function forceFullSync(): Promise<SyncResult> {
  // Let a sync that is already running finish first.
  while (inflight) {
    await inflight.catch(() => undefined);
  }
  await clearSyncData();
  return share(() => performSync(true));
}

/**
 * Get sync status
 */
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

/**
 * Last successful sync (wall clock, display only) and the cached row count.
 * 'pending' when the cache has never synced or the last sync is over an hour old.
 */
export async function getSyncStatus(): Promise<{
  status: SyncStatus;
  lastSync: Date | null;
  totalReadings: number;
}> {
  const lastSyncAt = await readNumber(LAST_SYNC_AT_KEY);
  const totalReadings = await localDb.getReadingsCount();
  const isPending = lastSyncAt === null || Date.now() - lastSyncAt > 60 * 60 * 1000;

  return {
    status: isPending ? 'pending' : 'synced',
    lastSync: lastSyncAt === null ? null : new Date(lastSyncAt),
    totalReadings,
  };
}

/**
 * Format time ago for display. Pass `nowMs` to re-render on a timer.
 */
export function formatTimeAgo(date: Date | null, nowMs = Date.now()): string {
  if (!date) return 'Never';

  const diff = nowMs - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

/**
 * Empty the readings cache and reset every sync cursor.
 */
export async function clearSyncData(): Promise<void> {
  await localDb.clearAllReadings();
  for (const key of SYNC_METADATA_KEYS) {
    await localDb.setSyncMetadata(key, null);
  }
}
```

Placement note: `Query` is `Query<DocumentData>` by default in firebase 12, the same type 04.3 used, so `fullQuery()`/`deltaQuery()` feed `fetchReadings` without a cast. `forceFullSync` calls `clearSyncData`, which is declared further down. That is fine, because function declarations are hoisted. Step 2 removes that call. `syncNewReadings` is no longer `async`, but it still returns a `Promise`, and every caller already `await`s it. The removed exports `getLastSyncTime`, `setLastSyncTime`, `isFirstSyncDone` and `setFirstSyncDone` have no importers: `grep -rn` finds them only in `syncManager.ts`.

1b. `src/components/map/SyncStatus.tsx`: type the callback with the new result (the hard-coded `updatedCount` is gone). Nothing else in the file changes in this step.

BEFORE (`src/components/map/SyncStatus.tsx`, lines 7-14, verbatim):
```tsx
interface SyncStatusProps {
  onSyncComplete?: (result: {
    newCount: number;
    updatedCount: number;
    lastSync: Date;
    totalReadings: number;
  }) => void;
}
```

AFTER:
```tsx
interface SyncStatusProps {
  onSyncComplete?: (result: syncManager.SyncResult) => void;
}
```

`syncManager` is already imported as a namespace at `SyncStatus.tsx:5`. `MapPage.tsx:91-93` reads only `result.newCount` and `result.totalReadings`, which both still exist.

1c. New file `src/utils/__tests__/syncManager.test.ts`, full contents:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocs, orderBy, Timestamp, where } from 'firebase/firestore';
import * as syncManager from '@/utils/syncManager';

// Tests never touch Firebase or a real IndexedDB (master playbook §2.15): the
// Firestore entry points and the app's firebase config are mocked, and
// '@/utils/db' is a Map-backed fake. '@/lib/readings' (cluster 04) is real.

const fakeDb = vi.hoisted(() => ({
  rows: new Map<string, { id: string }>(),
  meta: new Map<string, unknown>(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, auth: {} }));

vi.mock('firebase/firestore', () => {
  // Just enough of Timestamp for the sync code and normalizeReading().
  class Timestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    static fromMillis(ms: number): Timestamp {
      return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1_000_000);
    }
    static fromDate(date: Date): Timestamp {
      return Timestamp.fromMillis(date.getTime());
    }
    toMillis(): number {
      return this.seconds * 1000 + Math.floor(this.nanoseconds / 1_000_000);
    }
    toDate(): Date {
      return new Date(this.toMillis());
    }
  }
  return {
    Timestamp,
    collection: vi.fn((_db: unknown, path: string) => ({ path })),
    query: vi.fn((source: unknown, ...constraints: unknown[]) => ({ source, constraints })),
    where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
    orderBy: vi.fn((field: string, direction?: string) => ({ field, direction })),
    getDocs: vi.fn(),
  };
});

vi.mock('@/utils/db', () => ({
  getAllReadings: vi.fn(async () => Array.from(fakeDb.rows.values())),
  setManyReadings: vi.fn(async (readings: Array<{ id: string }>) => {
    for (const reading of readings) {
      fakeDb.rows.set(reading.id, reading);
    }
  }),
  clearAllReadings: vi.fn(async () => {
    fakeDb.rows.clear();
  }),
  getReadingsCount: vi.fn(async () => fakeDb.rows.size),
  getSyncMetadata: vi.fn(async (key: string) => fakeDb.meta.get(key) ?? null),
  setSyncMetadata: vi.fn(async (key: string, value: unknown) => {
    fakeDb.meta.set(key, value);
  }),
}));

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const MINUTE = 60_000;

interface FakeDoc {
  id: string;
  data: () => Record<string, unknown>;
}

/** A production-shaped noise_readings doc (unclassified, like 79.5% of production). */
function fakeDoc(id: string, timestampMs: number): FakeDoc {
  return {
    id,
    data: () => ({
      userId: 'user-a',
      userEmail: 'us***@example.com',
      decibelLevel: 62.5,
      latitude: 6.9271,
      longitude: 79.8612,
      locationName: 'Colombo',
      timestamp: Timestamp.fromMillis(timestampMs),
      createdAt: Timestamp.fromMillis(timestampMs),
      deviceInfo: 'Mobile Device',
    }),
  };
}

function fakeSnapshot(docs: FakeDoc[]) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (callback: (doc: FakeDoc) => void) => docs.forEach(callback),
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

/** Puts the cache in the "already synced" state a delta starts from. */
function seedSyncedCache(watermarkMs: number): void {
  fakeDb.meta.set('maxTimestampMs', watermarkMs);
}

beforeEach(() => {
  fakeDb.rows.clear();
  fakeDb.meta.clear();
  vi.clearAllMocks();
  vi.mocked(getDocs).mockReset();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncNewReadings: server-time watermark (data-1)', () => {
  it('runs the full orderBy fetch first and takes the watermark from the docs, not the browser clock', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      fakeSnapshot([
        fakeDoc('a', NOW - 30 * MINUTE),
        fakeDoc('b', NOW - 5 * MINUTE),
        fakeDoc('c', NOW - 20 * MINUTE),
      ]) as never,
    );

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('full');
    expect(orderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(where).not.toHaveBeenCalled();
    expect(fakeDb.rows.size).toBe(3);
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - 5 * MINUTE);
    // The wall clock is stored separately, for display only.
    expect(fakeDb.meta.get('lastSyncAt')).toBe(NOW);
    expect(result.lastSync.getTime()).toBe(NOW);
  });

  it("queries timestamp '>' (watermark - OVERLAP_MS) and advances to the newest fetched doc", async () => {
    const watermark = NOW - 60 * MINUTE;
    seedSyncedCache(watermark);
    vi.mocked(getDocs).mockResolvedValueOnce(
      fakeSnapshot([fakeDoc('overlap', watermark - 5 * MINUTE), fakeDoc('new', NOW - 2 * MINUTE)]) as never,
    );

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('delta');
    expect(where).toHaveBeenCalledTimes(1);
    const [field, op, value] = vi.mocked(where).mock.calls[0];
    expect(field).toBe('timestamp');
    expect(op).toBe('>');
    expect((value as Timestamp).toMillis()).toBe(watermark - syncManager.OVERLAP_MS);
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - 2 * MINUTE);
    expect(fakeDb.rows.has('overlap')).toBe(true);
  });

  it('never moves the watermark backwards on overlap-only or empty deltas', async () => {
    const watermark = NOW - 60 * MINUTE;
    seedSyncedCache(watermark);
    vi.mocked(getDocs)
      .mockResolvedValueOnce(fakeSnapshot([fakeDoc('overlap', watermark - 3 * MINUTE)]) as never)
      .mockResolvedValueOnce(fakeSnapshot([]) as never);

    await syncManager.syncNewReadings();
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(watermark);

    await syncManager.syncNewReadings();
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(watermark);
  });

  it('stores a reading with a far-future capture time but does not let it move the watermark', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      fakeSnapshot([
        fakeDoc('bad-clock', NOW + 2 * syncManager.MAX_FUTURE_SKEW_MS),
        fakeDoc('ok', NOW - MINUTE),
      ]) as never,
    );

    await syncManager.syncNewReadings();

    expect(fakeDb.rows.has('bad-clock')).toBe(true);
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - MINUTE);
  });
});

describe('syncNewReadings: single flight (perf-2)', () => {
  it('shares one getDocs between concurrent callers', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    const pending = deferred<ReturnType<typeof fakeSnapshot>>();
    vi.mocked(getDocs).mockReturnValueOnce(pending.promise as never);

    const first = syncManager.syncNewReadings();
    const second = syncManager.syncNewReadings();
    expect(second).toBe(first);

    await vi.waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1));
    pending.resolve(fakeSnapshot([fakeDoc('n', NOW - MINUTE)]));
    await Promise.all([first, second]);
    expect(getDocs).toHaveBeenCalledTimes(1);

    // Once settled, the next call starts a new sync.
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([]) as never);
    await syncManager.syncNewReadings();
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});
```

Placement note: the test lives beside the module, in `src/utils/__tests__/`, the layout cluster 01 fixed. It imports `@/utils/syncManager`, which imports the REAL `@/lib/readings` from cluster 04. The fake `Timestamp` is what `@/lib/readings` sees too, because it is the mocked `firebase/firestore` export. It exposes `seconds`, `nanoseconds`, `toMillis()` and `toDate()`, so `normalizeReading()` works whether it checks `instanceof Timestamp` or duck-types. If 04's `normalizeReading` imports another `firebase/firestore` export, add that export to this mock factory and nothing else.

**Edge cases to preserve**
- Only two query shapes: the full fetch `orderBy('timestamp','desc')` and the delta `where('timestamp','>', …)` with no `orderBy`. Never `'>='`. Both run on the automatic single-field index.
- An overlap-only or empty delta never lowers the watermark. A full fetch recomputes the watermark from scratch (it passes `previous = null`).
- A doc whose capture time is more than 24 h in the future is still stored (it is a real reading), but it never moves the watermark.
- The rows are written before any cursor. A failure anywhere leaves the old watermark, so the next sync re-reads; it never skips.
- After 04.4's purge there is no watermark, so the first sync in every browser is a full fetch (about 3,374 reads, once).
- Concurrent callers get the SAME promise. A call after it settles starts a new sync.
- Step 1 keeps `forceFullSync`'s clear-then-fetch order. Step 2 fixes it (bug-5).
- `newCount` now means "docs fetched and written". A delta includes the overlap re-writes. Callers only compare it with 0 or display it.
- Logging is counts only, never a reading object (master §2.13).

**Acceptance criteria**
- `grep -nE "lastSyncTime|firstSyncDone|cacheDownloaded|updatedCount|MAX_INITIAL_READINGS|limit\(" src/utils/syncManager.ts src/components/map/SyncStatus.tsx` prints nothing, and `grep -rn "updatedCount" src` prints nothing.
- `grep -n "'>='" src/utils/syncManager.ts` prints nothing. The only `where(` CALL is the one in `deltaQuery`, and it uses `'>'` (the header comment also mentions `where(`).
- The five tests in `syncManager.test.ts` pass.
- Manual, on the dev server signed in as the admin. Open `/analytics`, which still has five hook instances in this step:
  - The console shows one `[Sync] … sync:` line per page load instead of five, because the five hook instances share the in-flight sync. In rare cases a component's cache read finishes only after that sync settled, which gives a second line.
  - DevTools → Application → IndexedDB → `noise-pollution-db` → `sync_metadata`: `maxTimestampMs` equals the newest reading's `timestamp`, a moment in the past rather than the time of the sync. `lastSyncAt` is the sync's wall-clock time.

**Verify**
```
npx tsc -b
npx eslint src/utils/syncManager.ts src/components/map/SyncStatus.tsx src/utils/__tests__/syncManager.test.ts
npx vitest run src/utils/__tests__/syncManager.test.ts
```
Manual: the acceptance checks above. Do not delete the IndexedDB database to retest the first sync: every full fetch bills about 3,374 reads.

**Commit title:** `fix(sync): server-time watermark with overlap window and single-flight sync (data-1, perf-2)`

---

### Step 2 — priv-1, bug-5: periodic full replace swapped in one transaction

**Goal:** At most `FULL_REPLACE_INTERVAL_MS` (24 h) after the last full replace, the next sync re-downloads the whole collection and swaps it into IndexedDB in ONE readwrite transaction. This evicts readings deleted in the app (Clear History, single delete), rewritten (account-deletion anonymization, email propagation) or back-dated past the delta's overlap (the data-1 residual). A missing `lastFullSyncAt` means a full replace is due. `forceFullSync` ("Fetch All Readings") fetches FIRST and swaps only on success; it no longer clears before fetching (bug-5, data part). Cursors are written only after a successful swap.

**Files:**
- `src/utils/db.ts` (new `replaceAllReadings`)
- `src/utils/syncManager.ts`
- `src/utils/__tests__/syncManager.test.ts`

**Exact changes**

2a. `src/utils/db.ts`: add `replaceAllReadings` directly after `clearAllReadings`.

BEFORE (`src/utils/db.ts`, lines 186-199, verbatim):
```ts
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error clearing readings:', error);
    throw error;
  }
}

/**
 * Get count of cached readings
 */
```

AFTER:
```ts
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error clearing readings:', error);
    throw error;
  }
}

/**
 * Replace the whole readings cache atomically (priv-1, bug-5): clear() and
 * every put() run in ONE readwrite transaction. Readers see the old rows or
 * the new rows, never an empty or half-written store. If anything fails, the
 * transaction aborts and the old rows stay.
 */
export async function replaceAllReadings(readings: NoiseReading[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Readings replace was aborted'));

    try {
      store.clear();
      readings.forEach(reading => {
        store.put(reading);
      });
    } catch (error) {
      // A synchronous put() failure (for example a DataCloneError) would
      // otherwise let the transaction commit the clear() with only some rows.
      transaction.abort();
      reject(error);
    }
  });
}

/**
 * Get count of cached readings
 */
```

Placement note: `replaceAllReadings` must obtain its connection exactly as the neighbouring functions do after 04.1. If 04.1 renamed `openDB()` or changed how callers get the cached `IDBDatabase`, use the same call `clearAllReadings` uses. `STORE_NAME` and the `NoiseReading` type import already exist in the file.

2b. `src/utils/syncManager.ts`: add the interval constant and the `lastFullSyncAt` key.

BEFORE (`src/utils/syncManager.ts`, Step 1 AFTER text, verbatim):
```ts
export const MAX_FUTURE_SKEW_MS = 24 * 3_600_000;

/** sync_metadata key: newest server `timestamp` in the cache (epoch ms). */
const WATERMARK_KEY = 'maxTimestampMs';
/** sync_metadata key: wall-clock time of the last successful sync (epoch ms). Display only. */
const LAST_SYNC_AT_KEY = 'lastSyncAt';
/** Every sync_metadata key this module writes; clearSyncData() resets them all. */
const SYNC_METADATA_KEYS = [WATERMARK_KEY, LAST_SYNC_AT_KEY];
```

AFTER:
```ts
export const MAX_FUTURE_SKEW_MS = 24 * 3_600_000;

/**
 * Bounded staleness (priv-1, and the data-1 residual): at most this long after
 * the last full replace, the next sync re-downloads the whole collection and
 * swaps it in. That evicts readings deleted or rewritten in the app (Clear
 * History, account deletion, email propagation) and picks up offline uploads
 * back-dated past the delta's overlap.
 */
export const FULL_REPLACE_INTERVAL_MS = 24 * 3_600_000;

/** sync_metadata key: newest server `timestamp` in the cache (epoch ms). */
const WATERMARK_KEY = 'maxTimestampMs';
/** sync_metadata key: wall-clock time of the last successful sync (epoch ms). Display only. */
const LAST_SYNC_AT_KEY = 'lastSyncAt';
/** sync_metadata key: wall-clock time of the last full replace (epoch ms). Missing means one is due. */
const LAST_FULL_SYNC_AT_KEY = 'lastFullSyncAt';
/** Every sync_metadata key this module writes; clearSyncData() resets them all. */
const SYNC_METADATA_KEYS = [WATERMARK_KEY, LAST_SYNC_AT_KEY, LAST_FULL_SYNC_AT_KEY];
```

2c. `src/utils/syncManager.ts`: add the pure due-check after `nextWatermark`.

BEFORE (`src/utils/syncManager.ts`, Step 1 AFTER text, verbatim):
```ts
  return watermark;
}

function fullQuery(): Query {
```

AFTER:
```ts
  return watermark;
}

/**
 * True when the cache needs a full replace: never replaced, replaced
 * FULL_REPLACE_INTERVAL_MS or more ago, or the clock has moved back since.
 * Pure, for tests.
 */
export function isFullReplaceDue(lastFullSyncAt: number | null, nowMs: number): boolean {
  if (lastFullSyncAt === null) {
    return true;
  }
  const elapsed = nowMs - lastFullSyncAt;
  return elapsed < 0 || elapsed >= FULL_REPLACE_INTERVAL_MS;
}

function fullQuery(): Query {
```

2d. `src/utils/syncManager.ts`: decide full or delta, and swap atomically.

BEFORE (`src/utils/syncManager.ts`, Step 1 AFTER text, verbatim):
```ts
async function performSync(forceFull: boolean): Promise<SyncResult> {
  try {
    const watermark = await getWatermark();
    // No watermark yet means nothing has been fetched: a full fetch.
    const deltaFrom = forceFull ? null : watermark;
    const full = deltaFrom === null;

    let readings: NoiseReading[];
    if (deltaFrom === null) {
      readings = await fetchReadings(fullQuery());
      await localDb.setManyReadings(readings);
    } else {
      readings = await fetchReadings(deltaQuery(deltaFrom));
      if (readings.length > 0) {
        await localDb.setManyReadings(readings);
      }
    }

    // Cursors are written only after the rows are stored: if anything above
    // failed, the old watermark stays and the next sync re-reads.
    const finishedAt = Date.now();
    const next = nextWatermark(readings, deltaFrom, finishedAt);
    if (next !== null) {
      await localDb.setSyncMetadata(WATERMARK_KEY, next);
    }
    await localDb.setSyncMetadata(LAST_SYNC_AT_KEY, finishedAt);
```

AFTER:
```ts
async function performSync(forceFull: boolean): Promise<SyncResult> {
  try {
    const watermark = await getWatermark();
    const lastFullSyncAt = await readNumber(LAST_FULL_SYNC_AT_KEY);
    // A full replace when forced, when the last one is FULL_REPLACE_INTERVAL_MS
    // old (or missing), or when nothing has been fetched yet (no watermark).
    const replaceDue = forceFull || isFullReplaceDue(lastFullSyncAt, Date.now());
    const deltaFrom = replaceDue ? null : watermark;
    const full = deltaFrom === null;

    let readings: NoiseReading[];
    if (deltaFrom === null) {
      // Fetch everything FIRST. The cache is swapped only after the download
      // succeeded, in one IndexedDB transaction (bug-5): a failed fetch leaves
      // the old cache and every cursor untouched.
      readings = await fetchReadings(fullQuery());
      await localDb.replaceAllReadings(readings);
    } else {
      readings = await fetchReadings(deltaQuery(deltaFrom));
      if (readings.length > 0) {
        await localDb.setManyReadings(readings);
      }
    }

    // Cursors are written only after the rows are stored: if anything above
    // failed, the old watermark stays and the next sync re-reads.
    const finishedAt = Date.now();
    const next = nextWatermark(readings, deltaFrom, finishedAt);
    if (next !== null) {
      await localDb.setSyncMetadata(WATERMARK_KEY, next);
    }
    await localDb.setSyncMetadata(LAST_SYNC_AT_KEY, finishedAt);
    if (full) {
      await localDb.setSyncMetadata(LAST_FULL_SYNC_AT_KEY, finishedAt);
    }
```

The rest of `performSync` (the row count, the `console.log` and the `return`) is unchanged.

2e. `src/utils/syncManager.ts`: Fetch All no longer clears first.

BEFORE (`src/utils/syncManager.ts`, Step 1 AFTER text, verbatim):
```ts
/**
 * "Fetch All Readings": clear the cache, then re-download every reading.
 */
export async function forceFullSync(): Promise<SyncResult> {
  // Let a sync that is already running finish first.
  while (inflight) {
    await inflight.catch(() => undefined);
  }
  await clearSyncData();
  return share(() => performSync(true));
}
```

AFTER:
```ts
/**
 * "Fetch All Readings": re-download every reading, then swap the cache in one
 * transaction. Nothing is cleared before the download has succeeded (bug-5).
 */
export async function forceFullSync(): Promise<SyncResult> {
  // Let a sync that is already running finish first.
  while (inflight) {
    await inflight.catch(() => undefined);
  }
  return share(() => performSync(true));
}
```

2f. `src/utils/__tests__/syncManager.test.ts`: import the mocked `localDb`.

BEFORE (`src/utils/__tests__/syncManager.test.ts`, Step 1 AFTER text, verbatim):
```ts
import { getDocs, orderBy, Timestamp, where } from 'firebase/firestore';
import * as syncManager from '@/utils/syncManager';
```

AFTER:
```ts
import { getDocs, orderBy, Timestamp, where } from 'firebase/firestore';
import * as localDb from '@/utils/db';
import * as syncManager from '@/utils/syncManager';
```

2g. Same file: give the fake a `replaceAllReadings`.

BEFORE (`src/utils/__tests__/syncManager.test.ts`, Step 1 AFTER text, verbatim):
```ts
  clearAllReadings: vi.fn(async () => {
    fakeDb.rows.clear();
  }),
```

AFTER:
```ts
  replaceAllReadings: vi.fn(async (readings: Array<{ id: string }>) => {
    fakeDb.rows.clear();
    for (const reading of readings) {
      fakeDb.rows.set(reading.id, reading);
    }
  }),
  clearAllReadings: vi.fn(async () => {
    fakeDb.rows.clear();
  }),
```

2h. Same file: a "synced" cache now also has a recent full replace, so the Step 1 delta tests stay deltas.

BEFORE (`src/utils/__tests__/syncManager.test.ts`, Step 1 AFTER text, verbatim):
```ts
/** Puts the cache in the "already synced" state a delta starts from. */
function seedSyncedCache(watermarkMs: number): void {
  fakeDb.meta.set('maxTimestampMs', watermarkMs);
}
```

AFTER:
```ts
/** Puts the cache in the "already synced" state a delta starts from. */
function seedSyncedCache(watermarkMs: number): void {
  fakeDb.meta.set('maxTimestampMs', watermarkMs);
  // A recent full replace, so the next sync is a delta (step 2).
  fakeDb.meta.set('lastFullSyncAt', NOW - 60 * MINUTE);
}
```

2i. Same file: append the full-replace tests at the end of the file.

BEFORE (`src/utils/__tests__/syncManager.test.ts`, Step 1 AFTER text, verbatim; the last lines of the file):
```ts
    // Once settled, the next call starts a new sync.
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([]) as never);
    await syncManager.syncNewReadings();
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});
```

AFTER:
```ts
    // Once settled, the next call starts a new sync.
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([]) as never);
    await syncManager.syncNewReadings();
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});

describe('periodic full replace (priv-1, bug-5)', () => {
  it('isFullReplaceDue: missing, stale or future-dated lastFullSyncAt means due', () => {
    const interval = syncManager.FULL_REPLACE_INTERVAL_MS;
    expect(syncManager.isFullReplaceDue(null, NOW)).toBe(true);
    expect(syncManager.isFullReplaceDue(NOW - 60 * MINUTE, NOW)).toBe(false);
    expect(syncManager.isFullReplaceDue(NOW - interval, NOW)).toBe(true);
    expect(syncManager.isFullReplaceDue(NOW + 60 * MINUTE, NOW)).toBe(true);
  });

  it('replaces the whole cache when a full replace is due, evicting rows deleted in the app', async () => {
    fakeDb.meta.set('maxTimestampMs', NOW - 60 * MINUTE);
    fakeDb.meta.set('lastFullSyncAt', NOW - syncManager.FULL_REPLACE_INTERVAL_MS - MINUTE);
    fakeDb.rows.set('deleted-in-app', { id: 'deleted-in-app' });
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([fakeDoc('kept', NOW - 90 * MINUTE)]) as never);

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('full');
    expect(where).not.toHaveBeenCalled();
    expect(localDb.replaceAllReadings).toHaveBeenCalledTimes(1);
    expect(Array.from(fakeDb.rows.keys())).toEqual(['kept']);
    expect(fakeDb.meta.get('lastFullSyncAt')).toBe(NOW);
    // A full replace recomputes the watermark from the docs actually present.
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - 90 * MINUTE);
  });

  it('runs a delta, not a replace, while the last full replace is recent', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([]) as never);

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('delta');
    expect(localDb.replaceAllReadings).not.toHaveBeenCalled();
  });

  it('forceFullSync keeps the cache and every cursor when the fetch fails', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    fakeDb.rows.set('cached', { id: 'cached' });
    const metaBefore = new Map(fakeDb.meta);
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('unavailable'));

    await expect(syncManager.forceFullSync()).rejects.toThrow('unavailable');

    expect(Array.from(fakeDb.rows.keys())).toEqual(['cached']);
    expect(fakeDb.meta).toEqual(metaBefore);
    expect(localDb.clearAllReadings).not.toHaveBeenCalled();
    expect(localDb.replaceAllReadings).not.toHaveBeenCalled();
  });

  it('forceFullSync swaps the cache in one replace after a successful fetch', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    fakeDb.rows.set('stale', { id: 'stale' });
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([fakeDoc('fresh', NOW - MINUTE)]) as never);

    const result = await syncManager.forceFullSync();

    expect(result.mode).toBe('full');
    expect(localDb.replaceAllReadings).toHaveBeenCalledTimes(1);
    expect(localDb.clearAllReadings).not.toHaveBeenCalled();
    expect(Array.from(fakeDb.rows.keys())).toEqual(['fresh']);
  });
});
```

**Edge cases to preserve**
- The full path never calls `clearAllReadings` or `clearSyncData`. The swap is `replaceAllReadings`, which is ONE transaction. A synchronous `put()` failure aborts it, so the old rows stay.
- `lastFullSyncAt` is written only after a successful swap. A failed fetch or swap leaves it as it was, so the full replace is retried on the next sync.
- A `lastFullSyncAt` in the future (the wall clock moved back) counts as due, which costs one extra full replace, never an indefinitely stale cache.
- No watermark always means a full fetch, whatever `lastFullSyncAt` says.
- A full replace recomputes the watermark from the fetched docs (`previous = null`), so it may go DOWN when the newest readings were deleted. Going down only re-reads more.
- Cost: one full replace per browser per 24 h, about 3,374 reads today, growing with the collection. The master owns the decision to tune `FULL_REPLACE_INTERVAL_MS`; do not change it here.
- `src/utils/db.ts`'s other functions, `DB_VERSION` and the object-store schema are untouched.

**Acceptance criteria**
- Nothing in the sync path clears: `grep -n "await clearSyncData\|clearAllReadings" src/utils/syncManager.ts` prints only the `localDb.clearAllReadings()` line inside `clearSyncData`.
- The ten tests in `syncManager.test.ts` pass.
- Manual (dev server, admin; this costs one full fetch). DevTools → IndexedDB → `sync_metadata`: delete the `lastFullSyncAt` row, then reload.
  - The console shows `[Sync] Full sync: … fetched`.
  - `lastFullSyncAt` is back, with the current time.
  - The readings count equals the collection size.
- Manual (no Firestore cost). DevTools → Network → Offline, then MapPage → Filters → Fetch All Readings → confirm. The fetch fails (MapPage still shows its old `alert()` until Step 6), and the `noise_readings` store still holds every row afterwards.

**Verify**
```
npx tsc -b
npx eslint src/utils/db.ts src/utils/syncManager.ts src/utils/__tests__/syncManager.test.ts
npx vitest run src/utils/__tests__/syncManager.test.ts
```

**Commit title:** `fix(sync): periodic full replace swapped in one transaction evicts deleted and rewritten readings (priv-1, bug-5)`

---

### Step 3 — perf-2: one ReadingsProvider loads and syncs once for every consumer

**Goal:** A single `ReadingsProvider` (master §4.5) reads IndexedDB once and runs one sync per session for every page, chart and map layer. It exposes `{ readings, loading, syncing, error, lastSync, synced, refresh, forceFullSync }`. `useSyncedReadings()` keeps its name and path and becomes a context read, so `StatsCards`, the three charts and `AnalyticsPage` do not change. `NoiseMarkers` drops its own load/sync effect and reads the provider, keeping its `filters` / `onMarkersLoaded` / `onDataChange` props until 09.1.

**Files:**
- `src/contexts/ReadingsContext.tsx` (new)
- `src/hooks/useSyncedReadings.ts` (whole file rewritten)
- `src/App.tsx`
- `src/components/map/NoiseMarkers.tsx`

**Exact changes**

3a. New file `src/contexts/ReadingsContext.tsx`, full contents:
```tsx
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as localDb from '@/utils/db';
import * as syncManager from '@/utils/syncManager';
import type { NoiseReading } from '@/types/NoiseReading';

/**
 * ReadingsProvider - the one owner of the IndexedDB readings cache.
 *
 * Mounted ONCE in App.tsx (inside AuthProvider, around BrowserRouter), so the
 * cache is read once and synced once per session for every page, chart and
 * map layer, instead of once per component (perf-2). It is deliberately not
 * mounted per route: each route has its own ProtectedRoute element, which
 * would remount it on every navigation. Consumers call useSyncedReadings().
 */

export interface ReadingsContextValue {
  /** Every cached reading (all users). Re-read from IndexedDB after each sync. */
  readings: NoiseReading[];
  /**
   * True until there is something true to show: the first IndexedDB read
   * found rows, or (empty cache = not downloaded yet) the first sync settled.
   */
  loading: boolean;
  /** True while a Firestore sync is running. */
  syncing: boolean;
  /** The last failed cache read or sync; cleared when the next sync starts. */
  error: Error | null;
  /** Wall-clock time of the last successful sync. Display only. */
  lastSync: Date | null;
  /** True once a sync has succeeded in this session. */
  synced: boolean;
  /** Delta sync now; shares a sync already running. Never rejects: failures land in `error`. */
  refresh: () => Promise<void>;
  /** Re-download every reading and swap the cache in one step. Rejects on failure; the old cache stays. */
  forceFullSync: () => Promise<{ count: number }>;
}

interface SessionState {
  /** The account this state belongs to. State of any other account is never exposed. */
  uid: string | null;
  readings: NoiseReading[];
  loaded: boolean;
  syncing: boolean;
  error: Error | null;
  lastSync: Date | null;
  synced: boolean;
}

type SessionChanges =
  | Partial<SessionState>
  | ((previous: SessionState) => Partial<SessionState>);

const NO_READINGS: NoiseReading[] = [];

function emptySession(uid: string | null): SessionState {
  return {
    uid,
    readings: NO_READINGS,
    loaded: false,
    syncing: false,
    error: null,
    lastSync: null,
    synced: false,
  };
}

function toError(err: unknown, fallback: string): Error {
  return err instanceof Error ? err : new Error(fallback);
}

// eslint-disable-next-line react-refresh/only-export-components
export const ReadingsContext = createContext<ReadingsContextValue | null>(null);

interface ReadingsProviderProps {
  children: ReactNode;
}

export function ReadingsProvider({ children }: ReadingsProviderProps) {
  const { user } = useAuth();
  // The single gate for downloading readings. Cluster 08.1 (D1-A) changes
  // this one expression to `!!user && role === 'admin'`.
  const enabled = !!user;
  const uid = enabled && user ? user.uid : null;

  const [session, setSession] = useState<SessionState>(() => emptySession(null));
  // Bumped when the account changes or the provider unmounts: async work
  // started under an older generation drops its result.
  const generationRef = useRef(0);
  // The account the current generation loads for (read by refresh()).
  const uidRef = useRef<string | null>(null);

  const update = useCallback(
    (generation: number, forUid: string, changes: SessionChanges) => {
      if (generation !== generationRef.current) {
        return;
      }
      setSession((previous) => {
        const base = previous.uid === forUid ? previous : emptySession(forUid);
        return { ...base, ...(typeof changes === 'function' ? changes(base) : changes) };
      });
    },
    [],
  );

  const runSync = useCallback(
    async (full: boolean): Promise<syncManager.SyncResult> => {
      const forUid = uidRef.current;
      if (forUid === null) {
        throw new Error('Sign in to sync readings');
      }
      const generation = generationRef.current;
      update(generation, forUid, { syncing: true, error: null });
      try {
        const result = full
          ? await syncManager.forceFullSync()
          : await syncManager.syncNewReadings();
        // Always re-read: another tab may have synced rows into the shared cache.
        const readings = await localDb.getAllReadings();
        update(generation, forUid, {
          readings,
          loaded: true,
          syncing: false,
          synced: true,
          lastSync: result.lastSync,
        });
        return result;
      } catch (err) {
        update(generation, forUid, {
          loaded: true,
          syncing: false,
          error: toError(err, 'Failed to sync readings'),
        });
        throw err;
      }
    },
    [update],
  );

  const refresh = useCallback(async () => {
    try {
      await runSync(false);
    } catch {
      // Already in `error`; the UI renders it.
    }
  }, [runSync]);

  const forceFullSync = useCallback(async () => {
    const result = await runSync(true);
    return { count: result.totalReadings };
  }, [runSync]);

  // Whenever an account starts: read the cache, then run one background sync.
  useEffect(() => {
    uidRef.current = uid;
    if (uid === null) {
      return;
    }
    const generation = generationRef.current;
    void (async () => {
      try {
        // 1. The cache: instant, 0 Firestore reads.
        const [cached, status] = await Promise.all([
          localDb.getAllReadings(),
          syncManager.getSyncStatus(),
        ]);
        update(generation, uid, (previous) =>
          previous.synced
            ? {} // a sync already delivered fresher rows
            : {
                readings: cached,
                // An empty cache means "not downloaded yet", not "no data":
                // stay loading until the first sync settles.
                loaded: previous.loaded || cached.length > 0,
                lastSync: status.lastSync,
              },
        );
      } catch (err) {
        update(generation, uid, {
          loaded: true,
          error: toError(err, 'Failed to read the readings cache'),
        });
        return;
      }
      if (generation !== generationRef.current) {
        return;
      }
      // 2. One background sync for the whole app.
      try {
        await runSync(false);
      } catch {
        // Already in `error`.
      }
    })();
    return () => {
      generationRef.current += 1;
    };
  }, [uid, update, runSync]);

  const current = session.uid === uid ? session : null;
  const value = useMemo<ReadingsContextValue>(
    () => ({
      readings: current ? current.readings : NO_READINGS,
      loading: uid !== null && !(current && current.loaded),
      syncing: current ? current.syncing : false,
      error: current ? current.error : null,
      lastSync: current ? current.lastSync : null,
      synced: current ? current.synced : false,
      refresh,
      forceFullSync,
    }),
    [current, uid, refresh, forceFullSync],
  );

  return <ReadingsContext.Provider value={value}>{children}</ReadingsContext.Provider>;
}
```

Placement notes:
- **State per account.** `session` carries the uid it belongs to, and the context value exposes it only while that uid is the current one. A change of account therefore shows an empty, loading state at once, with no setState inside an effect (`react-hooks/set-state-in-effect`). Step 7 adds the cache purge on top.
- **Generation counter.** The load effect's cleanup bumps the generation, on an account change, on unmount, and on React StrictMode's dev double-invoke. A result that arrives late for an old generation is dropped by `update()`. Under StrictMode the second effect run shares the first run's in-flight `getDocs` through the Step 1 lock.
- **`loading`.** It is true until the first IndexedDB read finds rows. When the cache is empty, which is every browser's first visit, it stays true until the first sync settles, because an empty cache means "not downloaded yet", not "no data" (ux-1). With a warm cache, `loading` turns false right after the local read and never waits for the network (perf-1).
- **`runSync` always re-reads IndexedDB after a successful sync.** A delta that returned nothing may still follow rows another tab synced into the shared cache.

3b. `src/hooks/useSyncedReadings.ts`: replace the whole file.

BEFORE (`src/hooks/useSyncedReadings.ts`, lines 1-29, verbatim; the WHOLE file is replaced, through line 106):
```ts
import { useEffect, useState } from 'react';
import * as localDb from '@/utils/db';
import * as syncManager from '@/utils/syncManager';
import type { NoiseReading } from '@/types/NoiseReading';

interface UseSyncedReadingsResult {
  readings: NoiseReading[];
  loading: boolean;
  synced: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * useSyncedReadings - Custom hook for loading noise readings with IndexedDB caching
 *
 * Features:
 * - Loads from IndexedDB immediately (0 Firebase reads)
 * - Background sync for new readings (delta sync)
 * - Automatic refresh on mount
 * - Manual refresh function
 * - Loading and error states
 *
 * Usage:
 * ```typescript
 * const { readings, loading, synced, error, refresh } = useSyncedReadings();
 * ```
 */
export function useSyncedReadings(): UseSyncedReadingsResult {
```

AFTER (the complete file):
```ts
import { useContext } from 'react';
import { ReadingsContext, type ReadingsContextValue } from '@/contexts/ReadingsContext';

/**
 * useSyncedReadings - the shared, IndexedDB-cached noise readings.
 *
 * Every consumer reads the ONE ReadingsProvider (src/contexts/ReadingsContext.tsx),
 * which loads IndexedDB once and runs a single Firestore sync for the whole
 * app (perf-2). The name and import path are unchanged, so call sites stay
 * the same.
 *
 * Usage:
 * ```typescript
 * const { readings, loading, syncing, error, lastSync, refresh } = useSyncedReadings();
 * ```
 */
export function useSyncedReadings(): ReadingsContextValue {
  const context = useContext(ReadingsContext);
  if (context === null) {
    throw new Error('useSyncedReadings must be used within a ReadingsProvider');
  }
  return context;
}

export default useSyncedReadings;
```

3c. `src/App.tsx`: mount the provider once, inside `AuthProvider`, around `BrowserRouter`.

BEFORE (`src/App.tsx`, lines 1-16, verbatim):
```tsx
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="noise-mapper-theme">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

AFTER:
```tsx
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ReadingsProvider } from './contexts/ReadingsContext';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="noise-mapper-theme">
      <AuthProvider>
        {/* One readings cache for every route (master §4.5); idle until sign-in. */}
        <ReadingsProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ReadingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

`export default App;` (lines 17-18) is unchanged.

3d. `src/components/map/NoiseMarkers.tsx`: drop `useState`.

BEFORE (`src/components/map/NoiseMarkers.tsx`, line 4, verbatim):
```tsx
import { useEffect, useState } from 'react';
```

AFTER:
```tsx
import { useEffect } from 'react';
```

3e. Same file: the direct cache and sync imports become the hook.

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 7-8, verbatim):
```tsx
import * as localDb from '@/utils/db';
import * as syncManager from '@/utils/syncManager';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

3f. Same file: replace the component's own load/sync effect with the provider.

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 59-114, verbatim; several blank lines inside end in spaces):
```tsx
export function NoiseMarkers({ filters, onMarkersLoaded, onDataChange }: NoiseMarkersProps) {
  const [readings, setReadings] = useState<NoiseReading[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const map = useMap();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        // Step 1: Load from IndexedDB cache (instant, 0 Firebase reads)
        const cachedReadings = await localDb.getAllReadings();
        
        if (isMounted) {
          setReadings(cachedReadings);
          setIsLoading(false);
          
          if (onMarkersLoaded) {
            onMarkersLoaded(cachedReadings.length);
          }
          
          if (onDataChange && cachedReadings.length > 0) {
            onDataChange(cachedReadings);
          }
        }

        // Step 2: Background sync - fetch only NEW readings since last sync
        const syncResult = await syncManager.syncNewReadings();
        
        if (isMounted && syncResult.newCount > 0) {
          // Reload all readings from IndexedDB (includes new ones)
          const updatedReadings = await localDb.getAllReadings();
          setReadings(updatedReadings);
          
          if (onMarkersLoaded) {
            onMarkersLoaded(updatedReadings.length);
          }
          
          if (onDataChange) {
            onDataChange(updatedReadings);
          }
        }
      } catch (error) {
        console.error('Error loading readings:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [onMarkersLoaded, onDataChange]);
```

AFTER:
```tsx
export function NoiseMarkers({ filters, onMarkersLoaded, onDataChange }: NoiseMarkersProps) {
  // One shared cache and one sync for the whole app (perf-2): the
  // ReadingsProvider owns loading and syncing. Cluster 09.1 replaces this read
  // with an already-filtered `readings` prop.
  const { readings, loading: isLoading } = useSyncedReadings();
  const map = useMap();

  // Hand the full cached set to the parent (MapPage's heatmap) whenever the
  // provider's readings change, including after a Sync. 09.1 deletes this.
  useEffect(() => {
    if (onDataChange) {
      onDataChange(readings);
    }
  }, [readings, onDataChange]);
```

Placement note: everything from `// Apply filters and validate data` (line 116) to the end of the file is unchanged. That includes the existing marker-count effect at `:232-237`, which still reports `filteredReadings.length` through `onMarkersLoaded`, now on every provider update (bug-4 groundwork). `NoiseReading` is still imported, because the props type uses it. `isLoading` keeps its name, so `if (isLoading) { return null; }` (`:239-242`) is unchanged.

**Edge cases to preserve**
- `useSyncedReadings` keeps its name, its path and its default export. `StatsCards.tsx:8`, `NoiseTrendChart.tsx:21`, `CategoryChart.tsx:67`, `SoundTypeChart.tsx:24` and `AnalyticsPage.tsx:22` compile unchanged.
- The hook throws outside the provider, the same way `useAuth` does. Every route renders inside `App`'s provider.
- `enabled = !!user` stays ONE expression that cluster 08.1 can swap for the role gate. While it is false, the provider is idle: no IndexedDB read and no Firestore query.
- The provider is mounted once, in `App.tsx`. It is never inside `ProtectedRoute` or a page, so navigating between `/dashboard`, `/map` and `/analytics` neither re-reads nor re-syncs.
- `NoiseMarkers` keeps every prop. Its filter, validation, empty pin and popup code are untouched (04/06/09 own those regions). `onDataChange` now also receives `[]`, which only empties the heatmap.
- Until Step 6, `SyncStatus` still calls `syncManager.syncNewReadings()` directly, sharing the in-flight lock, and MapPage's Fetch All still reloads the page. Both are routed through the provider in Step 6.

**Acceptance criteria**
- `grep -rnE "syncManager\.(syncNewReadings|forceFullSync)|localDb\.getAllReadings" src --include=*.ts --include=*.tsx | grep -v __tests__` lists only `src/contexts/ReadingsContext.tsx`, `src/components/map/SyncStatus.tsx` and `src/pages/MapPage.tsx`. The last two go in Step 6.
- Manual (dev server, admin, warm cache):
  - Exactly one `[Sync]` console line on the first page load.
  - Navigating `/dashboard` → `/map` → `/analytics` → `/dashboard` prints no further `[Sync]` line.
  - The `/analytics` charts appear without a skeleton flash. `/dashboard` still waits for its own `onSnapshot` until Step 5.

**Verify**
```
npx tsc -b
npx eslint src/contexts/ReadingsContext.tsx src/hooks/useSyncedReadings.ts src/App.tsx src/components/map/NoiseMarkers.tsx
```

**Commit title:** `refactor(readings): one ReadingsProvider loads and syncs once for every consumer (perf-2)`

---

### Step 4 — ux-1: loading and error states instead of a false "no data"

**Goal:** `AnalyticsPage` shows skeletons while the readings load and an error card with Retry (`refresh`) when a sync failed. `StatsCards`, `NoiseTrendChart`, `CategoryChart` and `SoundTypeChart` render a skeleton while `loading`, and show "No data available" only when loading is false, there is no error and there are no readings. Otherwise they say the readings could not be loaded. The empty copy no longer tells researchers to "start recording noise".

**Files:**
- `src/pages/AnalyticsPage.tsx`
- `src/components/analytics/StatsCards.tsx`
- `src/components/analytics/NoiseTrendChart.tsx`
- `src/components/analytics/CategoryChart.tsx`
- `src/components/analytics/SoundTypeChart.tsx`

**Exact changes**

4a. `src/pages/AnalyticsPage.tsx`: add the Retry icon.

BEFORE (`src/pages/AnalyticsPage.tsx`, line 3, verbatim):
```tsx
import { MapPin, ExternalLink, Download, FileJson, Printer } from 'lucide-react';
```

AFTER:
```tsx
import { MapPin, ExternalLink, Download, FileJson, Printer, RefreshCw } from 'lucide-react';
```

4b. Same file: import the table skeleton.

BEFORE (`src/pages/AnalyticsPage.tsx`, line 11, verbatim):
```tsx
import { DataTable } from '@/components/analytics/DataTable';
```

AFTER:
```tsx
import { DataTable } from '@/components/analytics/DataTable';
import { ChartSkeleton } from '@/components/analytics/ChartSkeleton';
```

4c. Same file: read the provider's state, not just its rows.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 21-23, verbatim):
```tsx
  // Use IndexedDB-synced readings (0 Firebase reads on initial load)
  const { readings } = useSyncedReadings();
  const markerCount = readings.length;
```

AFTER:
```tsx
  // The shared, IndexedDB-cached readings (ReadingsProvider). `loading` covers
  // the first cache read or first download; `error` is the last failed sync.
  const { readings, loading, syncing, error, refresh } = useSyncedReadings();
  const markerCount = readings.length;
```

4d. Same file: the error card with Retry, above the stats.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 62-63, verbatim):
```tsx
      {/* Stats Cards with Real Data */}
      <StatsCards />
```

AFTER:
```tsx
      {/* A failed sync is said out loud, with Retry, never shown as "no data" (ux-1) */}
      {error && (
        <div
          role="alert"
          className={cn(
            'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border',
            isDarkMode ? 'bg-red-950/40 border-red-900 text-red-200' : 'bg-red-50 border-red-200 text-red-800'
          )}
        >
          <div>
            <p className="text-sm font-semibold">Could not sync readings</p>
            <p className="text-xs mt-1">
              {readings.length > 0
                ? `Showing the ${readings.length.toLocaleString()} readings already cached in this browser.`
                : 'No readings are cached in this browser yet.'}
              {' '}({error.message})
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            disabled={syncing}
            className="shrink-0"
          >
            <RefreshCw className={cn('w-3 h-3 mr-1', syncing && 'animate-spin')} />
            Retry
          </Button>
        </div>
      )}

      {/* Stats Cards with Real Data (a skeleton while the readings load) */}
      <StatsCards />
```

4e. Same file: the count line says it is loading instead of "Analyzing 0".

BEFORE (`src/pages/AnalyticsPage.tsx`, line 82, verbatim):
```tsx
              Analyzing {markerCount.toLocaleString()} noise readings
```

AFTER:
```tsx
              {loading
                ? 'Loading readings...'
                : `Analyzing ${markerCount.toLocaleString()} noise readings${syncing ? ' (syncing...)' : ''}`}
```

4f. Same file: no "No data available" table while loading.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 152-153, verbatim):
```tsx
          {/* Data Table */}
          <DataTable data={readings} userMap={userMap} />
```

AFTER:
```tsx
          {/* Data Table (a skeleton while the readings load, never a false "No data") */}
          {loading ? <ChartSkeleton /> : <DataTable data={readings} userMap={userMap} />}
```

Placement note: the export buttons keep `disabled={readings.length === 0}`, which also disables them while loading. Leave the `userMap` / `fetchAllUsers` lines alone: 07.2 removes them and must keep the `loading ?` gate around `<DataTable>` when it edits that line (master §4.9).

4g. `src/components/analytics/StatsCards.tsx`: skeleton while loading, honest empty state.

BEFORE (`src/components/analytics/StatsCards.tsx`, lines 1-8, verbatim):
```tsx
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Database, Volume2, TrendingUp, Users } from 'lucide-react';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';

export function StatsCards() {
  const { isDarkMode, getCardColor } = useTheme();
  const { readings } = useSyncedReadings();
```

AFTER:
```tsx
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Database, Volume2, TrendingUp, Users } from 'lucide-react';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { StatsCardsSkeleton } from '@/components/analytics/StatsCardsSkeleton';

export function StatsCards() {
  const { isDarkMode, getCardColor } = useTheme();
  const { readings, loading, error } = useSyncedReadings();

  // ux-1: a skeleton while the readings load; "No data available" only after a
  // load that really found no readings, never while loading or after a failure.
  if (loading) {
    return <StatsCardsSkeleton />;
  }

  if (readings.length === 0) {
    return (
      <div
        className="p-4 sm:p-6 rounded-lg shadow-lg transition-colors"
        style={{ backgroundColor: getCardColor() }}
      >
        <p className={cn('text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
          {error ? 'Readings could not be loaded' : 'No data available'}
        </p>
        <p className="text-xs mt-1 text-gray-500">
          {error
            ? 'Check your connection, then press Retry.'
            : 'No readings have been uploaded from the mobile app yet.'}
        </p>
      </div>
    );
  }
```

The statistics code from `// Calculate statistics from synced readings` (line 10) onward is unchanged.

4h. `src/components/analytics/NoiseTrendChart.tsx`: import the skeleton.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, line 7, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { ChartSkeleton } from '@/components/analytics/ChartSkeleton';
```

4i. Same file: read loading and error.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, line 21, verbatim):
```tsx
  const { readings } = useSyncedReadings();
```

AFTER:
```tsx
  const { readings, loading, error } = useSyncedReadings();
```

4j. Same file: skeleton, then an honest empty state.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 147-165, verbatim):
```tsx
  if (groupedData.length === 0) {
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <div className="flex items-center justify-center h-64 sm:h-80">
          <div className="text-center">
            <p className={cn("text-sm font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              No data available
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              Start recording noise to see trends
            </p>
          </div>
        </div>
      </div>
    );
  }
```

AFTER:
```tsx
  if (loading) {
    return <ChartSkeleton showLegend />;
  }

  if (groupedData.length === 0) {
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <div className="flex items-center justify-center h-64 sm:h-80">
          <div className="text-center">
            <p className={cn("text-sm font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              {error ? 'Readings could not be loaded' : 'No data available'}
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              {error
                ? 'Trends appear once the readings have been downloaded.'
                : 'No readings have been uploaded from the mobile app yet.'}
            </p>
          </div>
        </div>
      </div>
    );
  }
```

4k. `src/components/analytics/CategoryChart.tsx`: import the skeleton.

BEFORE (`src/components/analytics/CategoryChart.tsx`, line 5, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { ChartSkeleton } from '@/components/analytics/ChartSkeleton';
```

4l. Same file: read loading and error.

BEFORE (`src/components/analytics/CategoryChart.tsx`, line 67, verbatim):
```tsx
  const { readings } = useSyncedReadings();
```

AFTER:
```tsx
  const { readings, loading, error } = useSyncedReadings();
```

4m. Same file: skeleton, then an honest empty state.

BEFORE (`src/components/analytics/CategoryChart.tsx`, lines 100-118, verbatim):
```tsx
  if (categoryData.length === 0) {
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <div className="flex items-center justify-center h-64 sm:h-80">
          <div className="text-center">
            <p className={cn("text-sm font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              No data available
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              Start recording noise to see categories
            </p>
          </div>
        </div>
      </div>
    );
  }
```

AFTER:
```tsx
  if (loading) {
    return <ChartSkeleton showLegend />;
  }

  if (categoryData.length === 0) {
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <div className="flex items-center justify-center h-64 sm:h-80">
          <div className="text-center">
            <p className={cn("text-sm font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              {error ? 'Readings could not be loaded' : 'No data available'}
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              {error
                ? 'Categories appear once the readings have been downloaded.'
                : 'No readings have been uploaded from the mobile app yet.'}
            </p>
          </div>
        </div>
      </div>
    );
  }
```

4n. `src/components/analytics/SoundTypeChart.tsx`: import the skeleton.

BEFORE (`src/components/analytics/SoundTypeChart.tsx`, line 5, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { ChartSkeleton } from '@/components/analytics/ChartSkeleton';
```

4o. Same file: read loading and error.

BEFORE (`src/components/analytics/SoundTypeChart.tsx`, line 24, verbatim):
```tsx
  const { readings } = useSyncedReadings();
```

AFTER:
```tsx
  const { readings, loading, error } = useSyncedReadings();
```

4p. Same file: skeleton, then an honest empty state.

BEFORE (`src/components/analytics/SoundTypeChart.tsx`, lines 61-79, verbatim):
```tsx
  if (soundTypeData.length === 0) {
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <div className="flex items-center justify-center h-64 sm:h-80">
          <div className="text-center">
            <p className={cn("text-sm font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              No data available
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              Start recording noise to see distribution
            </p>
          </div>
        </div>
      </div>
    );
  }
```

AFTER:
```tsx
  if (loading) {
    return <ChartSkeleton showLegend />;
  }

  if (soundTypeData.length === 0) {
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <div className="flex items-center justify-center h-64 sm:h-80">
          <div className="text-center">
            <p className={cn("text-sm font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              {error ? 'Readings could not be loaded' : 'No data available'}
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              {error
                ? 'Sound types appear once the readings have been downloaded.'
                : 'No readings have been uploaded from the mobile app yet.'}
            </p>
          </div>
        </div>
      </div>
    );
  }
```

Placement note (hooks order): in all three charts, the new `if (loading)` return sits AFTER every hook. In `NoiseTrendChart` the hooks are `useTheme`, `useState`, `useSyncedReadings` and `useMemo` (`:19-104`). In `CategoryChart` they are `useTheme`, `useSyncedReadings` and `useMemo` (`:66-98`). In `SoundTypeChart` they are `useTheme`, `useSyncedReadings`, `useState`, `useEffect` and `useMemo` (`:23-59`). In `StatsCards`, `useSyncedReadings` is the last hook.

**Edge cases to preserve**
- The order of states: loading → skeleton; error with no rows → "could not be loaded"; no error and no rows → "No data available". When there are rows, the data renders even if the last sync failed; AnalyticsPage's error card says the rows are cached.
- The copy never tells a researcher to record noise. After this step `grep -rn "Start recording noise" src/components src/pages/AnalyticsPage.tsx` prints nothing (`DashboardPage.tsx`'s copy is Step 5).
- Retry calls `refresh()`, which never rejects, and is disabled while a sync runs.
- `error.message` is shown verbatim (Firebase messages such as "Missing or insufficient permissions."). No reading data is shown in the error.
- 06.2/06.3 later make CategoryChart exclude unclassified readings (D2). They must then distinguish "no classified readings" (rows exist) from this "No data available" (no rows). That is noted for 06; do not pre-empt it here.

**Acceptance criteria**
- `grep -rn "Start recording noise" src/components src/pages/AnalyticsPage.tsx` prints nothing.
- Manual (dev server, admin). DevTools → Network → Offline, then reload `/analytics`:
  - The cached data renders, with the red "Could not sync readings" card and a Retry button.
  - Back online, Retry clears the card.
  - With a warm cache, no "No data available" text ever appears on `/analytics`.
- The first-visit skeleton was checked in Step 3. With an empty cache the skeletons hold until the first download settles. Do not empty the cache only to recheck it, because that costs a full fetch.

**Verify**
```
npx tsc -b
npx eslint src/pages/AnalyticsPage.tsx src/components/analytics/StatsCards.tsx src/components/analytics/NoiseTrendChart.tsx src/components/analytics/CategoryChart.tsx src/components/analytics/SoundTypeChart.tsx
```

**Commit title:** `fix(analytics): show sync loading and error states instead of a false 'no data' (ux-1)`

---

### Step 5 — perf-1: drop the full-collection onSnapshot and derive counts from the cache

**Goal:** `DashboardPage` stops attaching `onSnapshot(collection(db, 'noise_readings'))`, about 3,374 billed reads per visit with no error callback. `hasData` and the marker badge come from the provider's cached readings, so the badge has ONE source (readings with a usable position) instead of two writers. Skeletons gate on `loading` (the cache read), never on a network round-trip. A failed load shows an error state with Retry, never infinite skeletons. The now-false `onSnapshot` comment in `src/config/firebase.ts` goes too, so master §6's `grep -rn "onSnapshot" src` prints nothing.

**Files:**
- `src/pages/DashboardPage.tsx`
- `src/config/firebase.ts` (one comment; this is the only file outside the cluster's nominal list)

**Exact changes**

5a. `src/pages/DashboardPage.tsx`: imports.

BEFORE (`src/pages/DashboardPage.tsx`, lines 5-10, verbatim):
```tsx
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ErrorBoundary } from '@/components/ErrorBoundary';
```

AFTER:
```tsx
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useMemo } from 'react';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { ErrorBoundary } from '@/components/ErrorBoundary';
```

5b. Same file: the listener becomes a cache read.

BEFORE (`src/pages/DashboardPage.tsx`, lines 24-39, verbatim):
```tsx
export default function DashboardPage() {
  const navigate = useNavigate();
  const { isDarkMode, getCardColor } = useTheme();
  const [markerCount, setMarkerCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  // Fetch marker count from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'noise_readings'), (snapshot) => {
      setMarkerCount(snapshot.size);
      setHasData(snapshot.size > 0);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
```

AFTER:
```tsx
export default function DashboardPage() {
  const navigate = useNavigate();
  const { isDarkMode, getCardColor } = useTheme();
  // Everything on the Overview comes from the shared IndexedDB cache (perf-1).
  // There is no Firestore listener here: opening this page costs no reads
  // beyond the ReadingsProvider's single delta sync, and the skeletons wait
  // for the cache, never for a network round-trip.
  const { readings, loading: isLoading, error, syncing, refresh } = useSyncedReadings();
  const hasData = readings.length > 0;
  // One source for the badge: cached readings that have a usable position.
  const markerCount = useMemo(
    () => readings.filter((reading) => Number.isFinite(reading.latitude) && Number.isFinite(reading.longitude)).length,
    [readings],
  );
```

5c. Same file: stats section with error and honest-empty states.

BEFORE (`src/pages/DashboardPage.tsx`, lines 58-72, verbatim):
```tsx
      {/* Stats Cards with Real Data */}
      {isLoading ? (
        <StatsCardsSkeleton />
      ) : hasData ? (
        <StatsCards />
      ) : (
        <EmptyState
          variant="no-data"
          title="No Data Available"
          description="Start recording noise levels with the mobile app to see data here."
          action={
            <EmptyStateActions.ViewAnalytics onClick={() => navigate('/analytics')} />
          }
        />
      )}
```

AFTER:
```tsx
      {/* The last sync failed but cached readings exist: keep showing them, and say so */}
      {error && hasData && (
        <div
          role="alert"
          className={cn(
            'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg border text-sm',
            isDarkMode ? 'bg-red-950/40 border-red-900 text-red-200' : 'bg-red-50 border-red-200 text-red-800'
          )}
        >
          <span>Could not sync new readings. Showing the readings cached in this browser.</span>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={syncing}>
            Retry
          </Button>
        </div>
      )}

      {/* Stats Cards with Real Data */}
      {isLoading ? (
        <StatsCardsSkeleton />
      ) : hasData ? (
        <StatsCards />
      ) : error ? (
        <EmptyState
          variant="error"
          title="Could not load readings"
          description="The readings could not be downloaded. Check your connection and try again."
          action={
            <Button onClick={() => void refresh()} disabled={syncing}>
              Retry
            </Button>
          }
        />
      ) : (
        <EmptyState
          variant="no-data"
          title="No Data Available"
          description="No readings have been uploaded from the mobile app yet."
          action={
            <EmptyStateActions.ViewAnalytics onClick={() => navigate('/analytics')} />
          }
        />
      )}
```

5d. Same file: the mini-map no longer writes the badge.

BEFORE (`src/pages/DashboardPage.tsx`, line 141, verbatim):
```tsx
                    <NoiseMarkers onMarkersLoaded={setMarkerCount} />
```

AFTER:
```tsx
                    <NoiseMarkers />
```

5e. Same file: charts section empty state.

BEFORE (`src/pages/DashboardPage.tsx`, lines 171-177, verbatim):
```tsx
        ) : (
          <EmptyState
            variant="no-data"
            title="No Analytics Data"
            description="Analytics will appear here once you have recorded noise readings."
          />
        )}
```

AFTER:
```tsx
        ) : (
          <EmptyState
            variant={error ? 'error' : 'no-data'}
            title={error ? 'Analytics unavailable' : 'No Analytics Data'}
            description={
              error
                ? 'Analytics appear once the readings have been downloaded.'
                : 'Analytics appear here once the mobile app has uploaded readings.'
            }
          />
        )}
```

5f. `src/config/firebase.ts`: the import comment names a listener that no longer exists.

BEFORE (`src/config/firebase.ts`, line 11, verbatim):
```ts
import { getFirestore } from 'firebase/firestore'; // Changed from 'firebase/firestore/lite' to support onSnapshot
```

AFTER:
```ts
import { getFirestore } from 'firebase/firestore';
```

Placement notes:
- `isLoading` keeps its name, so the map gate (`{isLoading ? (<MapSkeleton …` at `:110`) and the charts gate (`{isLoading ? (` at `:152`) are unchanged. They now wait only for the provider's cache read.
- `markerCount` is derived, so `useState` and `useEffect` are no longer imported. `useMemo` is the only React import left.
- `Number.isFinite` accepts `unknown`, so the badge expression compiles against both the pre-04 and the post-04 `NoiseReading`. After 04.3 every cached reading has finite coordinates, so the count equals `readings.length`. 09.1 later feeds the badge and the map from one filtered array.
- 03.3 keeps `src/config/firebase.ts:11` verbatim (it removes only the Storage lines), and 12.1 anchors on the `export const auth/db` lines, so 5f collides with neither.

**Edge cases to preserve**
- No Firestore import remains in `DashboardPage.tsx`, and no `onSnapshot` remains anywhere in `src` (master §6.6).
- With a warm cache the page renders data right after the local read, even offline. Offline with an empty cache it shows the error EmptyState with Retry, not skeletons forever and not a false "No Data".
- The empty-state copy no longer says "Start recording".
- `EmptyStateActions.ViewAnalytics` stays on the no-data state. The error state's action is Retry (`refresh`).
- `ErrorBoundary`, `MapComponent` and `MarkerClusterGroup` are untouched (08.2 and 10.6 own them).

**Acceptance criteria**
- `grep -rn "onSnapshot" src` prints nothing. `grep -n "firebase/firestore\|@/config/firebase" src/pages/DashboardPage.tsx` prints nothing.
- `grep -n "Start recording\|recorded noise" src/pages/DashboardPage.tsx` prints nothing.
- Manual (dev server, admin, warm cache): DevTools → Network, filter `firestore`, reload `/dashboard`.
  - The page shows data before any Firestore response arrives.
  - The only Firestore traffic is the provider's single delta query (one `[Sync] Delta sync` console line).
  - Navigating away and back to `/dashboard` produces no Firestore traffic.
  - The "markers" badge equals the Total Readings card.
- Manual: Offline + reload keeps the cached data visible, with the red "Could not sync new readings" banner. Retry works once back online.

**Verify**
```
npx tsc -b
npx eslint src/pages/DashboardPage.tsx src/config/firebase.ts
```

**Commit title:** `perf(dashboard): drop the full-collection onSnapshot and derive counts from the cache (perf-1)`

---

### Step 6 — bug-4, bug-5: Sync, hourly auto-sync and Fetch All through the provider

**Goal:** Every sync goes through the provider, so the map, heatmap, badge and charts update from the same run.
- `SyncStatus` reads `lastSync`, `syncing`, `error` and the cached count from the provider, and its button calls `refresh()`.
- The provider owns a real `AUTO_SYNC_INTERVAL_MS` (1 h) interval, plus a sync when the tab becomes visible and the last sync (from any tab) is over 5 minutes old.
- "Just now" is computed from `lastSync`. The count reads "cached (all users)". The badge container is a `role="status"` live region.
- MapPage's log-only `onSyncComplete` goes. "Fetch All Readings" uses `provider.forceFullSync()` behind the `ui/dialog` confirmation, with inline success and error text instead of `confirm()`, `alert()` and `window.location.reload()`.

**Files:**
- `src/utils/syncManager.ts` (two constants)
- `src/contexts/ReadingsContext.tsx` (auto-sync effect)
- `src/components/map/SyncStatus.tsx` (whole file rewritten)
- `src/pages/MapPage.tsx`

**Exact changes**

6a. `src/utils/syncManager.ts`: the auto-sync constants (master §4.4 names them here).

BEFORE (`src/utils/syncManager.ts`, Step 2 AFTER text, verbatim):
```ts
export const FULL_REPLACE_INTERVAL_MS = 24 * 3_600_000;
```

AFTER:
```ts
export const FULL_REPLACE_INTERVAL_MS = 24 * 3_600_000;

/** bug-4: while an account is signed in, the ReadingsProvider runs a delta sync this often. */
export const AUTO_SYNC_INTERVAL_MS = 3_600_000;

/** bug-4: when the tab becomes visible again, sync if the last sync (any tab) is older than this. */
export const RESYNC_ON_VISIBLE_AFTER_MS = 5 * 60_000;
```

6b. `src/contexts/ReadingsContext.tsx`: the real auto-sync.

BEFORE (`src/contexts/ReadingsContext.tsx`, Step 3 AFTER text, verbatim):
```tsx
    return () => {
      generationRef.current += 1;
    };
  }, [uid, update, runSync]);

  const current = session.uid === uid ? session : null;
```

AFTER:
```tsx
    return () => {
      generationRef.current += 1;
    };
  }, [uid, update, runSync]);

  // bug-4: a real auto-sync. While an account is signed in, one delta sync
  // every AUTO_SYNC_INTERVAL_MS, plus one when the tab becomes visible again
  // and the last successful sync (from any tab: it is read from IndexedDB) is
  // older than RESYNC_ON_VISIBLE_AFTER_MS. Each shares a sync already running.
  useEffect(() => {
    if (uid === null) {
      return;
    }
    const syncInBackground = () => {
      void runSync(false).catch(() => {
        // Already in `error`.
      });
    };
    const interval = window.setInterval(syncInBackground, syncManager.AUTO_SYNC_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void syncManager
        .getSyncStatus()
        .then(({ lastSync }) => {
          if (
            lastSync === null ||
            Date.now() - lastSync.getTime() > syncManager.RESYNC_ON_VISIBLE_AFTER_MS
          ) {
            syncInBackground();
          }
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [uid, runSync]);

  const current = session.uid === uid ? session : null;
```

6c. `src/components/map/SyncStatus.tsx`: replace the whole file.

BEFORE (`src/components/map/SyncStatus.tsx`, Step 1 AFTER text: lines 1-20 of the file as Step 1 left it, verbatim; the WHOLE file is replaced, through its last line):
```tsx
import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import * as syncManager from '@/utils/syncManager';

interface SyncStatusProps {
  onSyncComplete?: (result: syncManager.SyncResult) => void;
}

/**
 * SyncStatus - Shows sync state and provides manual sync button
 * 
 * States:
 * - synced: Green checkmark, "Just now"
 * - pending: Gray clock, "X time ago" + Sync button
 * - syncing: Blue spinner, "Syncing..."
 * - error: Red alert, "Retry" button
 */
export function SyncStatus({ onSyncComplete }: SyncStatusProps) {
```

AFTER (the complete file):
```tsx
import { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { AUTO_SYNC_INTERVAL_MS, formatTimeAgo } from '@/utils/syncManager';

// How often the relative time ("2m ago") re-renders. No sync happens here.
const CLOCK_TICK_MS = 30 * 1000;

type DisplayStatus = 'synced' | 'pending' | 'syncing' | 'error';

/**
 * SyncStatus - the ReadingsProvider's real sync state, plus a Sync button.
 *
 * Everything comes from the provider (bug-4). The button runs the provider's
 * refresh(), so markers, heatmap and counts update from the same sync. The
 * provider itself syncs every AUTO_SYNC_INTERVAL_MS and when the tab becomes
 * visible again; this component only displays the result.
 *
 * States:
 * - synced: green check, "Last synced: Just now" (within the auto-sync interval)
 * - pending: grey clock, "Last synced: 3h ago" / "Never"
 * - syncing: blue spinner, "Syncing..."
 * - error: red alert, "Sync failed" + Retry
 */
export function SyncStatus() {
  const { isDarkMode } = useTheme();
  const { readings, syncing, error, lastSync, refresh } = useSyncedReadings();
  const [now, setNow] = useState(() => Date.now());

  // Re-render the relative time without re-syncing.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const status: DisplayStatus = syncing
    ? 'syncing'
    : error
      ? 'error'
      : lastSync !== null && now - lastSync.getTime() < AUTO_SYNC_INTERVAL_MS
        ? 'synced'
        : 'pending';

  // Render icon based on status
  function renderIcon() {
    switch (status) {
      case 'synced':
        return <CheckCircle className={`h-3.5 w-3.5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />;
      case 'syncing':
        return <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />;
      case 'error':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <Clock className={`h-3.5 w-3.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />;
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
        isDarkMode ? 'bg-[#2D2640]/95' : 'bg-white/95'
      } backdrop-blur-sm shadow-lg`}
    >
      <div className="flex items-center gap-2">
        {renderIcon()}

        <span className={`text-xs font-medium ${
          isDarkMode ? 'text-gray-300' : 'text-gray-700'
        }`}>
          {status === 'syncing' && 'Syncing...'}
          {status === 'error' && 'Sync failed'}
          {(status === 'synced' || status === 'pending') && (
            <>
              Last synced:{' '}
              {/* The ticking time is not re-announced every minute. */}
              <span aria-live="off">{formatTimeAgo(lastSync, now)}</span>
            </>
          )}
        </span>

        {readings.length > 0 && (
          <span className={`text-xs ${
            isDarkMode ? 'text-gray-500' : 'text-gray-400'
          }`}>
            • {readings.length.toLocaleString()} cached (all users)
          </span>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void refresh()}
        disabled={syncing}
        className={`h-6 px-2 text-xs ${
          status === 'error'
            ? 'border-red-300 text-red-600 hover:bg-red-50'
            : ''
        }`}
        title={status === 'error' ? 'Retry sync' : 'Sync new readings'}
      >
        {status === 'error' ? 'Retry' : 'Sync'}
      </Button>
    </div>
  );
}
```

6d. `src/pages/MapPage.tsx`: imports.

BEFORE (`src/pages/MapPage.tsx`, lines 14-17, verbatim):
```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import type { NoiseReading } from '@/types/NoiseReading';
import * as syncManager from '@/utils/syncManager';
```

AFTER:
```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import type { NoiseReading } from '@/types/NoiseReading';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
```

6e. Same file: Fetch All through the provider, with no blocking dialogs and no reload.

BEFORE (`src/pages/MapPage.tsx`, lines 29-49, verbatim):
```tsx
  const [isRefreshing, setIsRefreshing] = useState(false); // Force refresh state
  const { isDarkMode, primaryColor } = useTheme();

  // Handle force full sync
  const handleForceFullSync = async () => {
    if (!confirm('This will clear the cache and fetch ALL readings from Firebase. This may take 2-3 minutes. Continue?')) {
      return;
    }

    setIsRefreshing(true);
    try {
      const result = await syncManager.forceFullSync();
      alert(`Successfully fetched ${result.newCount.toLocaleString()} readings!`);
      window.location.reload(); // Reload to refresh map
    } catch (error) {
      console.error('Force full sync failed:', error);
      alert('Failed to fetch all readings. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };
```

AFTER:
```tsx
  const [isRefreshing, setIsRefreshing] = useState(false); // Force refresh state
  const [confirmFullSyncOpen, setConfirmFullSyncOpen] = useState(false);
  const [fullSyncNotice, setFullSyncNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const { isDarkMode, primaryColor } = useTheme();
  const { forceFullSync } = useSyncedReadings();

  // "Fetch All Readings": re-download everything through the provider, which
  // swaps the cache only after the download succeeded (bug-5). The provider's
  // readings update in place, so the map refreshes without a page reload.
  const handleForceFullSync = async () => {
    setConfirmFullSyncOpen(false);
    setIsRefreshing(true);
    setFullSyncNotice(null);
    try {
      const result = await forceFullSync();
      setFullSyncNotice({
        kind: 'success',
        text: `Fetched ${result.count.toLocaleString()} readings. The map is up to date.`,
      });
    } catch (error) {
      console.error('Force full sync failed:', error);
      setFullSyncNotice({
        kind: 'error',
        text: 'Could not fetch all readings. The readings already cached are unchanged. Please try again.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };
```

6f. Same file: the Sync badge drives the provider.

BEFORE (`src/pages/MapPage.tsx`, lines 90-93, verbatim):
```tsx
          {/* Sync Status */}
          <SyncStatus onSyncComplete={(result) => {
            console.log(`Synced ${result.newCount} new readings, total: ${result.totalReadings}`);
          }} />
```

AFTER:
```tsx
          {/* Sync Status: reads and drives the shared ReadingsProvider (bug-4) */}
          <SyncStatus />
```

6g. Same file: the Fetch All button opens the dialog and shows inline status.

BEFORE (`src/pages/MapPage.tsx`, lines 234-256, verbatim):
```tsx
          {/* Force Full Sync Button */}
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <label className={`text-sm font-medium mb-2 block ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Management
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleForceFullSync}
              disabled={isRefreshing}
              className="w-full"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Fetching...' : 'Fetch All Readings'}
            </Button>
            <p className={`text-xs mt-2 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              Clear cache and fetch ALL readings from Firebase
            </p>
          </div>
```

AFTER:
```tsx
          {/* Force Full Sync Button */}
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <label className={`text-sm font-medium mb-2 block ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Management
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmFullSyncOpen(true)}
              disabled={isRefreshing}
              className="w-full"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Fetching...' : 'Fetch All Readings'}
            </Button>
            <p className={`text-xs mt-2 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              Re-download every reading from Firebase. The cache is replaced only after the download succeeds.
            </p>
            {fullSyncNotice && (
              <p
                role={fullSyncNotice.kind === 'error' ? 'alert' : 'status'}
                className={`text-xs mt-2 ${
                  fullSyncNotice.kind === 'error'
                    ? 'text-red-500'
                    : isDarkMode ? 'text-green-400' : 'text-green-700'
                }`}
              >
                {fullSyncNotice.text}
              </p>
            )}
          </div>
```

6h. Same file: the confirmation dialog, as the last child of the page root. It sits outside the filter panel, so closing the panel cannot unmount an open dialog.

BEFORE (`src/pages/MapPage.tsx`, lines 267-276, verbatim; the last lines of the file):
```tsx
            }`}>
              <li>• Category</li>
              <li>• Noise level</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
```

AFTER:
```tsx
            }`}>
              <li>• Category</li>
              <li>• Noise level</li>
            </ul>
          </div>
        </div>
      )}

      {/* "Fetch All Readings" confirmation (replaces window.confirm, bug-5) */}
      <Dialog open={confirmFullSyncOpen} onOpenChange={setConfirmFullSyncOpen}>
        <DialogContent className={`max-w-md z-[9999] ${
          isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white'
        }`}>
          <DialogHeader>
            <DialogTitle className={isDarkMode ? 'text-white' : 'text-gray-900'}>
              Fetch all readings?
            </DialogTitle>
            <DialogDescription className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
              This downloads every reading from Firebase again (one billed read per reading) and can take a few minutes on a slow connection. The readings already cached stay on the map until the download succeeds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmFullSyncOpen(false)}
              className={isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : ''}
            >
              Cancel
            </Button>
            <Button onClick={handleForceFullSync}>
              Fetch all readings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Placement notes:
- `DialogContent` takes `z-[9999]`, exactly like `UserFilterToggle.tsx:80`, so it renders above the map's `z-[300]`/`z-[399]`/`z-[400]` overlays. The overlay's `z-50` stacking is a11y-6's concern, fixed once in `ui/dialog.tsx` by 10.5. Do not touch `dialog.tsx` here.
- `NoiseMarkers` reads the provider, so after `refresh()` or `forceFullSync()` its `readings` change. Its existing effects then push `filteredReadings.length` to `setMarkerCount` and the full set to `setReadingsData` (the heatmap). That closes bug-4 without new MapPage state; 09.1 later replaces both callbacks with one memoized filter.
- The ErrorBoundary fallback's "Reload Page" button (`window.location.reload()` at `:150`) is a crash-recovery path and stays.
- `useSyncedReadings` in MapPage is used only for `forceFullSync`. The `syncManager` import is gone.
- Where the hourly interval lives: master §4.8 words it as SyncStatus's interval calling `refresh()`. The cluster definition puts the real interval in the provider (6b), so auto-sync runs on every route, not only while `/map` is open. `SyncStatus` keeps only a 30-second display clock. Both readings satisfy bug-4; follow this spec.

**Edge cases to preserve**
- The Sync button is always visible and disabled while a sync runs. Clicking it during the provider's background sync shares that sync.
- The relative time is computed from `lastSync` and `now`. `now` is state refreshed every 30 s by a timer, never `Date.now()` during render (`react-hooks/purity`). A `lastSync` a few seconds newer than `now` still reads "Just now".
- "Fresh" (green check) means the last sync is younger than `AUTO_SYNC_INTERVAL_MS`, the same hour the provider's auto-sync keeps.
- The visibility resync reads `lastSync` from IndexedDB, so a sync done in another tab counts and does not trigger a redundant query.
- Interval and listener are created only while an account is signed in, and are removed on sign-out or account change (the effect depends on `uid`).
- Fetch All never clears before fetching (Step 2). On failure the inline error says the cache is unchanged, and the markers stay.
- The `role="status"` live region announces state changes. The minute-by-minute time is wrapped in `aria-live="off"`, so it is not re-announced every tick. 10.7 may refine this; it must keep `role="status"`.

**Acceptance criteria**
- `grep -n "confirm(\|alert(\|syncManager" src/pages/MapPage.tsx` prints nothing.
- `grep -n "Auto-sync every hour\|onSyncComplete\|getSyncStatus" src/components/map/SyncStatus.tsx` prints nothing.
- Manual (dev server, admin, `/map`):
  - Record a reading on the phone (online). Click Sync. Within one sync the marker badge goes up by one and the new marker appears; with the heatmap toggled on, it reflects the reading. There is no page reload.
  - The badge text reads "Last synced: Just now • 3,374 cached (all users)" (or the current count), then "1m ago" a minute later.
  - Switch to another tab for more than 5 minutes, then return. The console shows one `[Sync] Delta sync` line.
  - Fetch All: the themed dialog opens (no browser `confirm`). Cancel closes it. Confirm shows "Fetching...", then the green inline text, with no reload. Repeat with DevTools → Offline: the red inline text appears and the markers remain. The offline attempt costs nothing; the online one costs a full fetch, so do it once.

**Verify**
```
npx tsc -b
npx eslint src/utils/syncManager.ts src/contexts/ReadingsContext.tsx src/components/map/SyncStatus.tsx src/pages/MapPage.tsx
```

**Commit title:** `fix(map): route Sync, hourly auto-sync and Fetch All through the provider so the map refreshes (bug-4, bug-5)`

---

### Step 7 — priv-4: clear the readings cache and remembered email on sign-out or account switch

**Goal:** When the signed-in account ends (sign-out, token expiry, sign-out in another tab) or switches, the provider:
1. discards in-flight results through its generation counter (Step 3);
2. calls `syncManager.clearSyncData()`, which now also cancels a sync already running, so the sync cannot write rows back into the emptied cache;
3. stops exposing the old account's state (Step 3's per-account session).

A `cacheOwnerUid` metadata key covers a browser closed without signing out: before any account reads the cache, `claimCacheFor(uid)` purges a cache written for anyone else. `AuthContext.signOut` removes the never-read `remembered_email`. The dead write at `LoginPage.tsx:37-41` is deleted, together with the "Remember me" checkbox, which never did anything.

**Files:**
- `src/utils/syncManager.ts`
- `src/contexts/ReadingsContext.tsx`
- `src/contexts/AuthContext.tsx`
- `src/pages/LoginPage.tsx`
- `src/utils/__tests__/syncManager.test.ts`

**Exact changes**

7a. `src/utils/syncManager.ts`: the owner key.

BEFORE (`src/utils/syncManager.ts`, Step 2 AFTER text, verbatim):
```ts
/** sync_metadata key: wall-clock time of the last full replace (epoch ms). Missing means one is due. */
const LAST_FULL_SYNC_AT_KEY = 'lastFullSyncAt';
/** Every sync_metadata key this module writes; clearSyncData() resets them all. */
const SYNC_METADATA_KEYS = [WATERMARK_KEY, LAST_SYNC_AT_KEY, LAST_FULL_SYNC_AT_KEY];
```

AFTER:
```ts
/** sync_metadata key: wall-clock time of the last full replace (epoch ms). Missing means one is due. */
const LAST_FULL_SYNC_AT_KEY = 'lastFullSyncAt';
/** sync_metadata key: uid of the account the cache was written for (priv-4). */
const CACHE_OWNER_UID_KEY = 'cacheOwnerUid';
/** Every sync_metadata key this module writes; clearSyncData() resets them all. */
const SYNC_METADATA_KEYS = [WATERMARK_KEY, LAST_SYNC_AT_KEY, LAST_FULL_SYNC_AT_KEY, CACHE_OWNER_UID_KEY];
```

7b. Same file: the cancellation epoch and the maintenance queue, next to the single-flight lock.

BEFORE (`src/utils/syncManager.ts`, Step 1 AFTER text, verbatim):
```ts
// The sync every caller currently shares, if one is running.
let inflight: Promise<SyncResult> | null = null;
```

AFTER:
```ts
// The sync every caller currently shares, if one is running.
let inflight: Promise<SyncResult> | null = null;

// Bumped whenever the cache is wiped. A sync that started before the wipe
// drops its result instead of writing it back into the emptied cache (priv-4).
let cacheEpoch = 0;

function assertCacheEpoch(startedEpoch: number): void {
  if (startedEpoch !== cacheEpoch) {
    throw new Error('Sync cancelled: the readings cache was cleared');
  }
}

// clearSyncData() and claimCacheFor() run one at a time, so a purge and a
// claim can never interleave their writes.
let maintenanceQueue: Promise<unknown> = Promise.resolve();

function runExclusively<T>(op: () => Promise<T>): Promise<T> {
  const run = maintenanceQueue.then(op, op);
  maintenanceQueue = run.catch(() => undefined);
  return run;
}
```

7c. Same file: a sync checks the epoch before it writes rows.

BEFORE (`src/utils/syncManager.ts`, Step 2 AFTER text, verbatim):
```ts
async function performSync(forceFull: boolean): Promise<SyncResult> {
  try {
    const watermark = await getWatermark();
```

AFTER:
```ts
async function performSync(forceFull: boolean): Promise<SyncResult> {
  const startedEpoch = cacheEpoch;
  try {
    const watermark = await getWatermark();
```

7d. Same file: and again before every write.

BEFORE (`src/utils/syncManager.ts`, Step 2 AFTER text, verbatim):
```ts
      readings = await fetchReadings(fullQuery());
      await localDb.replaceAllReadings(readings);
    } else {
      readings = await fetchReadings(deltaQuery(deltaFrom));
      if (readings.length > 0) {
        await localDb.setManyReadings(readings);
      }
    }

    // Cursors are written only after the rows are stored: if anything above
    // failed, the old watermark stays and the next sync re-reads.
    const finishedAt = Date.now();
```

AFTER:
```ts
      readings = await fetchReadings(fullQuery());
      assertCacheEpoch(startedEpoch);
      await localDb.replaceAllReadings(readings);
    } else {
      readings = await fetchReadings(deltaQuery(deltaFrom));
      assertCacheEpoch(startedEpoch);
      if (readings.length > 0) {
        await localDb.setManyReadings(readings);
      }
    }

    // Cursors are written only after the rows are stored: if anything above
    // failed, the old watermark stays and the next sync re-reads.
    assertCacheEpoch(startedEpoch);
    const finishedAt = Date.now();
```

7e. Same file: `clearSyncData` cancels and purges, and `claimCacheFor` is added.

BEFORE (`src/utils/syncManager.ts`, Step 1 AFTER text, verbatim; the last lines of the file):
```ts
/**
 * Empty the readings cache and reset every sync cursor.
 */
export async function clearSyncData(): Promise<void> {
  await localDb.clearAllReadings();
  for (const key of SYNC_METADATA_KEYS) {
    await localDb.setSyncMetadata(key, null);
  }
}
```

AFTER:
```ts
/** Cancel any running sync, then empty the cache and every cursor (including the owner). */
async function wipeCache(): Promise<void> {
  cacheEpoch += 1;
  inflight = null;
  await localDb.clearAllReadings();
  for (const key of SYNC_METADATA_KEYS) {
    await localDb.setSyncMetadata(key, null);
  }
}

/**
 * Empty the readings cache and reset every sync cursor (priv-4: sign-out and
 * account switch). A sync already running is cancelled at call time and
 * writes nothing.
 */
export function clearSyncData(): Promise<void> {
  cacheEpoch += 1;
  inflight = null;
  return runExclusively(wipeCache);
}

/**
 * Make the cache belong to `uid` before anything reads it. A cache written for
 * another account, or for an unknown one (written before this check existed),
 * is purged first (priv-4).
 */
export function claimCacheFor(uid: string): Promise<void> {
  return runExclusively(async () => {
    const owner = await localDb.getSyncMetadata(CACHE_OWNER_UID_KEY);
    if (owner === uid) {
      return;
    }
    await wipeCache();
    await localDb.setSyncMetadata(CACHE_OWNER_UID_KEY, uid);
  });
}
```

7f. `src/contexts/ReadingsContext.tsx`: track the auth identity separately from the download gate.

BEFORE (`src/contexts/ReadingsContext.tsx`, Step 3 AFTER text, verbatim):
```tsx
export function ReadingsProvider({ children }: ReadingsProviderProps) {
  const { user } = useAuth();
  // The single gate for downloading readings. Cluster 08.1 (D1-A) changes
  // this one expression to `!!user && role === 'admin'`.
  const enabled = !!user;
  const uid = enabled && user ? user.uid : null;
```

AFTER:
```tsx
export function ReadingsProvider({ children }: ReadingsProviderProps) {
  const { user, isLoading: authLoading } = useAuth();
  // The signed-in account, whether or not it may download readings. The cache
  // purge (priv-4) follows this identity, never the download gate below.
  const authUid = user ? user.uid : null;
  // The single gate for downloading readings. Cluster 08.1 (D1-A) changes
  // this one expression to `!!user && role === 'admin'`.
  const enabled = !!user;
  const uid = enabled ? authUid : null;
```

7g. Same file: the purge effect, and the owner claim before the cache is read.

BEFORE (`src/contexts/ReadingsContext.tsx`, Step 3 AFTER text, verbatim):
```tsx
  // Whenever an account starts: read the cache, then run one background sync.
  useEffect(() => {
    uidRef.current = uid;
    if (uid === null) {
      return;
    }
    const generation = generationRef.current;
    void (async () => {
      try {
        // 1. The cache: instant, 0 Firestore reads.
```

AFTER:
```tsx
  // priv-4: when the signed-in account ends (sign-out, expiry, a sign-out in
  // another tab) or switches, purge the cache so the next person on this
  // browser cannot read the previous account's readings. It waits until
  // Firebase has restored the session, so a page reload never purges.
  const sessionUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) {
      return;
    }
    const previous = sessionUidRef.current;
    sessionUidRef.current = authUid;
    if (authUid === null || (previous !== null && previous !== authUid)) {
      void syncManager.clearSyncData().catch((err) => {
        console.error('[Readings] Could not clear the readings cache:', err);
      });
    }
  }, [authUid, authLoading]);

  // Whenever an account starts: read the cache, then run one background sync.
  useEffect(() => {
    uidRef.current = uid;
    if (uid === null) {
      return;
    }
    const generation = generationRef.current;
    void (async () => {
      try {
        // 0. A cache written for another account is purged before anything reads it.
        await syncManager.claimCacheFor(uid);
        // 1. The cache: instant, 0 Firestore reads.
```

7h. `src/contexts/AuthContext.tsx`: sign-out removes the stale localStorage email.

BEFORE (`src/contexts/AuthContext.tsx`, lines 37-44, verbatim):
```tsx
  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };
```

AFTER:
```tsx
  const signOut = async () => {
    // priv-4: builds before cluster 05 stored the login email under this key
    // and never read it back. Remove it so it does not outlive the session.
    // The readings cache is purged by the ReadingsProvider when `user` turns null.
    try {
      localStorage.removeItem('remembered_email');
    } catch {
      // Storage unavailable (for example blocked in privacy mode): nothing stored.
    }
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };
```

7i. `src/pages/LoginPage.tsx`: drop the dead "remember me" state.

BEFORE (`src/pages/LoginPage.tsx`, lines 25-27, verbatim):
```tsx
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
```

AFTER:
```tsx
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
```

7j. Same file: drop the dead write.

BEFORE (`src/pages/LoginPage.tsx`, lines 35-42, verbatim):
```tsx
    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (rememberMe) {
        localStorage.setItem('remembered_email', email);
      } else {
        localStorage.removeItem('remembered_email');
      }
      navigate('/dashboard');
```

AFTER:
```tsx
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
```

7k. Same file: drop the checkbox that only fed the dead write.

BEFORE (`src/pages/LoginPage.tsx`, lines 209-227, verbatim):
```tsx
                {/* Remember Me */}
                <div className="flex items-center">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 focus:ring-2 focus:ring-offset-2 cursor-pointer"
                      style={{
                        accentColor: themeColor,
                      }}
                    />
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Remember me
                    </span>
                  </label>
                </div>

                {/* Error Message */}
```

AFTER:
```tsx
                {/* Error Message */}
```

7l. `src/utils/__tests__/syncManager.test.ts`: append the ownership and cancellation tests at the end of the file.

BEFORE (`src/utils/__tests__/syncManager.test.ts`, Step 2 AFTER text, verbatim; the last lines of the file):
```ts
    expect(result.mode).toBe('full');
    expect(localDb.replaceAllReadings).toHaveBeenCalledTimes(1);
    expect(localDb.clearAllReadings).not.toHaveBeenCalled();
    expect(Array.from(fakeDb.rows.keys())).toEqual(['fresh']);
  });
});
```

AFTER:
```ts
    expect(result.mode).toBe('full');
    expect(localDb.replaceAllReadings).toHaveBeenCalledTimes(1);
    expect(localDb.clearAllReadings).not.toHaveBeenCalled();
    expect(Array.from(fakeDb.rows.keys())).toEqual(['fresh']);
  });
});

describe('cache ownership and clearing (priv-4)', () => {
  it('claimCacheFor keeps the cache for the account that wrote it', async () => {
    fakeDb.meta.set('cacheOwnerUid', 'user-a');
    fakeDb.rows.set('r1', { id: 'r1' });

    await syncManager.claimCacheFor('user-a');

    expect(fakeDb.rows.size).toBe(1);
    expect(localDb.clearAllReadings).not.toHaveBeenCalled();
  });

  it('claimCacheFor purges a cache written for another or an unknown account', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    fakeDb.meta.set('cacheOwnerUid', 'user-a');
    fakeDb.rows.set('r1', { id: 'r1' });

    await syncManager.claimCacheFor('user-b');

    expect(fakeDb.rows.size).toBe(0);
    expect(fakeDb.meta.get('maxTimestampMs')).toBeNull();
    expect(fakeDb.meta.get('lastFullSyncAt')).toBeNull();
    expect(fakeDb.meta.get('cacheOwnerUid')).toBe('user-b');

    fakeDb.meta.delete('cacheOwnerUid');
    fakeDb.rows.set('r2', { id: 'r2' });
    await syncManager.claimCacheFor('user-b');
    expect(fakeDb.rows.size).toBe(0);
    expect(fakeDb.meta.get('cacheOwnerUid')).toBe('user-b');
  });

  it('a sync that was running when the cache was cleared writes nothing back', async () => {
    const pending = deferred<ReturnType<typeof fakeSnapshot>>();
    vi.mocked(getDocs).mockReturnValueOnce(pending.promise as never);

    const sync = syncManager.syncNewReadings();
    await vi.waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1));
    await syncManager.clearSyncData();
    pending.resolve(fakeSnapshot([fakeDoc('late', NOW - MINUTE)]));

    await expect(sync).rejects.toThrow('cancelled');
    expect(fakeDb.rows.size).toBe(0);
    expect(fakeDb.meta.get('maxTimestampMs')).toBeNull();
    expect(fakeDb.meta.get('lastFullSyncAt')).toBeNull();
  });
});
```

Placement notes:
- The purge effect is declared BEFORE the load effect. React runs effects in declaration order, so on an account switch the purge is queued first, and the new account's `claimCacheFor` runs after it (`runExclusively`).
- **Which uid drives what.** The purge follows `authUid`, the auth identity. The load follows `uid`, the download gate.
  - Under 08.1 (D1-A), an admin whose role is still loading has `uid === null` but `authUid` set, so nothing is purged while the role loads.
  - A non-admin never loads (`uid` is null). If the browser's cache belonged to someone else, it is purged when that person signs out, or by the switch branch.
- **When the purge fires.**
  - `authUid === null` after auth has resolved (signed out, or the app opened while signed out). The purge is idempotent and cheap on an empty store.
  - `previous !== null && previous !== authUid` (account switch without an explicit sign-out).
  - A page reload never purges: `authLoading` holds the effect until Firebase restores the session, and Firebase's first `onAuthStateChanged` already carries the restored user.
- `clearSyncData()` bumps the epoch synchronously at call time. A sync that is mid-download then throws "Sync cancelled" before writing rows or cursors. The provider has already moved to a new generation and drops that error.
- The "Remember me" checkbox never prefilled anything: the stored email was never read back (`LoginPage.tsx:23` starts `email` as `''`). Firebase Auth keeps its default local persistence, so sign-in behaviour is unchanged. Wiring the checkbox to `setPersistence` is a separate product decision (Out of scope).

**Edge cases to preserve**
- No setState in an effect body: the purge effect only calls `clearSyncData()`. The visible state switches through the per-account session (Step 3).
- A sign-out during the first full download leaves the store empty: the download's result is cancelled (epoch), not written after the purge.
- The same account signing back in finds `cacheOwnerUid` empty and re-downloads once (a full fetch, about 3,374 reads). This is the accepted price of purging on sign-out (Risks).
- `claimCacheFor` and `clearSyncData` are serialized by `runExclusively`, so they never interleave their IndexedDB writes. A failure in one does not wedge the queue (`run.catch`).
- `signOut` still rethrows Firebase errors, exactly as before. Removing the localStorage key cannot throw out of `signOut`.
- 08.1 later adds `role` to `AuthContext` and changes `enabled`. It must keep `authUid` / `authLoading` as the purge trigger.

**Acceptance criteria**
- `grep -rn "remembered_email" src` prints only `src/contexts/AuthContext.tsx` (the removal). `grep -n "rememberMe\|Remember me" src/pages/LoginPage.tsx` prints nothing.
- The 13 tests in `syncManager.test.ts` pass.
- Manual (dev server, admin):
  - Sign out. DevTools → Application → IndexedDB → `noise-pollution-db`: the `noise_readings` store is empty and every `sync_metadata` value is `null`. Local Storage has no `remembered_email`.
  - Sign in again. One `[Sync] Full sync` line appears, and `sync_metadata.cacheOwnerUid` holds the admin's uid.
  - Reload while signed in. No purge happens: the readings show at once, and only a `[Sync] Delta sync` line appears.
  - Optional, with a throwaway account under D1(B) only. Sign in as account B in the same profile: the store is purged, then re-filled for B, and `cacheOwnerUid` is B's uid.
  - Optional (costs a full fetch): DevTools → Network → throttle to "Slow 3G", delete the `cacheOwnerUid` row, reload, and sign out while the first download is still running. The store must stay empty after the download would have finished.

**Verify**
```
npx tsc -b
npx eslint src/utils/syncManager.ts src/contexts/ReadingsContext.tsx src/contexts/AuthContext.tsx src/pages/LoginPage.tsx src/utils/__tests__/syncManager.test.ts
npx vitest run src/utils/__tests__/syncManager.test.ts
npm test
npm run build
```
`npm test` and `npm run build` run once here, at the end of the cluster (master §1.3). Do not run the build alongside the dev server. Record the build time and the chunk table in the commit body only if it differs from the cluster-04 baseline.

**Commit title:** `fix(privacy): clear the readings cache and remembered email on sign-out or account switch (priv-4)`

---

## Risks & rollback

- **Read cost (owner-visible).**
  - Every browser does one full fetch after the 04.4 purge, one full replace per 24 h (`FULL_REPLACE_INTERVAL_MS`), and one more after each sign-out/sign-in cycle (Step 7). Today each is about 3,374 reads.
  - Deltas cost one read per returned doc, with a minimum of 1. They run on each page load, hourly, and on returning to a tab after more than 5 minutes; with the 10-minute overlap they re-read the last 10 minutes of writes.
  - Removing the `/dashboard` listener (Step 5) saves about 3,374 reads per Overview visit, which outweighs all of the above for any normal usage.
  - If the project is on Spark (unverified, M2), the 50k/day read quota is shared with the app. Keep manual QA full fetches to the few the steps call for.
- **Push timing (master §4.15).** Never push DASH between 04.4 and the end of this cluster. 04.4 forces a full re-fetch, and Steps 1–2 are what keep later loads cheap. Ship 04 and 05 together.
- **Accepted residuals (master §6.7).**
  - An offline upload back-dated past the watermark minus 10 minutes appears at the next full replace (within 24 h) or at once on Fetch All.
  - A reading deleted or anonymized in the app leaves a long-lived browser within 24 h, not instantly.
  - The complete fix is the app-side `syncedAt` cursor (master §7).
- **Multiple tabs.** The single-flight lock and the epoch are per tab. Two tabs may each run a delta, and both write the same rows (idempotent `put`). A full replace in one tab while the other runs a delta at worst re-puts rows the replace already holds. The cursors only move to values one of the fetches actually saw.
- **StrictMode (dev only).** Effects run twice. The second run shares the first run's `getDocs`, and its extra IndexedDB read is cheap. Production builds are unaffected.
- **Behaviour changes the owner will notice.**
  - Sign-out now empties the cache, so the next sign-in waits for a full download, with skeletons.
  - The "Remember me" checkbox is gone; it never did anything.
  - The Sync badge always shows a Sync button.
  - Fetch All no longer reloads the page.
- **Rollback.** Each step reverts on its own; revert the newest first (master §1.7). The metadata keys are new names (`maxTimestampMs`, `lastSyncAt`, `lastFullSyncAt`, `cacheOwnerUid`). Pre-05 code finds none of its own keys (`lastSyncTime`, `firstSyncDone`) after a revert and simply does a full first sync: about 3,374 reads, safe. Reverting Step 3 also requires reverting Steps 4–7 (they consume the provider). Reverting Step 2 also requires reverting Step 7's 7c/7d anchors (they sit on Step 2's text). Do not bump `DB_VERSION` to "undo" anything.

## Out of scope

- **App-side `syncedAt: serverTimestamp()` cursor** (the complete data-1 fix), the rules whitelist change it needs, and moving the delta onto it: master §7, parked. It needs an app release.
- **Replacing the hand-rolled cache with the SDK's `persistentLocalCache`** and one shared listener: master §7.
- **The role gate** (`enabled = !!user && role === 'admin'`, `role` in `AuthContext`, `ProtectedRoute` waiting on `roleLoading`): cluster 08.1. This spec only makes `enabled` a single expression and keeps the purge on `authUid`.
- **Lifting the map filter into MapPage**, deleting `onMarkersLoaded` / `onDataChange` / `readingsData`, and one array for markers, heatmap and badge: cluster 09.1. Date presets: 09.2. The default `showAllUsers`: 09.3.
- **`ui/dialog.tsx` z-index scale** (the overlay drawn under the map overlays): 10.5. `SyncStatus` sizing and touch targets: 10.7. Chart text summaries: 10.3.
- **CategoryChart's unclassified handling and its "no classified readings" copy** (D2): 06.2/06.3. They must keep this spec's `loading` / `error` branches.
- **AnalyticsPage's `fetchAllUsers` / `userMap` removal** (priv-2): 07.2. It must keep the `loading ? <ChartSkeleton /> :` gate around `<DataTable>`.
- **Server-side counts** (`getCountFromServer`). The cached count is the dashboard's number.
- **Unit tests for `ReadingsProvider`** need jsdom and `@testing-library/react`, which cluster 01 deliberately does not install. The provider is covered by the manual checks above.
- **Wiring "Remember me" to `setPersistence`** (session-only sign-in on shared machines) is a product decision for the owner, not part of priv-4's fix.
- **Dead `db.ts` helpers** `getLatestTimestamp` / `updateManyReadings`, and the stale "Real-time Firestore sync" doc comment in `NoiseMarkers.tsx:50-58`: master §7 dead-code sweep. The "Real-time" page subtitle is ux-12 (§7).
- **`ThemeContext` unguarded `localStorage`** (bug-11): master §7.
