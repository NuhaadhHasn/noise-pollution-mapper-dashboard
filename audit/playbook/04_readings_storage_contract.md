# Playbook 04 — Readings Storage Contract (IndexedDB normalization)

Implementation spec for the defect cluster covering the stored-reading shape. Today the sync writes raw Firestore documents into IndexedDB, and the structured clone strips every `Timestamp` of its methods, so every export row and every reading popup loses its date (bug-1). The cluster also covers four duplicated, diverging date and coordinate parsers (bug-8 part 1, bug-13), a console dump of whole readings (priv-5), unvalidated documents flowing straight into the cache and the UI (sec-1, dashboard ingest half), a per-call IndexedDB connection that would hang any schema upgrade (arch-4), and the one-time purge of every stale v1 cache (priv-1, purge half).

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors) and `npx eslint <the files the step changed>` (0 errors, no new warnings), and from Step 2 on also on `npx vitest run src/lib/__tests__/readings.test.ts`. Run `npm test` and `npm run build` ONCE, at the end of Step 4 (master playbook §1.3).**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`). Three kinds of block anchor instead on this spec's own earlier AFTER text, and each one says so: the Step 2 and Step 4 blocks in `src/utils/db.ts`, and every Step 3 block in the two new `src/lib` files. Clusters 01–03 touch none of the nine existing files edited here. If a BEFORE block does not match, STOP and re-read the file; do not guess. Match on exact text, never on line numbers.

Environment facts (verified):
- Dashboard `package.json`: `react ^19.2.0` (installed 19.2.4), `firebase ^12.10.0` (installed 12.10.0, with `@firebase/firestore` 4.12.0), `date-fns ^4.1.0` (4.1.0), `typescript ~5.9.3` (5.9.3), `typescript-eslint ^8.48.0` (8.56.1), `eslint-plugin-react-hooks ^7.0.1` (7.0.1), `react-leaflet ^5.0.0`, `leaflet.heat ^0.2.0`. Node is `v20.20.0`, so `structuredClone` is a global in tests.
- After cluster 01.1, the repo has `vitest` 4.1.11 and a `vitest.config.ts` (`environment: 'node'`, `include: ['src/**/*.test.{ts,tsx}']`). Tests live in `src/lib/__tests__/` and import `describe`/`it`/`expect` explicitly from `vitest`; globals are off.
- `tsconfig.app.json` sets these options:
  - `"strict": false`, so `strictNullChecks` is off. To `tsc`, `number | null` behaves like `number`, and missing null checks are NOT flagged. Accessing `.toDate` on a `number` IS still a hard error (TS2339), which is why Step 2 must land before Step 3.
  - `"verbatimModuleSyntax": true`: type-only imports must use `import type`.
  - `"erasableSyntaxOnly": true`: no parameter properties and no enums. The test's `FakeTimestamp` therefore declares its fields explicitly.
  - `"include": ["src"]`: test files are type-checked by `tsc -b`.
- `eslint.config.js` extends `tseslint.configs.recommended`, so `@typescript-eslint/no-explicit-any` is an error. New code uses `unknown` plus narrowing. Every `// eslint-disable-next-line @typescript-eslint/no-explicit-any` (or `eslint-disable-line`) whose `any` line is deleted is deleted with it; a leftover would raise an "unused eslint-disable directive" warning.
- The Firestore SDK `Timestamp` is `class Timestamp` at `node_modules/@firebase/firestore/dist/common-091f2944.esm.js:1271`. Its constructor sets own data fields (`:1319` `this.seconds = e, this.nanoseconds = t`). `toDate()` (`:1332`) and `toMillis()` (`:1341-1342`, `1e3 * this.seconds + this.nanoseconds / N`) are prototype methods. IndexedDB's structured clone keeps the own fields and drops the prototype, so a stored row reads back as a plain `{ seconds, nanoseconds }` with no methods.
- IndexedDB at HEAD (`src/utils/db.ts:10-13`):
  - database `noise-pollution-db`, `DB_VERSION = 1`;
  - store `noise_readings`: `keyPath: 'id'`, indexes `timestamp` and `decibelLevel`;
  - store `sync_metadata`: `keyPath: 'key'`;
  - metadata keys in use: `lastSyncTime`, `firstSyncDone`, `cacheDownloaded` (`syncManager.ts:16-17`, `:75`).
  
  The `timestamp` index currently keys a plain object, which is not a valid IndexedDB key, so it holds no rows. `getLatestTimestamp` (`db.ts:100-133`) has no caller.
- Line endings: all nine existing files are LF in the index and the working tree (`git ls-files --eol`: `i/lf w/lf`). Write the two new files with LF. Several BEFORE blocks contain whitespace-only lines with trailing spaces (for example `db.ts:24`, `:31`; `syncManager.ts:88`, `:117`, `:126`, `:128`, `:139`; `NoiseMarkers.tsx:122`, `:143`, `:148`). They are reproduced exactly; do not let an editor strip them before matching.
- Production ground truth (2026-10-16 probe):
  - 3,374 `noise_readings` docs. `timestamp` is a Firestore Timestamp on all of them.
  - `createdAt` is on 602 (17.8%). `soundClass`, `soundType` and `confidence` are on 691 (20.5%).
  - `decibelLevel`, `latitude`, `longitude`, `locationName`, `userId` and `deviceInfo` are correctly typed on all docs.
  - `userEmail` is masked on 3,372 and missing on 2.
  - Exactly 12 keys exist across all docs. There are no nested `location` fields and no `'Both'` soundType.
  - Value RANGES (dB, lat/lng) were NOT probed (master report P8 is OPEN). The Step 4 acceptance check therefore compares row counts.
- The app's write shape (the contract; read only) has two writers:
  - The online writer, `APP:lib/services/firebase_service.dart:160-182`, writes:
    - `userId`;
    - `userEmail` (a masked label);
    - `decibelLevel`, `latitude`, `longitude`;
    - `locationName` (default `'Unknown Location'`);
    - `timestamp: FieldValue.serverTimestamp()`;
    - `createdAt: DateTime.now()`;
    - `deviceInfo: 'Mobile Device'`;
    - `soundClass`/`soundType`/`confidence`, each only when non-null.
  - The offline writer, `APP:lib/services/sync_service.dart:305-338`, writes `timestamp: Timestamp.fromDate(recording.timestamp)` and `userEmail: recording.userEmail ?? _auth.currentUser?.email`, which can be **null**.
  
  The app's coordinate default is Colombo (`APP:lib/screens/dashboard_screen.dart:71-72`, `6.9271`, `79.8612`); it never writes 0/0.
- Cluster dependencies:
  - 01 (the vitest harness) must have landed.
  - 03.2 has deleted `src/utils/cacheDownloader.ts` and `src/components/map/CacheStatus.tsx`. Both import `NoiseReading`, and neither is edited here.
  - No query shape changes anywhere in this cluster, and no index is added (master §2.1).

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| bug-1 | CONFIRMED (High) | The sync spreads `...doc.data()` (live `Timestamp` instances) into IndexedDB (`syncManager.ts:90-93`, `:119-125`, `:141-147`, `:247-250`; `db.ts:77-79`). Structured clone drops `toDate()`, so `exportHelpers.ts:61-63` and `:111-113` write `'Unknown'` on every row, and `NoiseMarkers.tsx:362-364` shows `'No timestamp'` in every reading popup. Step 2 routes every date read through one helper. Step 3 stores epoch ms. Step 4 rewrites the old rows. |
| bug-8 | UNVERIFIED (Medium, confidence high), part 1 only | The map date filter overwrites the server `timestamp` with the client-clock `createdAt` whenever `createdAt` exists (`NoiseMarkers.tsx:197-211`). Step 2 prefers `timestamp` and falls back to `createdAt` only when `timestamp` is unusable. Parts 2–3 (the frozen range end and the day boundaries in `DateRangeFilter.tsx:50-58`) are cluster 09.2. |
| bug-13 | UNVERIFIED (Low) | `NoiseTrendChart.tsx:25`/`:52` and `DataTable.tsx:53`/`:80` map a missing timestamp to `new Date(0)`, so 1970 appears in the trend and the table. Step 2: the trend skips undated readings and the table shows `—`. |
| priv-5 | UNVERIFIED (Low, confidence high) | `NoiseMarkers.tsx:145` `console.warn('Invalid location data for reading:', reading.id, reading)` dumps the whole cached doc (author label, uid, GPS) on every filter recompute; `:151` logs per reading too. Step 2 deletes both. |
| sec-1 | CONFIRMED (High), dashboard ingest half only | Any registrant can write a malformed `noise_readings` doc. The dashboard caches it unvalidated, and a map-typed `soundClass` then crashes React at `CategoryChart.tsx:220`. Step 3 adds `normalizeReading()` at the IndexedDB boundary, which drops docs whose `userId`, `decibelLevel`, `latitude`/`longitude`, `soundClass`, `locationName` or `userEmail` have the wrong type. The rules half is cluster 02.2; the render-side error boundaries are 08.2. |
| arch-4 | UNVERIFIED (Low, confidence medium) | `openDB()` (`db.ts:18-41`) opens a new connection on every helper call, never closes one, and has no `onversionchange`/`onblocked` handling. A `DB_VERSION` bump would hang behind any other open tab. Step 1 caches one connection and handles both events. It must precede Step 4 (master §3.2). |
| priv-1 | PARTIAL (High), one-time purge only | v1 caches keep rows deleted or anonymized in Firestore, and (in browsers that synced before 2026-09-09) raw `userEmail` values at rest. Step 4 bumps the schema to v2 and purges every v1 store plus the sync metadata, forcing one normalized full re-fetch per browser. The bounded staleness (a periodic full replace) is 05.2; the sign-out clearing (priv-4) is 05.7. |

Full finding text and verifier evidence: grep the IDs in `audit/00_MASTER_AUDIT_REPORT.md`, `audit/01_BUGS_AND_CORRECTNESS.md` (bug-1, bug-8, bug-13), `audit/03_CROSS_REPO_CONTRACT_AUDIT.md` (field contract), `audit/05_SECURITY_AUDIT.md` (sec-1, priv-1, priv-5) and `audit/06_ARCHITECTURE_AND_CODE_QUALITY.md` (arch-4).

---

## Pre-reading

Open these files before touching anything:

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md`: these sections.
   - §2: conventions 2.1 (index rule), 2.4 (read-only browser), 2.10 (stored-reading shape), 2.13 (logging) and 2.15 (tests never touch Firebase).
   - §3.2: hard dependencies 04.1 → 04.4 and 04.2 → 04.3.
   - §4.3 and §4.4: the target type, the version bump, and the hand-off to 05.
   - §4.6 and §4.7: later merges on `NoiseMarkers`, `exportHelpers` and `DataTable`.
   - §4.15: never push between 04.4 and the end of 05.
   - §5: commits #10–#13.
2. `src/utils/db.ts`: the whole file (215 lines).
3. `src/utils/syncManager.ts`: the whole file (267 lines). Only the four doc-mapping sites change. The `cacheDownloaded` branch logic, the query shapes and the sync algorithm stay as they are (cluster 05).
4. `src/types/NoiseReading.ts`: the whole file (26 lines).
5. `src/utils/exportHelpers.ts`: the whole file (207 lines).
6. `src/components/map/NoiseMarkers.tsx`: the whole file (374 lines).
7. `src/components/map/HeatmapLayer.tsx`: the whole file (95 lines).
8. `src/components/analytics/DataTable.tsx`: lines 1-135 and 222-285.
9. `src/components/analytics/NoiseTrendChart.tsx`: lines 1-113.
10. `src/components/analytics/SoundTypeChart.tsx`: lines 14-60.
11. `vitest.config.ts` and `src/lib/__tests__/utils.test.ts` (both from 01.1), for the test conventions.
12. READ ONLY, the APP contract: `APP:lib/services/firebase_service.dart:150-183` and `APP:lib/services/sync_service.dart:305-338`. This is what `normalizeReading()` must accept.

---

## Steps

### Step 1 — arch-4: one cached IndexedDB connection with versionchange/blocked handling

**Goal:** Every helper in `db.ts` shares ONE `IDBDatabase` per page instead of leaking a new connection per call. When another tab upgrades the schema, this tab closes its connection (`onversionchange`) and reopens on the next call. When this tab's own upgrade is blocked by a tab that does not release (an older build), the open rejects at once with a user-readable "close other dashboard tabs" error (`DbBlockedError`) instead of never settling. That rejection stops a sync before it fetches anything from Firestore. A failed open is never cached. `DB_VERSION` stays 1, and no other behaviour changes. This is the precondition for Step 4's version bump.

**Files:**
- `src/utils/db.ts`

**Exact changes**

1a. Replace `openDB()` with a cached, version-change-aware open.

BEFORE (`src/utils/db.ts`, lines 15-41, verbatim):
```ts
/**
 * Open IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create noise readings store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('decibelLevel', 'decibelLevel', { unique: false });
      }
      
      // Create sync metadata store
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
```

AFTER:
```ts
/**
 * Message of the error openDB() rejects with when another open dashboard
 * tab blocks a schema upgrade. It is written for the user and can be shown
 * as-is.
 */
export const DB_BLOCKED_MESSAGE =
  'Close other dashboard tabs to finish the update, then reload this page.';

/** The rejection of openDB() while another tab blocks a schema upgrade. */
export class DbBlockedError extends Error {
  constructor() {
    super(DB_BLOCKED_MESSAGE);
    this.name = 'DbBlockedError';
  }
}

/**
 * One shared connection per page (arch-4). Every helper below awaits
 * openDB(). It used to open a new connection on every call and never close
 * one, so a DB_VERSION bump would hang behind the leaked connections of any
 * other open tab.
 */
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * True while an upgrade request that reported `blocked` is still pending.
 * IndexedDB queues every later open behind it, so a new request would wait
 * silently instead of reporting `blocked` itself: fail fast instead.
 */
let blockedUpgradePending = false;

/**
 * Drop the cached connection promise if it is still the given one, so the
 * next openDB() call opens a fresh connection.
 */
function forget(promise: Promise<IDBDatabase>): void {
  if (dbPromise === promise) {
    dbPromise = null;
  }
}

/**
 * Open IndexedDB database (one cached connection per page)
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  if (blockedUpgradePending) {
    return Promise.reject(new DbBlockedError());
  }

  let blocked = false;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create noise readings store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('decibelLevel', 'decibelLevel', { unique: false });
      }
      
      // Create sync metadata store
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        // The caller already got DbBlockedError. The upgrade went through
        // once the other tabs closed; release this late connection so the
        // next openDB() starts clean.
        blockedUpgradePending = false;
        db.close();
        return;
      }
      // Another tab wants to upgrade the schema: release this connection so
      // its upgrade is not blocked. The next call reopens.
      db.onversionchange = () => {
        db.close();
        forget(opening);
      };
      // The browser closed the connection itself (site data cleared, storage
      // error). The next call reopens.
      db.onclose = () => forget(opening);
      resolve(db);
    };
    request.onerror = () => {
      if (blocked) {
        blockedUpgradePending = false;
      }
      reject(request.error);
    };
    request.onblocked = () => {
      // A tab still holds a connection at the old version and did not
      // release it (a build from before this change has no onversionchange
      // handler). Fail visibly instead of leaving every caller waiting.
      blocked = true;
      blockedUpgradePending = true;
      reject(new DbBlockedError());
    };
  });

  dbPromise = opening;
  // Any failure (error, blocked, IndexedDB unavailable) clears the cache, so
  // the next call retries instead of returning the same rejection forever.
  opening.catch(() => forget(opening));
  return opening;
}
```

Placement notes:
- The `request.onupgradeneeded` block (HEAD lines 22-36) is carried over byte-for-byte, at the same 4-space indentation. That includes its two whitespace-only lines with six trailing spaces. Step 4 anchors on this exact block.
- `DB_BLOCKED_MESSAGE`, `DbBlockedError`, `dbPromise`, `blockedUpgradePending` and `forget()` sit where the old `openDB()` doc comment began, directly after the `SYNC_STORE_NAME` constant.
- Every exported helper below `openDB()` stays byte-identical except for the `getSyncMetadata` catch in 1b. Each still calls `await openDB()` and gets the shared connection.

1b. `getSyncMetadata` must not turn an open that cannot complete into "never synced".

Today it swallows every error and returns `null`. `syncNewReadings` reads `firstSyncDone` through it, so a `null` there would make a blocked browser run the first-sync FULL Firestore fetch (about 3,374 reads) on every load, and then fail to store it. Two errors must propagate instead:
- `DbBlockedError`;
- a `VersionError`, which a stale tab gets after another tab upgraded the schema.

Every other error keeps the old log-and-return-null behaviour.

BEFORE (`src/utils/db.ts`, lines 151-153, verbatim):
```ts
  } catch (error) {
    console.error('Error getting sync metadata:', error);
    return null;
```

AFTER:
```ts
  } catch (error) {
    // An open that cannot complete (a blocked upgrade, or a newer schema
    // already opened by another tab) must stop the sync before it fetches
    // anything. Returning null here would make syncNewReadings treat the
    // browser as never synced and run a full Firestore fetch it then cannot
    // store.
    if (error instanceof DbBlockedError || (error instanceof DOMException && error.name === 'VersionError')) {
      throw error;
    }
    console.error('Error getting sync metadata:', error);
    return null;
```

Placement note: the closing `  }` of the `catch` and the closing `}` of the function stay unchanged below this block. `DbBlockedError` is declared above `openDB()`, so it is in scope here.

**Edge cases to preserve**
- Helper error behaviour is otherwise unchanged:
  - `getAllReadings`, `getLatestTimestamp` and `getReadingsCount` still catch and return `[]`/`0`/`0`;
  - `getSyncMetadata` still returns `null` for every error except the two above;
  - `setManyReadings`, `setSyncMetadata` and `clearAllReadings` still rethrow.
- How a blocked open surfaces:
  - `syncNewReadings` throws before any `getDocs`, so `useSyncedReadings().error` is set;
  - `SyncStatus` shows its error state, because `getSyncStatus` → `getLastSyncTime` now rejects;
  - 05.4 later renders `error.message`.
  
  Do not add UI in this step.
- `forget()` clears the cache only if it still holds the promise that failed or closed, so a newer connection opened in the meantime is never dropped.
- `opening.catch(() => forget(opening))` covers every rejection path, including `indexedDB.open` throwing synchronously when IndexedDB is unavailable (some private modes). It returns a handled derived promise, so callers still receive the rejection and nothing is reported as unhandled.
- The `blocked` flag makes a late `onsuccess` close the connection. An upgrade that was blocked completes once the other tab closes; nothing holds that connection, so it must not leak.
- `blockedUpgradePending` makes every `openDB()` call reject with `DbBlockedError` at once while a blocked upgrade request is still pending. IndexedDB processes opens for one database in order, so a second request would sit behind the first without ever firing its own `blocked` event, and its caller would hang. The flag clears when that request finally succeeds or fails, and the next call then opens normally.
- Race, accepted: a helper that took the shared connection a moment before another tab's upgrade closed it gets an `InvalidStateError` from `db.transaction(...)`. It propagates like any other IndexedDB error, and the next call reopens. This happens only during a cross-tab upgrade.
- A tab whose connection was closed by a newer build's upgrade reopens at its own (older) `DB_VERSION` and gets a `VersionError`. Its sync stops (1b), the other helpers log the error, and a reload fixes it. Do not catch or downgrade it.
- Do not close the connection after each call, and do not add `onabort`/`oncomplete` plumbing. One long-lived connection per page is the intended design.
- No version bump here; `DB_VERSION` stays `1`.

**Acceptance criteria**
- With `npm run dev` running, sign in and open `/map` in tab A.
- Open `http://localhost:5173/vite.svg` in tab B. It is the same origin and runs no app code. In tab B's console run:
  ```js
  const r = indexedDB.open('noise-pollution-db', 99);
  r.onblocked = () => console.log('BLOCKED');
  r.onupgradeneeded = () => { console.log('upgrade reached; aborting'); r.transaction.abort(); };
  r.onerror = (e) => { e.preventDefault(); console.log('aborted as intended:', r.error && r.error.name); };
  ```
  Expect `upgrade reached; aborting` and then `aborted as intended: AbortError`, with NO `BLOCKED`. Tab A released its connection on `versionchange`.
  
  On HEAD, the same snippet prints `BLOCKED` and stays pending. The aborted upgrade leaves the database at version 1 with every row intact (check Application → IndexedDB).
- Back in tab A, press **Sync**. It succeeds, because the helper reopened. Then navigate to `/dashboard` and `/analytics`: both render the cached readings exactly as before.
- No new console errors or warnings during normal navigation.

**Verify**
```
npx tsc -b
npx eslint src/utils/db.ts
```
Manual: the acceptance checks above. Do NOT press "Fetch All Readings" to test; it costs about 3,374 reads. Do NOT run `npm run build` in this step.

**Commit title:** `fix(idb): reuse one IndexedDB connection and handle versionchange and blocked upgrades (arch-4)`

---

### Step 2 — bug-1, bug-8 (part 1), bug-13, priv-5: shared `toDate`/`getCoordinates` helpers used by every consumer

**Goal:**
- Create `src/lib/readings.ts`. It holds the ONLY date and coordinate parsers in the dashboard, and it is unit-tested. It reads every shape a stored reading can hold today:
  - a live Timestamp;
  - a structure-cloned `{ seconds, nanoseconds }`;
  - epoch ms;
  - an ISO string;
  - a Date.
- Point every consumer at it: the CSV and JSON exports, the map popup, the map date filter, the map marker and heatmap coordinates, the DataTable and the trend chart.
- Results:
  - Exports and popups show real dates (bug-1).
  - The map filter decides by the server `timestamp` (bug-8, part 1).
  - Undated readings no longer become 1970 (bug-13).
  - The per-reading console dump is gone (priv-5).
- `NoiseReading` is NOT changed in this step. The helpers take `unknown`-typed fields, so they work on both the current type and the Step 3 type.

**Files:**
- `src/lib/readings.ts` (new)
- `src/lib/__tests__/readings.test.ts` (new)
- `src/utils/exportHelpers.ts`
- `src/components/map/NoiseMarkers.tsx`
- `src/components/map/HeatmapLayer.tsx`
- `src/components/analytics/DataTable.tsx`
- `src/components/analytics/NoiseTrendChart.tsx`
- `src/utils/db.ts` (`getLatestTimestamp` only)

**Exact changes**

2a. New file `src/lib/readings.ts` — full contents:
```ts
/**
 * Shared helpers for reading fields (cluster 04).
 *
 * Every date and coordinate read in the dashboard goes through this module.
 * Rows come back from IndexedDB as structured clones. A clone keeps a
 * Firestore Timestamp's own fields ({ seconds, nanoseconds }) but drops its
 * prototype, so `.toDate()` is gone after the round-trip (bug-1). From 04.3
 * on, the sync stores epoch-ms numbers instead; these helpers read every
 * shape either way.
 *
 * Nothing outside this file may call `.toDate()` or read `.seconds` on a
 * reading field (master playbook convention 2.10).
 *
 * Pure module: no Firebase import, so it is safe to unit-test (convention
 * 2.15).
 */

/** Largest |epoch ms| a JavaScript Date can hold; beyond it, Invalid Date. */
const MAX_DATE_MS = 8.64e15;

export interface LatLng {
  lat: number;
  lng: number;
}

/** The coordinate fields a reading may carry. */
export interface CoordinateFields {
  latitude?: unknown;
  longitude?: unknown;
  /** Legacy nested shape, still declared on NoiseReading until 04.3. */
  location?: unknown;
}

/** The date fields a reading may carry. */
export interface DateFields {
  timestamp?: unknown;
  createdAt?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validMillis(ms: unknown): number | null {
  return isFiniteNumber(ms) && Math.abs(ms) <= MAX_DATE_MS ? ms : null;
}

function validLatLng(lat: unknown, lng: unknown): LatLng | null {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return null;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat, lng };
}

/**
 * Epoch milliseconds for any timestamp shape a reading field can hold, or
 * null when the value is missing or unparseable:
 * - a number (epoch ms; the stored shape from 04.3 on),
 * - an ISO-8601 string,
 * - a Date,
 * - a Firestore Timestamp, live or structured-cloned ({ seconds, nanoseconds }),
 * - any other object with toMillis() or toDate().
 * Never returns a value that would make an Invalid Date.
 */
export function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return validMillis(value);
  }
  if (typeof value === 'string') {
    return value.trim() === '' ? null : validMillis(Date.parse(value));
  }
  if (value instanceof Date) {
    return validMillis(value.getTime());
  }
  if (typeof value === 'object') {
    const ts = value as {
      seconds?: unknown;
      nanoseconds?: unknown;
      toMillis?: unknown;
      toDate?: unknown;
    };
    if (isFiniteNumber(ts.seconds)) {
      const nanos = isFiniteNumber(ts.nanoseconds) ? ts.nanoseconds : 0;
      return validMillis(ts.seconds * 1000 + Math.floor(nanos / 1e6));
    }
    if (typeof ts.toMillis === 'function') {
      return validMillis(ts.toMillis());
    }
    if (typeof ts.toDate === 'function') {
      const date: unknown = ts.toDate();
      return date instanceof Date ? validMillis(date.getTime()) : null;
    }
  }
  return null;
}

/** A Date for any timestamp shape (see toMillis), or null. Never an Invalid Date. */
export function toDate(value: unknown): Date | null {
  const ms = toMillis(value);
  return ms === null ? null : new Date(ms);
}

/**
 * The date a reading is shown, sorted and filtered by: the server
 * `timestamp`, falling back to the client-clock `createdAt` only when
 * `timestamp` is missing or unparseable (bug-8). Every production doc has a
 * `timestamp`; `createdAt` is on only 17.8% of them.
 */
export function getReadingDate(reading: DateFields): Date | null {
  return toDate(reading.timestamp) ?? toDate(reading.createdAt);
}

/**
 * A reading's coordinates as finite, in-range numbers, or null when it has
 * none. The flat `latitude`/`longitude` fields the app writes come first
 * (all 3,374 production docs are flat).
 */
export function getCoordinates(reading: CoordinateFields): LatLng | null {
  const flat = validLatLng(reading.latitude, reading.longitude);
  if (flat) {
    return flat;
  }
  // Legacy nested { latitude, longitude } shape, still declared on
  // NoiseReading. No app version writes it; 04.3 deletes this branch
  // together with the `location` field.
  const loc = reading.location;
  if (loc && typeof loc === 'object') {
    const nested = loc as { latitude?: unknown; longitude?: unknown };
    return validLatLng(nested.latitude, nested.longitude);
  }
  return null;
}
```

Placement note: the module imports nothing. Step 3 adds one `import type` and `normalizeReading()`. `MAX_DATE_MS` keeps `toDate()` from ever returning an Invalid Date. An Invalid Date would make date-fns `format` throw `RangeError`, which is one of the sec-1 crash sinks.

2b. New file `src/lib/__tests__/readings.test.ts` — full contents:
```ts
import { describe, expect, it } from 'vitest';
import { getCoordinates, getReadingDate, toDate, toMillis } from '@/lib/readings';

// Stand-in for the Firestore SDK Timestamp: its data lives in own fields and
// its methods on the prototype. A structured clone (what IndexedDB does on
// put) keeps the fields and drops the methods, which is the bug-1 root
// cause. No Firebase import (convention 2.15).
class FakeTimestamp {
  readonly seconds: number;
  readonly nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1e6;
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }
}

const MS = Date.UTC(2026, 9, 15, 10, 30, 0); // 2026-10-15T10:30:00.000Z
const SECONDS = MS / 1000;

describe('toMillis', () => {
  it('passes finite epoch-ms numbers through', () => {
    expect(toMillis(MS)).toBe(MS);
    expect(toMillis(0)).toBe(0);
  });

  it('reads a live Timestamp', () => {
    expect(toMillis(new FakeTimestamp(SECONDS, 0))).toBe(MS);
  });

  it('reads a Timestamp after an IndexedDB structured clone (bug-1)', () => {
    const cloned: unknown = structuredClone(new FakeTimestamp(SECONDS, 250_000_000));
    expect(cloned).not.toBeInstanceOf(FakeTimestamp);
    expect(toMillis(cloned)).toBe(MS + 250);
  });

  it('reads a plain { seconds, nanoseconds } object', () => {
    expect(toMillis({ seconds: SECONDS, nanoseconds: 999_999 })).toBe(MS);
    expect(toMillis({ seconds: SECONDS })).toBe(MS);
  });

  it('reads Dates and ISO strings', () => {
    expect(toMillis(new Date(MS))).toBe(MS);
    expect(toMillis('2026-10-15T10:30:00.000Z')).toBe(MS);
  });

  it('reads any other object with toMillis() or toDate()', () => {
    expect(toMillis({ toMillis: () => MS })).toBe(MS);
    expect(toMillis({ toDate: () => new Date(MS) })).toBe(MS);
  });

  it('returns null for missing or unparseable values', () => {
    const values: unknown[] = [
      null,
      undefined,
      '',
      '   ',
      'not a date',
      NaN,
      Infinity,
      -Infinity,
      true,
      {},
      [],
      new Date('not a date'),
      { seconds: 'x' },
      { toDate: () => 'x' },
    ];
    for (const value of values) {
      expect(toMillis(value)).toBeNull();
    }
  });

  it('returns null outside the Date range instead of an Invalid Date (sec-1)', () => {
    expect(toMillis({ seconds: 1e15, nanoseconds: 0 })).toBeNull();
    expect(toMillis(9e15)).toBeNull();
  });
});

describe('toDate', () => {
  it('returns a Date for a parseable value', () => {
    expect(toDate(new FakeTimestamp(SECONDS, 0))?.getTime()).toBe(MS);
    expect(toDate(MS)?.toISOString()).toBe('2026-10-15T10:30:00.000Z');
  });

  it('returns null instead of 1 Jan 1970 for a missing value (bug-13)', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('garbage')).toBeNull();
  });
});

describe('getReadingDate', () => {
  const CREATED = MS - 60_000;

  it('prefers the server timestamp over the client createdAt (bug-8)', () => {
    expect(getReadingDate({ timestamp: MS, createdAt: CREATED })?.getTime()).toBe(MS);
    expect(
      getReadingDate({
        timestamp: new FakeTimestamp(SECONDS, 0),
        createdAt: new FakeTimestamp(CREATED / 1000, 0),
      })?.getTime(),
    ).toBe(MS);
  });

  it('falls back to createdAt only when timestamp is missing or unparseable', () => {
    expect(getReadingDate({ timestamp: null, createdAt: CREATED })?.getTime()).toBe(CREATED);
    expect(getReadingDate({ createdAt: CREATED })?.getTime()).toBe(CREATED);
    expect(getReadingDate({ timestamp: 'garbage', createdAt: CREATED })?.getTime()).toBe(CREATED);
  });

  it('returns null when neither field is usable', () => {
    expect(getReadingDate({})).toBeNull();
    expect(getReadingDate({ timestamp: null, createdAt: null })).toBeNull();
  });
});

describe('getCoordinates', () => {
  it('returns flat finite latitude/longitude', () => {
    expect(getCoordinates({ latitude: 6.9271, longitude: 79.8612 })).toEqual({ lat: 6.9271, lng: 79.8612 });
    expect(getCoordinates({ latitude: 0, longitude: 0 })).toEqual({ lat: 0, lng: 0 });
  });

  it('rejects missing, non-numeric, non-finite and out-of-range values', () => {
    expect(getCoordinates({})).toBeNull();
    expect(getCoordinates({ latitude: 6.9271 })).toBeNull();
    expect(getCoordinates({ latitude: '6.9271', longitude: 79.8612 })).toBeNull();
    expect(getCoordinates({ latitude: NaN, longitude: 79.8612 })).toBeNull();
    expect(getCoordinates({ latitude: 6.9271, longitude: Infinity })).toBeNull();
    expect(getCoordinates({ latitude: 91, longitude: 79.8612 })).toBeNull();
    expect(getCoordinates({ latitude: 6.9271, longitude: -181 })).toBeNull();
  });
});
```

Placement note: `FakeTimestamp` stands in for the SDK class, so the test imports no Firebase module (convention 2.15). `structuredClone` reproduces exactly what `store.put()` does to a `Timestamp`. That is the regression test for bug-1's root cause. The test objects never pass a `location` key, so they still type-check after Step 3 removes it from `CoordinateFields`.

2c. `src/utils/exportHelpers.ts`: import the helpers.

BEFORE (`src/utils/exportHelpers.ts`, lines 1-3, verbatim):
```ts
import type { NoiseReading } from '@/types/NoiseReading';
import type { UserInfo } from '@/services/userService';
import { format } from 'date-fns';
```

AFTER:
```ts
import type { NoiseReading } from '@/types/NoiseReading';
import type { UserInfo } from '@/services/userService';
import { format } from 'date-fns';
import { getCoordinates, getReadingDate } from '@/lib/readings';
```

2d. `src/utils/exportHelpers.ts`: CSV coordinates and timestamp.

BEFORE (`src/utils/exportHelpers.ts`, lines 28-63, verbatim):
```ts
  const rows = data.map(reading => {
    // Extract latitude and longitude from various formats
    let lat: number | string = '';
    let lng: number | string = '';

    if (reading.latitude && reading.longitude) {
      // Flat structure
      lat = reading.latitude;
      lng = reading.longitude;
    } else if (reading.location) {
      const loc = reading.location as {
        latitude?: number;
        longitude?: number;
        lat?: number;
        lng?: number;
        coordinates?: [number, number];
      };
      if ('latitude' in loc && 'longitude' in loc && loc.latitude && loc.longitude) {
        // Nested { latitude, longitude }
        lat = loc.latitude;
        lng = loc.longitude;
      } else if ('lat' in loc && 'lng' in loc && loc.lat && loc.lng) {
        // Nested { lat, lng }
        lat = loc.lat;
        lng = loc.lng;
      } else if ('coordinates' in loc && loc.coordinates) {
        // GeoJSON format [lng, lat]
        lng = loc.coordinates[0];
        lat = loc.coordinates[1];
      }
    }

    // Format timestamp
    const timestamp = reading.timestamp?.toDate 
      ? format(reading.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss')
      : 'Unknown';
```

AFTER:
```ts
  const rows = data.map(reading => {
    // Coordinates through the shared helper (flat, finite, in-range only)
    const coords = getCoordinates(reading);
    const lat: number | string = coords ? coords.lat : '';
    const lng: number | string = coords ? coords.lng : '';

    // Format timestamp through the shared helper. Rows come back from
    // IndexedDB without Timestamp methods, so the old `.toDate` check was
    // always false and every row said 'Unknown' (bug-1).
    const timestamp = formatExportTimestamp(reading);
```

Everything from the blank line after `const timestamp = …` through the end of `exportToCSV` stays byte-identical. That includes `// Escape quotes in location name` and the `return [ … ].join(',');` row array, which still uses the `lat`, `lng` and `timestamp` names.

2e. `src/utils/exportHelpers.ts`: JSON timestamp and coordinates.

BEFORE (`src/utils/exportHelpers.ts`, lines 109-117, verbatim):
```ts
    readings: data.map(reading => ({
      id: reading.id,
      timestamp: reading.timestamp?.toDate 
        ? format(reading.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss')
        : 'Unknown',
      location: {
        name: reading.locationName || 'Unknown',
        coordinates: extractCoordinates(reading.location, reading.latitude, reading.longitude)
      },
```

AFTER:
```ts
    readings: data.map(reading => ({
      id: reading.id,
      timestamp: formatExportTimestamp(reading),
      location: {
        name: reading.locationName || 'Unknown',
        coordinates: extractCoordinates(reading)
      },
```

2f. `src/utils/exportHelpers.ts`: replace the multi-shape `extractCoordinates` with a helper-backed one, and add the shared export date formatter.

BEFORE (`src/utils/exportHelpers.ts`, lines 136-180, verbatim):
```ts
/**
 * Helper: Extract coordinates from various formats
 */
function extractCoordinates(
  location: {
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
    coordinates?: [number, number];
  } | null | undefined,
  latitude?: number,
  longitude?: number
): { latitude: number; longitude: number } | null {
  if (latitude && longitude) {
    return { latitude, longitude };
  }

  if (!location) {
    return null;
  }

  if ('latitude' in location && 'longitude' in location && location.latitude && location.longitude) {
    return {
      latitude: location.latitude,
      longitude: location.longitude
    };
  }

  if ('lat' in location && 'lng' in location && location.lat && location.lng) {
    return {
      latitude: location.lat,
      longitude: location.lng
    };
  }

  if ('coordinates' in location && location.coordinates) {
    return {
      latitude: location.coordinates[1],
      longitude: location.coordinates[0]
    };
  }

  return null;
}
```

AFTER:
```ts
/**
 * Helper: Format a reading's date for export ('Unknown' when it has none)
 */
function formatExportTimestamp(reading: NoiseReading): string {
  const date = getReadingDate(reading);
  return date ? format(date, 'yyyy-MM-dd HH:mm:ss') : 'Unknown';
}

/**
 * Helper: Extract coordinates through the shared getCoordinates helper
 */
function extractCoordinates(reading: NoiseReading): { latitude: number; longitude: number } | null {
  const coords = getCoordinates(reading);
  return coords ? { latitude: coords.lat, longitude: coords.lng } : null;
}
```

Placement note: both helpers are function declarations, so their position below `exportToJSON` is fine (they are hoisted). `getNoiseLevel` and `downloadFile` below them stay byte-identical.

2g. `src/components/map/NoiseMarkers.tsx`: import the helpers.

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 5-6, verbatim):
```tsx
import type { NoiseReading } from '@/types/NoiseReading';
import { format } from 'date-fns';
```

AFTER:
```tsx
import type { NoiseReading } from '@/types/NoiseReading';
import { format } from 'date-fns';
import { getCoordinates, getReadingDate } from '@/lib/readings';
```

2h. `src/components/map/NoiseMarkers.tsx`: location validation through `getCoordinates`, and both per-reading `console.warn` calls deleted (priv-5).

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 116-153, verbatim):
```tsx
  // Apply filters and validate data
  const filteredReadings = readings.filter(reading => {
    // Validate location exists (flat structure: latitude/longitude at root level)
    let isValidLocation = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = reading as any;
    
    // Check for flat structure (latitude/longitude at root level)
    if (typeof read.latitude === 'number' && typeof read.longitude === 'number') {
      isValidLocation = true;
    }
    // Check for nested structure (location.latitude/location.longitude)
    else if (reading.location) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loc = reading.location as any;
      if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
        isValidLocation = true;
      }
    }
    // Check for GeoJSON format (lat/lng at root level)
    else if (typeof read.lat === 'number' && typeof read.lng === 'number') {
      isValidLocation = true;
    }
    // Check for GeoJSON Point (coordinates array at root level)
    else if (Array.isArray(read.coordinates) && read.coordinates.length >= 2) {
      isValidLocation = true;
    }
    
    if (!isValidLocation) {
      console.warn('Invalid location data for reading:', reading.id, reading);
      return false;
    }
    
    // Validate decibel level
    if (typeof reading.decibelLevel !== 'number') {
      console.warn('Invalid decibel level for reading:', reading.id);
      return false;
    }
```

AFTER:
```tsx
  // Apply filters and validate data
  const filteredReadings = readings.filter(reading => {
    // Validate location: flat, finite, in-range latitude/longitude (shared
    // helper). Never log the reading here: it carries GPS and the author
    // label, and this runs on every render (priv-5, convention 2.13).
    if (!getCoordinates(reading)) {
      return false;
    }

    // Validate decibel level
    if (typeof reading.decibelLevel !== 'number') {
      return false;
    }
```

The dB filter and the category filter below this block stay byte-identical. The category filter's `(reading as any).soundCategory || …` is cluster 06.3's.

2i. `src/components/map/NoiseMarkers.tsx`: the date filter prefers `timestamp` (bug-8, part 1).

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 172-217, verbatim):
```tsx
    // Apply date filter
    if (filters?.dateRange) {
      let readingDate: Date | undefined;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const read = reading as any;
      
      // Handle Firestore Timestamp object from IndexedDB (stored as { seconds, nanoseconds })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const timestampAny = reading.timestamp as any;
      if (timestampAny?.seconds) {
        readingDate = new Date(timestampAny.seconds * 1000);
      }
      // Handle Firestore Timestamp with toDate() method
      else if (reading.timestamp?.toDate) {
        readingDate = reading.timestamp.toDate();
      }
      // Handle ISO string
      else if (typeof reading.timestamp === 'string') {
        readingDate = new Date(reading.timestamp);
      }
      // Handle numeric timestamp (milliseconds)
      else if (typeof reading.timestamp === 'number') {
        readingDate = new Date(reading.timestamp);
      }
      // Handle nested timestamp (createdAt, updatedAt, etc.)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createdAtAny = read.createdAt as any;
      if (createdAtAny?.seconds) {
        readingDate = new Date(createdAtAny.seconds * 1000);
      }
      else if (read.createdAt?.toDate) {
        readingDate = read.createdAt.toDate();
      }
      else if (typeof read.createdAt === 'string') {
        readingDate = new Date(read.createdAt);
      }
      else if (typeof read.createdAt === 'number') {
        readingDate = new Date(read.createdAt);
      }
      
      if (!readingDate || readingDate < filters.dateRange.start ||
          readingDate > filters.dateRange.end) {
        return false;
      }
    }
```

AFTER:
```tsx
    // Apply date filter. The server `timestamp` decides; the client-clock
    // `createdAt` is used only when `timestamp` is missing (bug-8).
    if (filters?.dateRange) {
      const readingDate = getReadingDate(reading);
      if (!readingDate || readingDate < filters.dateRange.start ||
          readingDate > filters.dateRange.end) {
        return false;
      }
    }
```

The user filter below this block (`// Apply user filter (Phase 1: …)`, with its own `const read = reading as any;`) stays byte-identical. 09.1 removes it.

2j. `src/components/map/NoiseMarkers.tsx`: marker coordinates through `getCoordinates`, and the popup date computed once per marker.

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 265-300, verbatim):
```tsx
      {filteredReadings.map((reading) => {
        // Extract coordinates - check flat structure first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const read = reading as any;
        let lat: number | undefined;
        let lng: number | undefined;

        // Flat structure (latitude/longitude at root level)
        if (typeof read?.latitude === 'number' && typeof read?.longitude === 'number') {
          lat = read.latitude;
          lng = read.longitude;
        }
        // Nested structure (location.latitude/location.longitude)
        else if (reading.location) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const loc = reading.location as any;
          if (typeof loc.latitude === 'number') {
            lat = loc.latitude;
            lng = loc.longitude;
          }
        }
        // GeoJSON format (lat/lng at root level)
        else if (typeof read?.lat === 'number' && typeof read?.lng === 'number') {
          lat = read.lat;
          lng = read.lng;
        }
        // GeoJSON Point (coordinates array at root level)
        else if (Array.isArray(read?.coordinates)) {
          lng = read.coordinates[0];
          lat = read.coordinates[1];
        }

        // Skip if no valid coordinates
        if (!lat || !lng) {
          return null;
        }
```

AFTER:
```tsx
      {filteredReadings.map((reading) => {
        // Coordinates and date through the shared helpers (bug-1)
        const coords = getCoordinates(reading);
        if (!coords) {
          return null;
        }
        const { lat, lng } = coords;
        const readingDate = getReadingDate(reading);
```

The following lines stay byte-identical: the blank line, `// Get category (check both soundCategory and soundClass)` and the `<Marker key={reading.id} position={[lat, lng] as LatLngExpression} …>` JSX. `lat` and `lng` are now `number`.

2k. `src/components/map/NoiseMarkers.tsx`: the popup timestamp (bug-1).

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 361-364, verbatim):
```tsx
                  <div className="text-xs text-gray-500 mt-3 pt-2 border-t">
                    {reading.timestamp?.toDate?.()
                      ? format(reading.timestamp.toDate(), 'MMM d, yyyy h:mm a')
                      : 'No timestamp'}
```

AFTER:
```tsx
                  <div className="text-xs text-gray-500 mt-3 pt-2 border-t">
                    {readingDate
                      ? format(readingDate, 'MMM d, yyyy h:mm a')
                      : 'No timestamp'}
```

`readingDate` is the constant 2j declares in the same `map` callback. The filter callback's `readingDate` in 2i is a different scope.

2l. `src/components/map/HeatmapLayer.tsx`: import the helper.

BEFORE (`src/components/map/HeatmapLayer.tsx`, lines 4-5, verbatim):
```ts
import 'leaflet.heat';
import type { NoiseReading } from '@/types/NoiseReading';
```

AFTER:
```ts
import 'leaflet.heat';
import type { NoiseReading } from '@/types/NoiseReading';
import { getCoordinates } from '@/lib/readings';
```

2m. `src/components/map/HeatmapLayer.tsx`: coordinates through `getCoordinates`. This removes the nested-`location` branch at HEAD `:40-41` and both `as any` casts.

BEFORE (`src/components/map/HeatmapLayer.tsx`, lines 29-56, verbatim):
```ts
      // Extract coordinates (support flat structure)
      const read = reading as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      let lat: number | undefined;
      let lng: number | undefined;

      // Flat structure (latitude/longitude at root level)
      if (typeof read?.latitude === 'number' && typeof read?.longitude === 'number') {
        lat = read.latitude;
        lng = read.longitude;
      }
      // Nested structure (location.latitude/location.longitude)
      else if (reading.location) {
        const loc = reading.location as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
          lat = loc.latitude;
          lng = loc.longitude;
        }
      }
      // GeoJSON format (lat/lng at root level)
      else if (typeof read?.lat === 'number' && typeof read?.lng === 'number') {
        lat = read.lat;
        lng = read.lng;
      }
      // GeoJSON Point (coordinates array)
      else if (Array.isArray(read?.coordinates) && read.coordinates.length >= 2) {
        lng = read.coordinates[0];
        lat = read.coordinates[1];
      }
```

AFTER:
```ts
      // Extract coordinates through the shared helper (flat, finite lat/lng)
      const coords = getCoordinates(reading);
      const lat = coords?.lat;
      const lng = coords?.lng;
```

The intensity block and the `return [lat || 0, lng || 0, intensity] …` / `.filter(…)` lines below stay byte-identical. The heatmap's own behaviour (intensity, 0 dB, placement) is cluster 09.

2n. `src/components/analytics/DataTable.tsx`: import the helper.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 13-14, verbatim):
```tsx
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

AFTER:
```tsx
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getReadingDate } from '@/lib/readings';
```

2o. `src/components/analytics/DataTable.tsx`: delete the local `toDate`.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 51-83, verbatim):
```tsx
  // Helper function to convert timestamp from Firebase or IndexedDB to Date
  function toDate(timestamp: unknown): Date {
    if (!timestamp) return new Date(0);
    
    // If it's already a Date
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // Cast to any for property access checks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ts = timestamp as any;
    
    // If it's a Firebase Timestamp with toDate() method
    if (typeof ts.toDate === 'function') {
      return ts.toDate();
    }
    
    // If it's a plain object with seconds (from IndexedDB)
    if (typeof ts === 'object' && 'seconds' in ts) {
      return new Date(ts.seconds * 1000);
    }
    
    // If it's a number (milliseconds)
    if (typeof ts === 'number') {
      return new Date(ts);
    }
    
    // Fallback
    return new Date(0);
  }

  // Sort and paginate data
```

AFTER:
```tsx
  // Sort and paginate data
```

2p. `src/components/analytics/DataTable.tsx`: sort by the shared date.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 91-93, verbatim):
```tsx
        case 'timestamp':
          aVal = toDate(a.timestamp).getTime();
          bVal = toDate(b.timestamp).getTime();
```

AFTER:
```tsx
        case 'timestamp':
          // A reading with no usable date sorts as 0 (last when descending)
          aVal = getReadingDate(a)?.getTime() ?? 0;
          bVal = getReadingDate(b)?.getTime() ?? 0;
```

2q. `src/components/analytics/DataTable.tsx`: show `—` instead of 1970 (bug-13).

BEFORE (`src/components/analytics/DataTable.tsx`, lines 230-238, verbatim):
```tsx
                  <TableCell className={cn('font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                    {toDate(reading.timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </TableCell>
```

AFTER:
```tsx
                  <TableCell className={cn('font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                    {getReadingDate(reading)?.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) ?? '—'}
                  </TableCell>
```

2r. `src/components/analytics/NoiseTrendChart.tsx`: import the helper.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 6-7, verbatim):
```tsx
import { format } from 'date-fns';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { format } from 'date-fns';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { getReadingDate } from '@/lib/readings';
```

2s. `src/components/analytics/NoiseTrendChart.tsx`: delete the local `toDate`.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 23-55, verbatim):
```tsx
  // Helper function to convert timestamp from Firebase or IndexedDB to Date
  function toDate(timestamp: unknown): Date {
    if (!timestamp) return new Date(0);
    
    // If it's already a Date
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // Cast to any for property access checks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ts = timestamp as any;
    
    // If it's a Firebase Timestamp with toDate() method
    if (typeof ts.toDate === 'function') {
      return ts.toDate();
    }
    
    // If it's a plain object with seconds (from IndexedDB)
    if (typeof ts === 'object' && 'seconds' in ts) {
      return new Date(ts.seconds * 1000);
    }
    
    // If it's a number (milliseconds)
    if (typeof ts === 'number') {
      return new Date(ts);
    }
    
    // Fallback
    return new Date(0);
  }

  // Group readings by time granularity
```

AFTER:
```tsx
  // Group readings by time granularity
```

2t. `src/components/analytics/NoiseTrendChart.tsx`: skip undated readings (bug-13).

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 61-63, verbatim):
```tsx
    readings.forEach((reading) => {
      const timestamp = toDate(reading.timestamp);
      let key: string;
```

AFTER:
```tsx
    readings.forEach((reading) => {
      const timestamp = getReadingDate(reading);
      // bug-13: a reading with no usable date is left out instead of being
      // bucketed to 1 Jan 1970
      if (!timestamp) {
        return;
      }
      let key: string;
```

The `switch (granularity)` body is unchanged: `timestamp` is now a non-null `Date`, so `format(timestamp, …)`, `getWeekNumber(timestamp)` and `timestamp.getFullYear()` keep working. The week-key bug (bug-3) is cluster 06.4.

2u. `src/utils/db.ts`: import `toMillis`. This line is unchanged by Step 1.

BEFORE (`src/utils/db.ts`, lines 8-8, verbatim):
```ts
import type { NoiseReading } from '@/types/NoiseReading';
```

AFTER:
```ts
import type { NoiseReading } from '@/types/NoiseReading';
import { toMillis } from '@/lib/readings';
```

2v. `src/utils/db.ts`: `getLatestTimestamp` reads through `toMillis`. Otherwise it would stop compiling at Step 3, where `.toDate` is called on a `number`. This block is HEAD lines 114-122, which sit at lines 203-211 once Step 1 and 2u are applied; neither changes its text.

BEFORE (`src/utils/db.ts`, lines 203-211 after Step 1 and 2u, verbatim):
```ts
          const reading = cursor.value as NoiseReading;
          // Handle both Timestamp objects and plain numbers
          const timestamp = reading.timestamp?.toDate?.() || reading.timestamp;
          const timestampNum = timestamp instanceof Date 
            ? timestamp.getTime() 
            : typeof timestamp === 'number' 
              ? timestamp 
              : 0;
          resolve(timestampNum);
```

AFTER:
```ts
          const reading = cursor.value as NoiseReading;
          // Shared helper: epoch ms from any stored timestamp shape
          resolve(toMillis(reading.timestamp) ?? 0);
```

**Edge cases to preserve**
- **One date rule everywhere.** The date is `timestamp`, and `createdAt` is used only when `timestamp` is missing or unparseable (`getReadingDate`). The popup, map filter, export, table and trend now agree. For the 602 docs carrying `createdAt`, the map filter changes from the client clock to the server clock; that is the bug-8 fix. The frozen range end and the day boundaries are NOT touched (09.2).
- **Coordinates.**
  - Only finite, in-range numbers count (`|lat| ≤ 90`, `|lng| ≤ 180`).
  - These shapes are no longer read: root-level `lat`/`lng`, root-level `coordinates`, and the export-only nested `location.lat/lng` and `location.coordinates`. No app version ever wrote them, and all 3,374 production docs are flat.
  - The nested `location.latitude/longitude` branch stays until Step 3 deletes the field.
  - A real `0` coordinate is now valid in `NoiseMarkers` and the exports. Before, it was dropped by truthiness. The app never writes 0/0.
  - `HeatmapLayer` keeps its `lat || 0` and `point[0] !== 0` quirk byte-identical. That is 09's to change.
- **Missing dates.**
  - The table shows `—`.
  - The trend skips the reading.
  - The popup keeps `'No timestamp'`.
  - Both exports keep `'Unknown'` in this step; 07.1 turns it into an empty cell.
  - Sorting by Timestamp still treats a missing date as 0, as `new Date(0)` did before.
- `date-fns` `format` never receives an Invalid Date. `toMillis` bounds every value to the Date range.
- `getReadingDate(reading)?.toLocaleString('en-US', {…})` keeps the exact options object, so the table's date format is unchanged.
- `NoiseMarkers` still drops a non-numeric `decibelLevel` silently (`typeof … !== 'number'`); only the log is gone. From Step 3 on, such docs never reach the cache.
- Do not touch these parts:
  - the `soundCategory || soundClass` precedence, `'Unknown'` labels and `confidence || 0` (06.3);
  - the `userMap`/'User Email' column (07.2);
  - the `onMarkersLoaded`/`onDataChange` props and the `NoiseMarkers` load effect (05.3, 09.1).
- `getLatestTimestamp` stays exported and unused. It becomes correct once Step 4 makes the index numeric. Deleting it is master §7's dead-code sweep.
- `src/lib/readings.ts` must stay free of Firebase imports. It takes `unknown`, and nothing in it depends on `NoiseReading` until Step 3.

**Acceptance criteria**
- `npx vitest run src/lib/__tests__/readings.test.ts`: 15 tests pass.
- With `npm run dev`, signed in:
  - **Analytics → Export CSV:** every row's `Timestamp` cell is a real `yyyy-MM-dd HH:mm:ss` date, with no `Unknown`. The `Latitude`/`Longitude` columns are unchanged.
  - **Export JSON:** every `readings[].timestamp` is a real date, and every `location.coordinates` is `{ latitude, longitude }`.
  - **Popups:** on `/map` and `/dashboard`, clicking any reading marker shows a date line (`MMM d, yyyy h:mm a`), never `No timestamp`.
  - **DataTable:** the Timestamp column shows dates. Sorting by Timestamp asc/desc orders them correctly. No `Jan 1, 1970` row exists.
  - **Trend chart:** Day view has no `1970-01-01` / `Jan 1` point.
  - **Map filter:** "Last 7 days" filters by server time.
  - **Console:** no `Invalid location data for reading` or `Invalid decibel level` messages.
- Every one of these greps prints nothing:
  ```
  grep -rnE "\.toDate\(|\.seconds\b" src | grep -vE "^src/lib/(readings\.ts|__tests__/)"
  grep -rn "Invalid location data\|Invalid decibel level" src
  grep -rn "function toDate" src | grep -v "^src/lib/readings.ts"
  grep -rn "reading\.location" src | grep -v "^src/lib/readings.ts"
  ```

**Verify**
```
npx vitest run src/lib/__tests__/readings.test.ts
npx tsc -b
npx eslint src/lib/readings.ts src/lib/__tests__/readings.test.ts src/utils/exportHelpers.ts src/utils/db.ts src/components/map/NoiseMarkers.tsx src/components/map/HeatmapLayer.tsx src/components/analytics/DataTable.tsx src/components/analytics/NoiseTrendChart.tsx
```
Manual: the acceptance checks and greps above. Stage by explicit path, never `git add -A`; `audit/`, `DEPLOYMENT_GUIDE.md` and `SESSION_39_SUMMARY.md` stay unstaged.

**Commit title:** `fix(readings): shared toDate/getCoordinates helpers fix 'Unknown' export and popup timestamps (bug-1, bug-8, bug-13, priv-5)`

---

### Step 3 — bug-1, sec-1: normalize at the IndexedDB boundary

**Goal:**
- Every Firestore doc passes through `normalizeReading()` before it is cached. That covers the first sync, both delta branches and `forceFullSync`.
- `normalizeReading()` turns the doc into a plain, whitelisted DTO:
  - epoch-ms `timestamp`/`createdAt`;
  - only the declared keys;
  - no `deviceInfo`.
- A doc no app version writes is dropped and only counted, never logged in full. Examples: a non-finite `decibelLevel`, non-numeric coordinates, or a map-typed `soundClass`. Such a doc can no longer reach a chart, table, popup or export, which is the dashboard half of sec-1.
- `NoiseReading` becomes the master §4.3 target type. The nested `location` union and the `'Both' | 'Unknown'` soundType members are deleted. `SoundTypeChart` loses its `'Both'` colour.
- Query shapes do not change.

**Files:**
- `src/types/NoiseReading.ts`
- `src/lib/readings.ts`
- `src/lib/__tests__/readings.test.ts`
- `src/utils/syncManager.ts`
- `src/components/analytics/SoundTypeChart.tsx`

**Exact changes**

3a. `src/types/NoiseReading.ts`: replace the whole file.

BEFORE (`src/types/NoiseReading.ts`, lines 1-26, verbatim — the whole file):
```ts
import { Timestamp } from 'firebase/firestore';

export interface NoiseReading {
  id: string;
  userId: string;
  decibelLevel: number;
  // Support both flat structure (mobile app) and nested structure
  latitude?: number;
  longitude?: number;
  location?: {
    latitude: number;
    longitude: number;
  } | {
    lat: number;
    lng: number;
  } | {
    coordinates: [number, number]; // [lng, lat]
  };
  locationName?: string;
  soundCategory?: string;
  soundClass?: string;  // Mobile app uses soundClass
  soundType?: 'Pollution' | 'Ambient' | 'Both' | 'Unknown';
  confidence: number;
  timestamp: Timestamp;
  createdAt?: Timestamp;
}
```

AFTER:
```ts
/**
 * A noise reading as the dashboard stores it in IndexedDB and holds in
 * memory. This is NOT the raw Firestore document: every doc passes through
 * normalizeReading() (src/lib/readings.ts) first. Firestore Timestamps
 * become epoch milliseconds, malformed docs are dropped, and only these keys
 * are kept (no deviceInfo, no unknown keys).
 */
export interface NoiseReading {
  id: string;
  userId: string;
  userEmail?: string;          // masked author label the app writes (sec-2); 07 displays it
  decibelLevel: number;        // finite; normalizeReading drops docs otherwise
  latitude: number;            // finite, -90..90; dropped otherwise
  longitude: number;           // finite, -180..180; dropped otherwise
  locationName?: string;
  soundCategory?: string;      // never written by any app version; kept ONLY until 06.3 removes it
  soundClass?: string;         // raw app value; absent = unclassified
  soundType?: 'Pollution' | 'Ambient';
  confidence?: number;         // absent when unclassified
  timestamp: number | null;    // epoch ms (server clock)
  createdAt?: number | null;   // epoch ms (client clock; on 17.8% of docs)
}
```

Placement note: the `import { Timestamp } from 'firebase/firestore';` line goes away. The type no longer names any SDK class. `soundCategory?: string` stays ONLY for 06.3 to delete, together with every `soundCategory ||` expression (master §4.3).

3b. `src/lib/readings.ts`: import the type. This anchors on Step 2's AFTER text.

BEFORE (`src/lib/readings.ts`, lines 18-18 as written by Step 2, verbatim):
```ts
/** Largest |epoch ms| a JavaScript Date can hold; beyond it, Invalid Date. */
```

AFTER:
```ts
import type { NoiseReading } from '@/types/NoiseReading';

/** Largest |epoch ms| a JavaScript Date can hold; beyond it, Invalid Date. */
```

3c. `src/lib/readings.ts`: drop `location` from `CoordinateFields`. This anchors on Step 2's AFTER text.

BEFORE (`src/lib/readings.ts`, lines 28-34 after 3b, verbatim):
```ts
/** The coordinate fields a reading may carry. */
export interface CoordinateFields {
  latitude?: unknown;
  longitude?: unknown;
  /** Legacy nested shape, still declared on NoiseReading until 04.3. */
  location?: unknown;
}
```

AFTER:
```ts
/** The coordinate fields a reading (or a raw Firestore doc) may carry. */
export interface CoordinateFields {
  latitude?: unknown;
  longitude?: unknown;
}
```

3d. `src/lib/readings.ts`: drop the dead nested-`location` branch from `getCoordinates`, then add `normalizeReading()` at the end of the file. This anchors on Step 2's AFTER text; the block runs to the end of the file.

BEFORE (`src/lib/readings.ts`, lines 119-138 after 3b–3c, verbatim):
```ts
/**
 * A reading's coordinates as finite, in-range numbers, or null when it has
 * none. The flat `latitude`/`longitude` fields the app writes come first
 * (all 3,374 production docs are flat).
 */
export function getCoordinates(reading: CoordinateFields): LatLng | null {
  const flat = validLatLng(reading.latitude, reading.longitude);
  if (flat) {
    return flat;
  }
  // Legacy nested { latitude, longitude } shape, still declared on
  // NoiseReading. No app version writes it; 04.3 deletes this branch
  // together with the `location` field.
  const loc = reading.location;
  if (loc && typeof loc === 'object') {
    const nested = loc as { latitude?: unknown; longitude?: unknown };
    return validLatLng(nested.latitude, nested.longitude);
  }
  return null;
}
```

AFTER:
```ts
/**
 * A reading's coordinates as finite, in-range numbers, or null when it has
 * none. Only the flat `latitude`/`longitude` fields the app writes count:
 * all 3,374 production docs are flat, and the nested `location` shape (never
 * written by any app version) left NoiseReading in 04.3.
 */
export function getCoordinates(reading: CoordinateFields): LatLng | null {
  return validLatLng(reading.latitude, reading.longitude);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

/**
 * Map one raw Firestore document onto the plain NoiseReading DTO that the
 * dashboard stores in IndexedDB and renders (bug-1, sec-1).
 *
 * Returns null, so the doc is never cached or rendered, for a doc no app
 * version writes:
 * - `userId` is not a string;
 * - `decibelLevel` is not a finite number;
 * - `latitude`/`longitude` are not finite, in-range numbers;
 * - `soundClass`, `locationName` or `userEmail` is present but not a string
 *   (null counts as absent: the app's offline path can write a null
 *   `userEmail`).
 *
 * Otherwise `timestamp` and `createdAt` become epoch ms (`timestamp` is null
 * when unparseable; `createdAt` is omitted), and only keys declared on
 * NoiseReading are copied. `soundType` survives only as 'Pollution' or
 * 'Ambient', `confidence` only as a finite number. `deviceInfo` and any
 * unknown key are dropped. `soundCategory` is never copied: no app version
 * writes it.
 */
export function normalizeReading(id: string, data: Record<string, unknown>): NoiseReading | null {
  const { userId, decibelLevel, locationName, soundClass, soundType, confidence, userEmail } = data;

  if (typeof userId !== 'string' || !isFiniteNumber(decibelLevel)) {
    return null;
  }
  const coords = getCoordinates(data);
  if (!coords) {
    return null;
  }
  if (!isOptionalString(soundClass) || !isOptionalString(locationName) || !isOptionalString(userEmail)) {
    return null;
  }

  const reading: NoiseReading = {
    id,
    userId,
    decibelLevel,
    latitude: coords.lat,
    longitude: coords.lng,
    timestamp: toMillis(data.timestamp),
  };

  const createdAt = toMillis(data.createdAt);
  if (createdAt !== null) {
    reading.createdAt = createdAt;
  }
  if (typeof locationName === 'string') {
    reading.locationName = locationName;
  }
  if (typeof soundClass === 'string') {
    reading.soundClass = soundClass;
  }
  if (soundType === 'Pollution' || soundType === 'Ambient') {
    reading.soundType = soundType;
  }
  if (isFiniteNumber(confidence)) {
    reading.confidence = confidence;
  }
  if (typeof userEmail === 'string') {
    reading.userEmail = userEmail;
  }
  return reading;
}
```

Placement notes:
- `normalizeReading` takes `Record<string, unknown>`. `doc.data()` returns `DocumentData` (`{ [field: string]: any }`), which is assignable to it, so `syncManager` needs no cast.
- `createdAt` is omitted, rather than stored as `null`, when it is absent or unparseable. The type allows both.
- `soundCategory` is never copied. Because of that, 06.3 deletes the field from the type without touching this function.

3e. `src/lib/__tests__/readings.test.ts`: import `normalizeReading`. This anchors on Step 2's AFTER text.

BEFORE (`src/lib/__tests__/readings.test.ts`, lines 2-2 as written by Step 2, verbatim):
```ts
import { getCoordinates, getReadingDate, toDate, toMillis } from '@/lib/readings';
```

AFTER:
```ts
import { getCoordinates, getReadingDate, normalizeReading, toDate, toMillis } from '@/lib/readings';
```

3f. `src/lib/__tests__/readings.test.ts`: append the `normalizeReading` suite after the last `getCoordinates` test. This anchors on Step 2's AFTER text, at the end of the file.

BEFORE (`src/lib/__tests__/readings.test.ts`, lines 139-141 as written by Step 2, verbatim):
```ts
    expect(getCoordinates({ latitude: 6.9271, longitude: -181 })).toBeNull();
  });
});
```

AFTER:
```ts
    expect(getCoordinates({ latitude: 6.9271, longitude: -181 })).toBeNull();
  });
});

describe('normalizeReading', () => {
  // A production doc as getDocs() returns it: the 12 known keys.
  function rawDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      userId: 'uid-123',
      userEmail: 'ab***@example.com',
      decibelLevel: 62.5,
      latitude: 6.9271,
      longitude: 79.8612,
      locationName: 'Colombo Fort',
      timestamp: new FakeTimestamp(SECONDS, 0),
      createdAt: new FakeTimestamp(SECONDS - 5, 0),
      deviceInfo: 'Mobile Device',
      soundClass: 'Traffic',
      soundType: 'Pollution',
      confidence: 0.82,
      ...overrides,
    };
  }

  it('maps a full doc onto the plain DTO with epoch-ms dates', () => {
    expect(normalizeReading('r1', rawDoc())).toEqual({
      id: 'r1',
      userId: 'uid-123',
      userEmail: 'ab***@example.com',
      decibelLevel: 62.5,
      latitude: 6.9271,
      longitude: 79.8612,
      locationName: 'Colombo Fort',
      timestamp: MS,
      createdAt: MS - 5000,
      soundClass: 'Traffic',
      soundType: 'Pollution',
      confidence: 0.82,
    });
  });

  it('keeps only declared keys: no deviceInfo, no unknown key, no soundCategory', () => {
    const reading = normalizeReading('r1', rawDoc({ extra: { nested: true }, soundCategory: 'Traffic' }));
    expect(reading).not.toBeNull();
    expect(Object.keys(reading ?? {}).sort()).toEqual([
      'confidence',
      'createdAt',
      'decibelLevel',
      'id',
      'latitude',
      'locationName',
      'longitude',
      'soundClass',
      'soundType',
      'timestamp',
      'userEmail',
      'userId',
    ]);
  });

  it('produces a row that survives an IndexedDB structured clone unchanged (bug-1)', () => {
    const reading = normalizeReading('r1', rawDoc());
    const stored = structuredClone(reading);
    expect(stored).toEqual(reading);
    expect(typeof stored?.timestamp).toBe('number');
  });

  it('accepts a doc whose Timestamps were already structure-cloned', () => {
    expect(normalizeReading('r1', structuredClone(rawDoc()))?.timestamp).toBe(MS);
  });

  it('keeps an unclassified doc and leaves the optional fields absent', () => {
    const doc = rawDoc({ userEmail: null });
    delete doc.soundClass;
    delete doc.soundType;
    delete doc.confidence;
    delete doc.createdAt;
    expect(normalizeReading('r2', doc)).toEqual({
      id: 'r2',
      userId: 'uid-123',
      decibelLevel: 62.5,
      latitude: 6.9271,
      longitude: 79.8612,
      locationName: 'Colombo Fort',
      timestamp: MS,
    });
  });

  it("drops a soundType other than 'Pollution'/'Ambient' and a non-numeric confidence", () => {
    const reading = normalizeReading('r3', rawDoc({ soundType: 'Both', confidence: '0.9' }));
    expect(reading).not.toBeNull();
    expect(reading?.soundType).toBeUndefined();
    expect(reading?.confidence).toBeUndefined();
  });

  it('keeps a doc with an unparseable timestamp as timestamp: null', () => {
    const doc = rawDoc({ timestamp: 'not a date' });
    delete doc.createdAt;
    expect(normalizeReading('r4', doc)?.timestamp).toBeNull();
  });

  it('drops docs no app version writes (sec-1)', () => {
    const bad: Record<string, unknown>[] = [
      rawDoc({ userId: undefined }),
      rawDoc({ userId: 42 }),
      rawDoc({ decibelLevel: '62.5' }),
      rawDoc({ decibelLevel: NaN }),
      rawDoc({ decibelLevel: Infinity }),
      rawDoc({ latitude: undefined }),
      rawDoc({ latitude: '6.9271' }),
      rawDoc({ longitude: 200 }),
      rawDoc({ soundClass: { x: 1 } }),
      rawDoc({ locationName: 12 }),
      rawDoc({ userEmail: ['ab***@example.com'] }),
    ];
    for (const doc of bad) {
      expect(normalizeReading('bad', doc)).toBeNull();
    }
  });

  it('drops a doc that has only the legacy nested location', () => {
    const doc = rawDoc({ location: { latitude: 6.9271, longitude: 79.8612 } });
    delete doc.latitude;
    delete doc.longitude;
    expect(normalizeReading('r5', doc)).toBeNull();
  });
});
```

3g. `src/utils/syncManager.ts`: imports.

BEFORE (`src/utils/syncManager.ts`, lines 11-14, verbatim):
```ts
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db as firebaseDb } from '@/config/firebase';
import * as localDb from '@/utils/db';
import type { NoiseReading } from '@/types/NoiseReading';
```

AFTER:
```ts
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import type { Query } from 'firebase/firestore';
import { db as firebaseDb } from '@/config/firebase';
import * as localDb from '@/utils/db';
import type { NoiseReading } from '@/types/NoiseReading';
import { normalizeReading } from '@/lib/readings';
```

3h. `src/utils/syncManager.ts`: add `fetchReadings()` directly below `MAX_INITIAL_READINGS`.

BEFORE (`src/utils/syncManager.ts`, lines 24-24, verbatim):
```ts
const MAX_INITIAL_READINGS = 0; // 0 = fetch ALL, >0 = limit to this number
```

AFTER:
```ts
const MAX_INITIAL_READINGS = 0; // 0 = fetch ALL, >0 = limit to this number

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
```

3i. `src/utils/syncManager.ts`: map site 1, the delta inside the `cacheDownloaded` branch. Only the mapping changes; the branch and its query stay.

BEFORE (`src/utils/syncManager.ts`, lines 89-93, verbatim):
```ts
        const snapshot = await getDocs(q);
        newReadings = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as NoiseReading[];
```

AFTER:
```ts
        newReadings = await fetchReadings(q);
```

3j. `src/utils/syncManager.ts`: map site 2, the first full sync. The block runs through the `console.log` line, because HEAD lines 119-125 are textually identical to lines 141-147 and need the extra lines to be unique.

BEFORE (`src/utils/syncManager.ts`, lines 118-127, verbatim):
```ts
      const snapshot = await getDocs(q);
      newReadings = snapshot.docs.map(doc => {
        const data = doc.data() as NoiseReading;
        return {
          id: doc.id,
          ...data,
        };
      });
      
      console.log(`[Sync] First sync: Fetched ${newReadings.length} readings (MAX_INITIAL_READINGS: ${MAX_INITIAL_READINGS})`);
```

AFTER:
```ts
      newReadings = await fetchReadings(q);
      
      console.log(`[Sync] First sync: Fetched ${newReadings.length} readings (MAX_INITIAL_READINGS: ${MAX_INITIAL_READINGS})`);
```

3k. `src/utils/syncManager.ts`: map site 3, the regular delta. The block starts at its `query(` call for uniqueness; the query lines are unchanged.

BEFORE (`src/utils/syncManager.ts`, lines 135-147, verbatim):
```ts
      const q = query(
        collection(firebaseDb, 'noise_readings'),
        where('timestamp', '>', Timestamp.fromDate(lastSync))
      );
      
      const snapshot = await getDocs(q);
      newReadings = snapshot.docs.map(doc => {
        const data = doc.data() as NoiseReading;
        return {
          id: doc.id,
          ...data,
        };
      });
```

AFTER:
```ts
      const q = query(
        collection(firebaseDb, 'noise_readings'),
        where('timestamp', '>', Timestamp.fromDate(lastSync))
      );
      
      newReadings = await fetchReadings(q);
```

3l. `src/utils/syncManager.ts`: map site 4, `forceFullSync`.

BEFORE (`src/utils/syncManager.ts`, lines 246-250, verbatim):
```ts
    const snapshot = await getDocs(q);
    const newReadings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as NoiseReading[];
```

AFTER:
```ts
    const newReadings = await fetchReadings(q);
```

3m. `src/components/analytics/SoundTypeChart.tsx`: remove the colour for the deleted `'Both'` member. `'Unknown'` stays: it is the chart's label for a missing `soundType` (`:44`).

BEFORE (`src/components/analytics/SoundTypeChart.tsx`, lines 15-20, verbatim):
```tsx
const SOUND_TYPE_COLORS: Record<string, string> = {
  'Pollution': '#F44336',    // Red badge
  'Ambient': '#4CAF50',      // Green badge
  'Both': '#AB47BC',         // Purple badge
  'Unknown': '#9E9E9E',      // Gray badge
};
```

AFTER:
```tsx
const SOUND_TYPE_COLORS: Record<string, string> = {
  'Pollution': '#F44336',    // Red badge
  'Ambient': '#4CAF50',      // Green badge
  'Unknown': '#9E9E9E',      // Gray badge
};
```

**Edge cases to preserve**
- **Query shapes are unchanged** (master §2.1):
  - the first sync is `orderBy('timestamp', 'desc')` (plus `limit` when `MAX_INITIAL_READINGS > 0`);
  - both deltas are `where('timestamp', '>', Timestamp.fromDate(lastSync))`;
  - `forceFullSync` is `orderBy('timestamp', 'desc')`.
  
  There is no `>=` and no new index. `Timestamp` stays imported for `Timestamp.fromDate`.
- The `cacheDownloaded` branch, `lastSyncTime`/`firstSyncDone` bookkeeping and `updatedCount: 0` are unchanged; 05.1 rewrites them on top of `fetchReadings`. `newCount` now counts normalized readings, so dropped docs are not counted. The `Fetch All` alert therefore shows the normalized total.
- **A null `userEmail` keeps the doc** (the offline writer can produce it); the field is simply absent. The same holds for a null `soundClass`/`locationName`.
- An unparseable `timestamp` keeps the doc with `timestamp: null`. This should not happen: every production doc has a Timestamp, and `orderBy('timestamp')` skips docs without the field. The Step 2 helpers render it as `—`/`No timestamp`/`Unknown`.
- `confidence` and `decibelLevel` are type-checked, not range-checked. The rules' ranges (D3, 02.2) apply to new writes; the browser accepts any finite value. bug-10 (`Math.max` over all dB values) is master §7.
- **Rows already in IndexedDB are NOT rewritten by this step.** They stay raw v1 docs until Step 4 purges them, or until someone presses "Fetch All Readings". This mixed store is safe: every reader goes through the Step 2 helpers, which accept both shapes. The type says `number` for rows that are still objects only until Step 4. Do not push between 04.3 and the end of 05 (master §4.15).
- `fetchReadings` logs only `dropped` and `snapshot.size` (convention 2.13), never a doc or an id list.
- The `'Unknown'` colour key in `SoundTypeChart` and the `'Unknown'` fallback labels elsewhere are 06.3's to rename.

**Acceptance criteria**
- `npx vitest run src/lib/__tests__/readings.test.ts`: 24 tests pass.
- `npx tsc -b`: 0 errors. This proves no file still reads `.toDate`, `location` or `'Both'` through the type.
- Every one of these greps prints nothing:
  ```
  grep -nE "\.\.\.doc\.data\(\)|doc\.data\(\) as NoiseReading" src/utils/syncManager.ts
  grep -rnE "where\([^)]*'>='" src
  grep -rn "'Both'" src/types src/lib/readings.ts src/components
  grep -rn "firebase/firestore" src/types src/lib
  ```
- `grep -n "fetchReadings(q)" src/utils/syncManager.ts` prints exactly 4 lines.
- Manual, cheap: with `npm run dev`, if a reading has been recorded since the browser's last sync, press **Sync** on `/map`. In DevTools → Application → IndexedDB → `noise-pollution-db` → `noise_readings`, check the new row:
  - `timestamp` is a number (epoch ms);
  - it has no `deviceInfo`;
  - it has no `seconds`/`nanoseconds` object.
  
  The console shows no `[Sync] Skipped` warning. Older rows still show `{ seconds, nanoseconds }` until Step 4; that is expected. If no new reading exists, skip this check: Step 4 covers it. Do NOT press "Fetch All Readings" here.

**Verify**
```
npx vitest run src/lib/__tests__/readings.test.ts
npx tsc -b
npx eslint src/types/NoiseReading.ts src/lib/readings.ts src/lib/__tests__/readings.test.ts src/utils/syncManager.ts src/components/analytics/SoundTypeChart.tsx
```
Manual: the acceptance checks above.

**Commit title:** `fix(sync): normalize Firestore docs into a whitelisted plain DTO before IndexedDB (bug-1, sec-1)`

---

### Step 4 — priv-1, bug-1: schema v2 purge

**Goal:**
- Bump `DB_VERSION` to 2. On the upgrade from v1, delete and recreate the `noise_readings` store, and clear `sync_metadata`.
- On its next load, every browser does one full, normalized re-fetch. That is about 3,374 reads per browser profile, once.
- The re-fetch purges four kinds of stale data:
  - rows deleted in Firestore since they were cached;
  - rows rewritten in Firestore since they were cached (account-deletion anonymization, email-label updates, the 2026-09-09 backfill);
  - pre-2026-09-09 raw `userEmail` values held at rest;
  - every Timestamp-shaped row left over from v1.
- The `timestamp` index now holds valid numeric keys, so `getLatestTimestamp` returns the right value.

**Files:**
- `src/utils/db.ts`

**Exact changes**

4a. Bump the version. This anchors on the post-Step-2 file: HEAD line 11, at lines 12-12 after Step 2's import. The text is unchanged since HEAD.

BEFORE (`src/utils/db.ts`, lines 12-12 after Step 2, verbatim):
```ts
const DB_VERSION = 1;
```

AFTER:
```ts
// v2 (cluster 04.4): rows are normalized DTOs with epoch-ms timestamps. The
// v1 -> v2 upgrade in openDB() drops every v1 row and the sync metadata.
const DB_VERSION = 2;
```

4b. The v1 → v2 purge in `onupgradeneeded`. This block is byte-identical to HEAD lines 22-36: Step 1 carried it over unchanged, and it sits at lines 74-88 once 4a is applied.

BEFORE (`src/utils/db.ts`, lines 74-88 after Step 3 and 4a, verbatim):
```ts
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create noise readings store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('decibelLevel', 'decibelLevel', { unique: false });
      }
      
      // Create sync metadata store
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'key' });
      }
    };
```

AFTER:
```ts
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Every upgrade from a v1 (or older) database purges it. A future v3
      // change adds its own `event.oldVersion < 3` branch below this one.
      const purgeV1 = event.oldVersion < 2;

      // v1 -> v2 purge (priv-1, bug-1). v1 rows are raw Firestore docs:
      // Timestamp-shaped objects the 'timestamp' index could not key, rows
      // deleted or anonymized in Firestore after they were cached, and
      // pre-2026-09-09 raw userEmail values. Drop them all; the next sync
      // re-fetches every reading through normalizeReading().
      if (purgeV1 && db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }

      // Create noise readings store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // timestamp is epoch ms since v2, a valid index key. A row with a
        // null timestamp is simply left out of this index.
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('decibelLevel', 'decibelLevel', { unique: false });
      }

      // Create sync metadata store
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'key' });
      } else if (purgeV1) {
        // Forget lastSyncTime, firstSyncDone and any stale cacheDownloaded,
        // so the next sync takes the first-sync full fetch instead of a
        // delta on top of an empty store.
        request.transaction?.objectStore(SYNC_STORE_NAME).clear();
      }
    };
```

Placement note: `request` is the `const request = indexedDB.open(DB_NAME, DB_VERSION);` that Step 1 placed in the same executor. `request.transaction` is the upgrade (`versionchange`) transaction; it is non-null inside `onupgradeneeded`, and the `?.` only satisfies the DOM type.

**Edge cases to preserve**
- **Bump once.** Cluster 05 must NOT bump `DB_VERSION` again (master §4.4). A later schema change adds its own `event.oldVersion < 3` branch and never edits the v2 branch.
- **Fresh install** (`oldVersion` 0): `purgeV1` is true, but neither store exists yet, so both are simply created.
- **Atomic.** The purge runs inside the upgrade transaction. If it aborts (quota, crash), the database stays at v1 with its data, and the next load retries. Do not use `indexedDB.deleteDatabase`.
- **Full fetch, not a delta.** With `sync_metadata` empty, `getSyncMetadata` returns `null` for `cacheDownloaded`, `firstSyncDone` and `lastSyncTime`. `syncNewReadings` therefore takes its `!firstSyncDone` branch: `orderBy('timestamp', 'desc')`, a full fetch through `fetchReadings`. A stale `cacheDownloaded` value can never route a purged browser into a delta.
- **A row with `timestamp: null`** is left out of the `timestamp` index. IndexedDB skips records whose index key is invalid; this is not an error.
- **A blocked upgrade.** An old-build tab holding a v1 connection without `onversionchange` blocks the upgrade, and Step 1's `onblocked` rejects with `DbBlockedError` (message `DB_BLOCKED_MESSAGE`). Because of 1b, the sync stops before it fetches, so a blocked load costs no Firestore reads. The upgrade completes when that tab closes, and a reload then works. This happens once per browser.
- **Never return to `DB_VERSION = 1`** once any browser has run this build. IndexedDB cannot open at a lower version (`VersionError`), so a reverted build would break every upgraded browser. See Risks & rollback.
- **`getLatestTimestamp`** stays as Step 2 left it. It is correct now and still unused.

**Acceptance criteria**
- `npm test` passes, all suites (at least `utils.test.ts` and `readings.test.ts`, which has 24 tests).
- `npm run build` succeeds. It prints the same single ">500 kB" chunk warning as the audited baseline; cluster 11 fixes that.
- One combined manual flow covers both the blocked upgrade and the purge, and costs one full fetch:
  1. **Before** applying 4a/4b, run `npm run dev` on the Step 3 commit, sign in and load `/map`, so that a v1 database with rows exists.
  2. Open `http://localhost:5173/vite.svg` in a second tab and run `window.hold = indexedDB.open('noise-pollution-db');`. This holds a v1 connection with no `versionchange` handler, standing in for a tab running an old build.
  3. Apply 4a/4b and reload the app tab. Within a second the console shows an error whose message is `Close other dashboard tabs to finish the update, then reload this page.` (logged by `useSyncedReadings` and `SyncStatus`), and SyncStatus shows its error state. Nothing hangs, and no `[Sync] First sync: Fetched` line appears: the sync stopped before fetching (1b).
  4. In the second tab run `hold.result.close()` (or close the tab), then reload the app tab. Check DevTools → Application → IndexedDB:
     - `noise-pollution-db` is version **2**.
     - After the first sync, `noise_readings` holds as many rows as production has. That was 3,374 on 2026-10-16, plus any recorded since; compare with the Firebase console count.
     - Every row's `timestamp` is a number, and no row has `deviceInfo` or a `{ seconds, nanoseconds }` object.
     - `sync_metadata` holds `firstSyncDone: true` and a fresh `lastSyncTime`, and no `cacheDownloaded`.
     
     The console shows `[Sync] First sync: Fetched N readings` once, and **no** `[Sync] Skipped … malformed reading(s)` warning. If that warning appears, STOP: record the count and investigate before going further. Value ranges are unprobed (P8).
  5. In the second tab (reopen `vite.svg` if you closed it), confirm the `timestamp` index is populated:
     ```js
     const r = indexedDB.open('noise-pollution-db');
     r.onsuccess = () => { const d = r.result; const q = d.transaction('noise_readings').objectStore('noise_readings').index('timestamp').count(); q.onsuccess = () => { console.log('indexed rows:', q.result); d.close(); }; };
     ```
     The count equals the store's row count.
  6. Analytics → Export CSV and JSON: real timestamps on every row. Clicking a map marker shows a date.
- `grep -rn "\.toDate()" src | grep -v "src/lib/readings.ts"` prints nothing (master §6 convention grep).

**Verify**
```
npx vitest run src/lib/__tests__/readings.test.ts
npx tsc -b
npx eslint src/utils/db.ts
npm test
npm run build
```
Manual:
- Run the acceptance flow above.
- `npm run build` is the **cluster-end build**. Run it exactly once (about 7.5 minutes on this machine), never alongside the dev server or another type-check.
- **Do NOT push.** Cluster 04 and cluster 05 ship together (master §4.15). Step 4 forces a full re-fetch, and 05.2 is what keeps later loads cheap.

**Commit title:** `fix(idb): bump cache schema to v2 so every browser purges stale rows and re-fetches (priv-1, bug-1)`

---

## Risks & rollback

- **Read cost (Step 4).** Every browser profile that has opened the dashboard re-fetches the whole collection once: about 3,374 document reads each (plus growth). That is the intended one-time purge. Do not push until cluster 05 is done (master §4.15). Otherwise every later load stays on the unchanged sync path.
- **Never roll `DB_VERSION` back.** IndexedDB cannot open at a lower version. Reverting 04.4 after any browser ran it makes every upgraded browser fail every open with `VersionError`: empty dashboards and failed syncs. To undo Step 4's behaviour, revert its code but keep `const DB_VERSION = 2;`, or fix forward with `3`. Reverting Steps 1–3 is independent of this. Revert newest first (master §1.7).
- **Cross-tab upgrade.** For one load after deploy, a user with an old-build tab open sees the "close other dashboard tabs" error in the new tab. This is by design: before Step 1 the same situation hung silently. After everyone runs a Step 1+ build, `onversionchange` makes future upgrades seamless.
- **Over-dropping in `normalizeReading`.** Dropped docs vanish from every view, and only `[Sync] Skipped N malformed reading(s) of M` reveals them. Production types are known to be clean (P4), but ranges are not (P8). The Step 4 count comparison is the gate. If N > 0, inspect the specific docs in the Firebase console before deciding whether the rule or the data is wrong. Never loosen a check to `any`.
- **Behaviour change in the map date filter (Step 2).** Readings whose client `createdAt` and server `timestamp` fall on opposite sides of a window boundary move in or out of "Last N days". This is the bug-8 fix, and the map now agrees with the table and the trend.
- **Mixed store between Steps 3 and 4.** It is safe because every reader goes through the Step 2 helpers. It is also why Step 2 must never be reverted while Step 3 is in place.
- **Test-only risk.** `structuredClone` exists in Node 17+. Local Node is 20.20.0 and CI is 22 (cluster 01).
- **Rollback, generally:** `git revert` per step, newest first, keeping `DB_VERSION` ≥ 2 as above. No server-side state changes in this cluster: no rules, no index, no Firestore writes.

## Out of scope

- **bug-8 parts 2–3** (the range end frozen at click time, day boundaries, and the preset recomputed at filter time): cluster 09.2.
- **The rest of priv-1:**
  - bounded staleness (periodic full replace in one transaction): 05.2;
  - the server-time watermark: 05.1;
  - clearing the cache and `remembered_email` on sign-out or account switch (priv-4): 05.7.
- **The rest of sec-1:** the rules field validation `validReading()`: 02.2. Per-card and root error boundaries: 08.2.
- **Category precedence and labels:** the `soundCategory || soundClass` precedence, `'Unknown'` → `'Unclassified'`, `confidence || 0` → `—`, and deleting `soundCategory` from the type: cluster 06.3 (data-2). The Quiet category and the shared taxonomy: 06.1/06.2.
- **Export changes:** CSV quoting and formula neutralisation (07.1), empty cells for a missing date (07.1), the 'Contributor' column replacing 'User Email' and `userMap` (07.2), and the uncalibrated-dB caveat (07.3).
- **Heatmap behaviour:** intensity scaling, 0 dB handling, the `lat || 0` filter quirk, and moving `HeatmapLayer` out of `MarkerClusterGroup`: cluster 09.1/09.4.
- **Sync and provider work:** removing `NoiseMarkers`' own load/sync effect and the single `ReadingsProvider`: cluster 05.3. The sync algorithm, the `cacheDownloaded` branch and single-flight: 05.1.
- **arch-3, the rest:** this cluster closes only its duplicated timestamp and coordinate parsing. The dB band thresholds go to `noiseBands.ts` in 06.1; the unused `VITE_*_THRESHOLD` env vars are master §7.
- **Dead-code deletion** of `getLatestTimestamp` and `updateManyReadings`: master §7.
- **Time zone of buckets and CSV** (bug-12, `Asia/Colombo` and an ISO-UTC column): master §7.
- **The app's raw-email offline fallback** (priv-6, `APP:sync_service.dart:308`): master §7. Such values are cached as written and masked at display time by 07.2.
- **Replacing the hand-rolled cache** with the SDK's `persistentLocalCache`: master §7.
- **TypeScript `strict`:** cluster 12. With `strictNullChecks` on, `timestamp: number | null` will demand the null handling the helpers already do.
