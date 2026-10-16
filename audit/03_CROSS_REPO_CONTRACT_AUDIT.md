# Cross-Repo Contract Audit - Noise Pollution Mapper Web Dashboard

> Generated 2026-10-15 - multi-agent cross-repo audit, read-only. This is the dashboard audit's counterpart to the mobile `03_E2E_FLOW_AUDIT.md`. Where the mobile document traced user flows end to end, this one traces the **contract between the two clients** that share Firebase project `noise-pollution-mapper-9ad3d`. The Flutter app (`noise_pollution_mapper`, master `9b08e68`) is the only writer of `noise_readings` and `users`. The React/Vite dashboard (`noise-pollution-mapper-dashboard`, HEAD `353bbdd`) only reads them in the browser, plus Admin-SDK functions and scripts that bypass the rules.
>
> Dimension agents (security, data layer, correctness, React/Vite, UX, performance, build/deploy) read both repos. Every Critical/High was re-checked by an adversarial verifier, and uncertain claims default to refuted. Production facts come from the owner-run read-only probe of 2026-10-16 ~00:20 (`prod_probe.json`, `deployed_firestore.rules`; aggregates only, no PII). No file outside `audit/` was modified, and the audit made no network call to Firebase. The app's own 338-finding audit is closed. App code is cited here only to establish what it writes.
>
> Status legend: `confirmed` = verifier re-proved it; `partial` = mechanism confirmed, part of the claim corrected; `refuted` = disproved (kept, excluded from recommendations); `unverified` = not individually re-checked.

## Executive Summary

Total findings in this area (category data-contract): **3** (0 Critical, 2 High, 1 Medium). Both Highs are confirmed. Other cross-repo findings live in their own category documents and are indexed in section 7. The most important are `sec-1` (rules validate no field types), `priv-1` (the cache never sees updates or deletes) and `bug-1` (IndexedDB strips `Timestamp.toDate()`).

**The handoff's three known items are resolved:**

- **The two contradicting rulesets no longer exist, in source or in production.** Dashboard commit `353bbdd` adopted the merged ruleset, and both repos commit the same blob (`04bd418e`). The owner's probe shows the deployed ruleset equals it.
- **`isAdmin()` is not dead.** It is satisfiable for exactly one account, the owner's, provisioned by hand. `/analytics` was never "silently dead" for anyone. Only its user column degrades or leaks (`priv-2`).
- **The update-rule `userId` guard is present, deployed, and admits the app's account-deletion write.** Its `deleted_user_*` branch accepts any suffix (`sec-3`).
- **`Quiet` does not exist in production yet.** The dashboard would show it as an anonymous grey bar (`data-3`). The present-day problem is bigger: 79.5% of readings carry no `soundClass` at all and are silently counted as 'Other' (`data-2`).
- **The deploy rule stands.** Deploy only from the app repo with `--only firestore:rules,firestore:indexes`. There is no Storage bucket, and the app's `firebase.json` still declares a storage target.

**Where the contract actually breaks today:**
1. The dashboard syncs on `timestamp >` its own clock, but the app back-dates offline uploads to capture time (`data-1`).
2. The dashboard syncs only inserts, but the app updates and deletes (`priv-1`).
3. The dashboard expects classification on every reading, but the app omits it below threshold (`data-2`).
4. The dashboard expects `Timestamp` objects, but its own IndexedDB turns them into plain objects (`bug-1`).
5. The dashboard's map date filter prefers `createdAt`, which exists on only 17.8% of docs and is client clock (`bug-8`).

No dashboard query needs a new composite index, and no fix in this audit adds one.

## Summary Table

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| data-1 | High | Delta sync filters timestamp > client-clock lastSync, permanently missing offline-uploaded (back-dated) readings and writes landing in the post-query race window | `src/utils/syncManager.ts:156` (both) | confirmed |
| data-2 | High | Readings with no soundClass (79.5% of production) are bucketed as 'Other' in CategoryChart but 'Unknown' elsewhere, and absent confidence renders as a red 0% | `src/components/analytics/CategoryChart.tsx:79` (dashboard, cross-repo) | confirmed (with corrections) |
| data-3 | Medium | Category maps lack Quiet, Uncertain and manual Speech-Pollution/Speech-Ambient (grey with a question-mark icon, Speech split three ways) and Quiet collides with the dB-band label | `src/components/analytics/CategoryChart.tsx:15` (dashboard, cross-repo) | unverified |

---

## 1. Known items from the handoff — resolution

### 1.1 The two `firestore.rules` contradict each other; last deploy wins

**Resolution: RESOLVED in source and, per the owner's probe, in production. No drift today. One residual: nothing stops future drift.**

- **Reconciled in source by dashboard commit `353bbdd`** ("fix(security): adopt the single authoritative ruleset (sec-1)").
  - `git ls-files -s` gives the same committed blobs in both repos: `firestore.rules` `04bd418ecae9b13618b521c3e87e6f33fb0a64ba` and `storage.rules` `d771f5c15585d6426ccab56ebc21aea3f9e94246`.
  - The copies are identical modulo CRLF. `git ls-files --eol firestore.rules` gives `i/lf w/crlf` in the app (a `core.autocrlf` checkout artifact) and `i/lf w/lf` in the dashboard. The rules compiler ignores line endings.
- **Deployed-ruleset equality: UNVERIFIED by this session's agents**, because the read-only probe (`probe.js`) was blocked by policy for them.
  - The **owner ran it themselves** on 2026-10-16 ~00:20. It reports deployed ruleset `ebff82af-152c-4626-a996-3e4e9f026a2c` (created Wed, 09 Sep 2026 16:38:07 GMT) with `matchesAppRepo: true`, `matchesDashRepo: true` (normalised compare).
  - The writer re-diffed the saved `deployed_firestore.rules` against the dashboard's `firestore.rules` after stripping CR and trailing whitespace: identical.
- **Only the app repo can deploy rules.** Its `firebase.json:23-26` wires `"firestore": {"rules": "firestore.rules", "indexes": "firestore.indexes.json"}`. The dashboard has no `firebase.json`.
- **Residual drift hazards** (recorded as `build-1`, `test-1`):
  - The only guard is the header comment at `firestore.rules:13-17` ("keep the copy in the OTHER repo BYTE IDENTICAL to this file, or DELETE it").
  - The dashboard's untracked `DEPLOYMENT_GUIDE.md:229-248` still prints the pre-merge ruleset. It has no `users` or `app_config` match and no `userId` guard (`allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;`). Pasted into the console, it would deny `app_config` (app donations break) and the `users` list (the admin column), and drop the reassignment guard.
  - `storage.rules:10-12` points at a dashboard `firebase.rules` file that no longer exists.
- **Recommendation:**
  - Delete the dashboard copies of `firestore.rules` and `storage.rules` and leave a pointer README, as the header itself offers. Alternatively, add a CI or pre-commit check that compares `git hash-object` of both repos' files.
  - Replace the ruleset in `DEPLOYMENT_GUIDE.md` with a link to the app repo's file.
  - Re-run probe step 1 (P1 below) before and after every rules deploy.

### 1.2 `users` list and `isAdmin()`: "nothing writes `role`, so `/analytics` is silently dead"

**Resolution: half true. No code writes `role`, but the field was provisioned by hand, and `/analytics` is not dead. The handoff's "dead for everyone" claim is REFUTED. The real defect is `priv-2` (Medium).**

- **True: no code in either repo writes a `role` field.** A grep of `noise_pollution_mapper/lib` and of the dashboard's `src`, `functions/src` and `scripts` finds no `role` write. `users` create forbids it (`firestore.rules:163-164`), and update requires it unchanged (`:172-173`).
- **Provisioned manually, per the rules comment at `firestore.rules:59-66`** ("Admin is therefore provisioned MANUALLY ... Done for the project owner's own uid"). Owner probe:
  - 5 `users` docs, of which **exactly 1** has `role:"admin"` and 4 have no `role` field;
  - 0 custom claims on any of the 7 Auth users;
  - 2 Auth users have no `users` doc at all. The `exists()` guard at `:69` returns false for them, which is harmless.
  - `isAdmin()` is therefore satisfiable for exactly one account.
- **`/analytics` works for every account:**
  - `AnalyticsPage.tsx:26-30` calls `fetchAllUsers()` on every mount. `userService.ts:17-18` runs an unfiltered `getDocs(collection(db,'users'))`.
  - Under `firestore.rules:157`, `allow read: if isOwner(userId) || isAdmin();`, an unfiltered list cannot prove `isOwner`, so it succeeds only for the admin.
  - For everyone else the call fails with permission-denied. `userService.ts:28-30` catches it and logs, and `:32` returns an empty `Map`.
  - StatsCards, the charts and the table all render from the IndexedDB sync. Only `DataTable.tsx:282` and `exportHelpers.ts:77` consume `userMap`, and both fall back to `reading.userId`.
  - Non-admins therefore get raw UIDs under a "User Email" header. The admin gets raw emails joined to coordinates (`priv-2`).
- **The dashboard does not need the `users` collection at all.** Every reading already carries the masked author label `userEmail` (`firebase_service.dart:165-168`; `'Deleted User'` after anonymization, `settings_screen_enhanced.dart:971`). Switching the column to it removes `isAdmin()`'s only consumer. `users` read can then become owner-only, which drops the `exists()`+`get()` cost (policy choice; edit both copies, deploy from the app repo).

### 1.3 Update rule constrains only the pre-write doc (owner can reassign `userId`)

**Resolution: FIXED for live uids and deployed. It admits the app's account-deletion rewrite. Residual hole: the `deleted_user_*` branch is unconstrained (`sec-3`, Medium).**

- **The guard is present** at `firestore.rules:130-134`: incoming `userId` must equal the existing one or match `'^deleted_user_.*'`. Per P1 it is the deployed rule.
- **It permits every legitimate app update:**
  - Account deletion: `settings_screen_enhanced.dart:955` re-authenticates, `:962-965` selects `where('userId', isEqualTo: uid)` (so `resource.data.userId == request.auth.uid` holds), and `:970-972` writes `'userEmail': 'Deleted User'` and `'userId': 'deleted_user_${uid.substring(0, 8)}'`. That value is a string and matches the pattern.
  - The offline-sync retry `set()` on the same deterministic id is evaluated as an update and keeps the same `userId` (`sync_service.dart:338`).
  - Email propagation updates only `userEmail` (`profile_sync_service.dart:80`).
- **Residual (`sec-3`):**
  - The suffix is free. An owner may write `deleted_user_<another user's 8-char uid prefix>` or any arbitrary string.
  - No `affectedKeys()` limit exists, so dB, time, coordinates and class can be changed in the same write.
  - After such a rewrite no client can update or delete the doc (`:136-137`).
  - Production has 0 `deleted_user_*` docs (probe), so neither the legitimate path nor abuse has happened yet.
- **Fix direction:** require exactly `'deleted_user_' + request.auth.uid[0:8]`, `userEmail == 'Deleted User'` and `affectedKeys().hasOnly(['userId','userEmail'])` on the rewrite branch, which still admits the app's exact write. Prove it in the emulator first.
- **On the dashboard side**, the rewrite is never observed at all: the delta sync keys on `timestamp`, which the rewrite does not touch (`priv-1`).

### 1.4 `Quiet`: the 18th `soundClass` value (app commit `86c8c35`)

**Resolution: forward-compatibility gap only; `Quiet` is not in production yet. The dashboard handles it without crashing but anonymously (`data-3`, Medium). A larger present-day issue was found next to it (`data-2`, High).**

- **The app taxonomy:**
  - `yamnet_class_mapping.dart:54`: `static const String categoryQuiet = "Quiet";`, mapped only from YAMNet `'Silence'` (`:624`), soundType `Ambient` (`:664-666`).
  - `Uncertain` (`:58`) is "NEVER persisted to Firestore" (`:56-57`). `dashboard_screen.dart:652-658` writes classification only when `meetsThreshold`.
- **Production (probe):** distinct `soundClass` values are Other 391, Speech 121, Transport 56, Nature 45, Traffic 25, Sports 14, Office 13, Tuk-tuk 7, Music 6, Construction 5, Body Sounds 3, Industrial 2, Religious 2, Speech-Pollution 1. **No `Quiet`, no `Uncertain`, no `soundCategory` field anywhere.** 2,683 of 3,374 docs (79.5%) carry no `soundClass` at all.
- **Dashboard behaviour (section 4 has the full inventory):**
  - `Quiet` is missing only from CategoryChart's colour and icon maps. It renders as a grey bar with the fallback question-mark icon, indistinguishable from 'Other'.
  - Every other surface treats it as a plain string, or as 'Ambient' via `soundType`.
  - No category filter UI exists.
  - The dB-band "Quiet" label exists only in the unused `themeConstants.getNoiseLevel()`, so the name collision is latent, not rendered.
- **The present-day defect:** the 2,683 unclassified readings are folded into the real 'Other' bar, making it about 91% of all data (`data-2`).

### 1.5 Deploy target: `--only firestore:rules,firestore:indexes`, never storage

**Resolution: CONFIRMED and still necessary. The trap is still armed in the app's `firebase.json`.**

- **The project has no Storage bucket** (FACTS: `.appspot.com`, `.firebasestorage.app` and the bare id all `exists=false`).
- **The app's `firebase.json:27-29` still declares** `"storage": {"rules": "storage.rules"}`. A bare `firebase deploy`, or one with `--only storage`, therefore attempts Storage and fails (`build-2`).
- **The only correct command**, run from the **app repo** after showing the rules diff and getting an explicit yes:
  `firebase deploy --only firestore:rules,firestore:indexes`
- **Index rule:**
  - `firestore.indexes.json:3-10` defines the single composite index `noise_readings (userId ASC, timestamp DESC)`, with `"fieldOverrides": []` (`:12`).
  - Every dashboard query is a single-field query (section 3), so none needs another composite index.
  - No query uses `>=`.
  - Every fix proposed in this audit adds no index.
- **Storage-dependent dashboard code cannot work and should not be deployed:**
  - `functions/src/cache-export.ts` (and `functions/DEPLOYMENT_GUIDE.md:29`, which instructs `firebase deploy --only functions:exportCacheDaily,functions:exportCacheWeekly`);
  - `scripts/upload-cache.sh`;
  - `src/utils/cacheDownloader.ts:15`, which hardcodes the nonexistent `.appspot.com` bucket;
  - `src/components/map/CacheStatus.tsx`, imported nowhere;
  - the `cacheDownloaded` branch at `src/utils/syncManager.ts:75-99`. It is unreachable because only `cacheDownloader.ts:157` sets that flag.
  - See `priv-3` and `arch-2`.

---

## 2. Schema contract — field by field

Production presence comes from the owner probe (3,374 `noise_readings` docs, 5 `users` docs). "Dashboard reads" lists every consumer found by grep in `src`.

### 2.1 `noise_readings`

| Field | App writes (path:line, type) | Dashboard reads (path:line, expected type) | Mismatch / risk |
|-------|------------------------------|--------------------------------------------|-----------------|
| doc id | Auto id from `.add(data)` (`firebase_service.dart:182`). Deterministic `recording.id` on offline upload (`sync_service.dart:338`). Restore re-writes the same id (`firebase_service.dart:308`). | `id: doc.id` (`syncManager.ts:91,122,248`). IndexedDB `keyPath: 'id'` (`db.ts:27`). | None. Upsert by id cannot duplicate. A restored doc keeps its old `timestamp`, so a browser whose cache was built between delete and restore never fetches it (`data-1`). |
| `userId` | `string` uid (`firebase_service.dart:161`, `sync_service.dart:307`). Rewritten to `'deleted_user_${uid.substring(0, 8)}'` on account deletion (`settings_screen_enhanced.dart:972`). Prod: string on 3,374, 0 `deleted_user_*`. | `string` (`NoiseReading.ts:5`). Distinct count = 'Active Users' (`StatsCards.tsx:23-24`). 'My readings' filter (`NoiseMarkers.tsx:224`). Lookup key for the user column (`DataTable.tsx:282`, `exportHelpers.ts:77`). JSON export (`exportHelpers.ts:125`). | The rewrite never reaches the cache (`priv-1`), so 'Active Users' differs between stale and fresh browsers. The suffix is unconstrained by the rules (`sec-3`). |
| `userEmail` | Masked author label (display name, `abc***@domain`, or `'Anonymous'`) via `authorLabel` (`firebase_service.dart:165-168`, `:30-39`). Offline: `recording.userEmail ?? _auth.currentUser?.email` (`sync_service.dart:308`, raw fallback). `'Deleted User'` (`settings_screen_enhanced.dart:971`). `authorDisplay` on email change (`profile_sync_service.dart:80`). Prod: 3,372 masked, 2 missing, 0 raw-looking. | **Never read.** Not declared in `NoiseReading.ts:3-26` and absent from `src` (grep). Stored verbatim in IndexedDB through the `...doc.data()` spread (`syncManager.ts:90-93,141-146,247-250`). | The dashboard ignores the one privacy-safe author field and joins raw `users.email` instead (`priv-2`). Raw pre-backfill values persist at rest (`priv-1`, `priv-4`). The legacy raw fallback is `priv-6`. |
| `decibelLevel` | `double` (`firebase_service.dart:169`, `sync_service.dart:309`). Prod: number on 3,374; range unknown (probe bug, P8). | Required `number` (`NoiseReading.ts:6`). Unguarded `.toFixed` at `DataTable.tsx:247` and `exportHelpers.ts:73`. Guarded at `NoiseMarkers.tsx:150`. Sum/max at `StatsCards.tsx:12-19`. Average at `CategoryChart.tsx:84`. Heat intensity `(dB - 30) / 70` at `HeatmapLayer.tsx:60-62`. | The rules do not enforce the type, so a non-number crashes the table and export (`sec-1`). Heat normalisation (30-100 dB) differs from the app's 0-120 dB (`bug-7`). |
| `latitude` / `longitude` | `double`, rounded when the `anonymize_location` pref is on (`firebase_service.dart:170-171`, `sync_service.dart:310-311`). Prod: number on 3,374. | `typeof === 'number'` checks (`NoiseMarkers.tsx:124,273`, `HeatmapLayer.tsx:35`). The CSV uses a truthiness check (`exportHelpers.ts:33-36`, so `0` becomes empty) and emits the value unquoted (`:71-72`). | The rules do not enforce type or range (`sec-1`). CSV cells are unescaped (`sec-2`). The falsy-zero check is moot for Sri Lanka. |
| `locationName` | `string`, default `'Unknown Location'` (`firebase_service.dart:172`, `sync_service.dart:312`). Prod: string on 3,374. | Optional `string` (`NoiseReading.ts:19`). Rendered raw at `DataTable.tsx:240` and `NoiseMarkers.tsx:315`. CSV escapes quotes only (`exportHelpers.ts:66`). | Formula injection (`sec-2`). An object value crashes React (`sec-1`). |
| `timestamp` | Online: `FieldValue.serverTimestamp()` (`firebase_service.dart:173`). Offline: **capture time**, `Timestamp.fromDate(recording.timestamp)` (`sync_service.dart:319`, deliberate per the comment at `:313-318`). Restore: the original value (`firebase_service.dart:307-308`). Prod: `Timestamp` on all 3,374. | Typed `Timestamp` (`NoiseReading.ts:24`), but after the IndexedDB structured clone it is a plain `{seconds, nanoseconds}` object with no `toDate`. Used as the delta cursor (`syncManager.ts:86,137`). `toDate` helpers that handle `{seconds}`: `DataTable.tsx:52-81`, `NoiseTrendChart.tsx:24-53`. Helpers that require `.toDate`: `exportHelpers.ts:61,111`, `NoiseMarkers.tsx:362`. | **Back-dated offline docs are never fetched (`data-1`).** Every export row reads 'Unknown' and every popup 'No timestamp' (`bug-1`). Pending-server-timestamp nulls were REFUTED as a dashboard risk: the browser never writes, and server snapshots never surface other clients' pending writes. |
| `createdAt` | Online: client `DateTime.now()` (`firebase_service.dart:174`). Offline: `recording.timestamp` (`sync_service.dart:320`). Prod: **present on only 602 of 3,374 (17.8%)**. | Optional (`NoiseReading.ts:25`). Read only by the map date filter, where it **overrides** `timestamp` when present (`NoiseMarkers.tsx:197-211`). | For 18% of docs the map filter uses client time instead of server time; for 82% it uses `timestamp`. Mixed semantics (`bug-8`). |
| `deviceInfo` | `'Mobile Device'` (`firebase_service.dart:175`, `sync_service.dart:321`). Prod: string on 3,374. | Never read. Cached verbatim. | None (data minimisation only). |
| `soundClass` | Optional. Omitted below the 0.30 threshold (`dashboard_screen.dart:652-668`, `firebase_service.dart:178`). Manual picker values include `'Speech-Pollution'` and `'Speech-Ambient'` (`report_noise_screen.dart:44,47`, written at `:229`). `'Quiet'` (`yamnet_class_mapping.dart:54`) is not yet in prod. Prod: string on 691; **absent on 2,683 (79.5%)**. | Optional `string` (`NoiseReading.ts:21`). Chart key `soundClass \|\| soundCategory \|\| 'Other'` (`CategoryChart.tsx:79`). Table, popup and exports use `soundCategory \|\| soundClass \|\| 'Unknown'` (`DataTable.tsx:104,251`, `NoiseMarkers.tsx:166,304`, `exportHelpers.ts:74,121`). | Missing class becomes 'Other' in the chart but 'Unknown' everywhere else (`data-2`). Quiet, Speech-Pollution and Speech-Ambient get no colour or icon (`data-3`). |
| `soundType` | Optional `'Pollution'` or `'Ambient'` (`firebase_service.dart:179`, `sync_service.dart:328-330`). Prod: Ambient 595, Pollution 96, absent 2,683. | Closed union `'Pollution' \| 'Ambient' \| 'Both' \| 'Unknown'` (`NoiseReading.ts:22`). Grouped at `SoundTypeChart.tsx:44` (`reading.soundType \|\| 'Unknown'`). Rendered at `DataTable.tsx:264` and `NoiseMarkers.tsx:347`. | SoundTypeChart's 'Unknown' slice is 79.5% of the pie. `'Both'` is never written by the app (grep finds no `'Both'` in `lib/`). |
| `confidence` | Optional `0..1` (`firebase_service.dart:180`). Manual report: `1.0` (`report_noise_screen.dart:231`). Prod: number on 691, absent on 2,683. | **Required** `number` (`NoiseReading.ts:23`). Rendered as `(confidence \|\| 0) * 100` (`DataTable.tsx:273-278`, `NoiseMarkers.tsx:356`, `exportHelpers.ts:76`). JSON `confidence: reading.confidence \|\| 0` (`exportHelpers.ts:123`). | Absent shows as "0%" (`data-2`). Manual reports show as "100%". |
| `soundCategory` | **Never written** (prod: field absent on all docs). | Optional (`NoiseReading.ts:20`). Read as fallback or first choice at the sites in the `soundClass` row. | Dead field. The precedence differs between chart and table, which is harmless today and should be unified (`data-3`). |
| `location` / `lat` / `lng` / `coordinates` | **Never written.** | `NoiseReading.ts:10-18`. Branches at `NoiseMarkers.tsx:128-141,278-294`, `HeatmapLayer.tsx:39-56`, `exportHelpers.ts:37-57,139-180`. | Dead branches (`arch-3`). |

### 2.2 `users/{uid}`

| Field | App writes | Dashboard reads | Mismatch / risk |
|-------|-----------|-----------------|-----------------|
| `email` | **Raw** address: `registration_screen.dart:62` (`'email': _emailController.text.trim()`), `edit_profile_screen.dart:92`, `profile_sync_service.dart:56`. Prod: string on 5/5. | `email: data.email \|\| null` (`userService.ts:24`), then `DataTable.tsx:282` and `exportHelpers.ts:77`. | Raw email joined to GPS for the admin (`priv-2`). Owner-writable string reaches an unescaped CSV cell (`sec-2`). The doc survives account deletion (`firestore.rules:175-177`), so stale uids still resolve (`priv-1`). |
| `displayName` | `registration_screen.dart:61`, `edit_profile_screen.dart:91`. Prod: string on 5/5. | Mapped at `userService.ts:25`, never rendered. | None. |
| `role` | **Never written by code.** Provisioned by hand. Create forbids it (`firestore.rules:163-164`); update keeps it (`:172-173`). Prod: `"admin"` on 1/5. | Not read by the client. Used only by the rules' `isAdmin()` (`firestore.rules:67-72`). | See section 1.2. |
| other (`photoURL`, `preferences`, `totalRecordings`, `createdAt`, `updatedAt`, `*Client`) | App profile fields (probe field histogram). | Not read. | None. |

### 2.3 `app_config/{doc}`

The app reads it (`donations`, 1 doc). The dashboard never reads it. Rules: read if signed in, write false (`firestore.rules:192-195`). No contract with the dashboard.

---

## 3. Query inventory

Rules outcomes come from the deployed ruleset (= source, P1). "Ordinary user" means any signed-in non-admin account. Every app account qualifies, since sign-up is open.

| # | Location | Query | Index needed? | Rules outcome: ordinary signed-in user | Rules outcome: admin |
|---|----------|-------|---------------|-----------------------------------------|----------------------|
| Q1 | `src/pages/DashboardPage.tsx:33` | `onSnapshot(collection(db, 'noise_readings'), ...)`: full-collection listener, no filter, used only for a count | No (no filter, no order) | Allowed (`firestore.rules:97`). About 3,374 billed reads per attach, and there is no error callback (`perf-1`). | Allowed (same) |
| Q2 | `src/utils/syncManager.ts:112-115` | `query(collection(firebaseDb, 'noise_readings'), orderBy('timestamp', 'desc'))`: first sync | No (automatic single-field descending index) | Allowed | Allowed |
| Q3 | `src/utils/syncManager.ts:105-109` | Q2 plus `limit(MAX_INITIAL_READINGS)`. Dead while `MAX_INITIAL_READINGS = 0` (`:24`). | No | Allowed | Allowed |
| Q4 | `src/utils/syncManager.ts:135-138` | `where('timestamp', '>', Timestamp.fromDate(lastSync))`: the live delta sync | No (single-field range; uses `>` per the project rule) | Allowed | Allowed |
| Q5 | `src/utils/syncManager.ts:84-87` | Same delta in the `cacheDownloaded` branch. Unreachable (no bucket; the flag is set only at `cacheDownloader.ts:157`). | No | Allowed | Allowed |
| Q6 | `src/utils/syncManager.ts:241-244` | `orderBy('timestamp', 'desc')`: `forceFullSync` ('Fetch All Readings') | No | Allowed | Allowed |
| Q7 | `src/services/userService.ts:17-18` (from `AnalyticsPage.tsx:27`) | `getDocs(collection(db, 'users'))`: unfiltered list | No | **DENIED** (permission-denied: `isOwner` cannot be proven for an unfiltered list, `firestore.rules:157`). Swallowed at `userService.ts:28-30`, which returns an empty Map. | Allowed through `isAdmin()` (`exists()` + `get()` on `users/{auth.uid}`, `:67-72`). Returns all 5 raw emails (`priv-2`). |
| Q8 | `src/services/userService.ts:41-42` | `query(usersRef, where('__name__', '==', userId))` | No | Dead code: `getUserEmail` has no caller (grep). Any other user's id would be denied. | Allowed |
| Q9 | `src/utils/cacheDownloader.ts:15,52` | `fetch(CACHE_FILE_URL)`: unauthenticated Storage GET | n/a (not Firestore) | Fails: the bucket does not exist. Dead: `CacheStatus` is imported nowhere. | Same |
| Q10 | `functions/src/cache-export.ts:77,141` | Admin SDK `db.collection("noise_readings").get()` | No | Bypasses rules (service account) | Same |
| Q11 | `scripts/export-cache.js:82`, `scripts/export-cache-to-firestore.js:69` (+ write `:106` to `cache/noise_readings_full`) | Admin SDK full read; the second script also writes | No | Bypasses rules. The `cache` collection does not exist in prod (probe), and the catch-all denies clients (`firestore.rules:205-207`). | Same |
| — | Browser writes | none: no `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`, `writeBatch` or `runTransaction` in `src` | — | — | — |

**Index verdict:**
- No dashboard query needs a composite index.
- `>=` appears nowhere.
- The one composite index (`userId ASC, timestamp DESC`) is used only by the app. The dashboard never filters by `userId` server-side: its 'My readings' toggle filters the full cache client-side (`NoiseMarkers.tsx:219-226`).
- Proposed fixes keep this shape: an overlap window on `timestamp >`, a periodic full replace, or an SDK `persistentLocalCache` with one listener.

---

## 4. Quiet / category inventory

Every dashboard site that touches a sound category, and what each does with each problem value. Production today: no `Quiet`, no `Uncertain`, 1 `Speech-Pollution`, 0 `Speech-Ambient`, and **2,683 docs with no `soundClass`**. App taxonomy: 18 categories plus `Uncertain` (`yamnet_class_mapping.dart:32-58`). Quiet's app colour is teal `0xFF00897B` and its icon is the muted speaker (`:1183-1184`, `:1228-1229`). Its type is Ambient (`:664-666`). Sports is Ambient in the app (`:661`).

| # | Site (path:line) | Role | `Quiet` (forward) | `Uncertain` (never persisted) | Missing `soundClass` (79.5% today) | `Speech-Pollution` / `Speech-Ambient` (manual) |
|---|------------------|------|-------------------|-------------------------------|------------------------------------|-----------------------------------------------|
| C1 | `src/components/analytics/CategoryChart.tsx:79` | Grouping key `read.soundClass \|\| read.soundCategory \|\| 'Other'` | Own bar | Own bar | **Merged into the real 'Other' bar** (`data-2`) | Separate bars beside 'Speech', so Speech is split up to three ways. Today: 'Speech' 121 and 'Speech-Pollution' 1. |
| C2 | `CategoryChart.tsx:15-39` + fallback `:93` `CATEGORY_COLORS[category] \|\| '#9E9E9E'` | Bar and legend colour | Grey, the same as 'Other' (`:38`) | Grey | Grey ('Other') | Grey |
| C3 | `CategoryChart.tsx:42-63` + fallback `:156`, `:182` `CATEGORY_ICONS[category] \|\| '❓'` | Y-axis tick and tooltip icon | Question mark, the same as 'Other' (`:62`) | Question mark (matches the app) | Question mark | Question mark |
| C4 | `CategoryChart.tsx:14` comment "17 sound categories"; `:16-25` "Pollution Categories (9)" | Taxonomy drift | Missing (the app has 18) | n/a | n/a | n/a. Legacy `Sirens`, `Machinery` and `Animals` keys are never written by the app. Sports is listed as Pollution, but the app says Ambient. Duplicate colours: Tuk-tuk and Market `#FF7043`, Industrial and Machinery `#FF6E40`. |
| C5 | `CategoryChart.tsx:95` sort by `avgDb` desc | Bar order | Bottom bar (silence) | — | The 'Other' position is distorted by unclassified readings | — |
| C6 | `src/components/analytics/SoundTypeChart.tsx:15-20,44` | Pie by `soundType` | Counted in 'Ambient' (green) | — | `'Unknown'` slice, 79.5% of the pie | Pollution or Ambient, correct |
| C7 | `src/components/analytics/DataTable.tsx:104-105` (sort), `:251` (cell) | Text cell `soundCategory \|\| soundClass \|\| 'Unknown'` | Plain text 'Quiet' | Plain text | **'Unknown'** (the chart says 'Other') | Raw string |
| C8 | `DataTable.tsx:154-158` dB badge | dB band label | No collision: the bands are 'Low'/'Moderate'/'High' | — | — | — |
| C9 | `src/utils/exportHelpers.ts:74` (CSV), `:121` (JSON) | Category column | Raw 'Quiet'. The JSON row also carries `noiseLevel: 'low'` from `:185-189`: adjacent, not conflated. | Raw | 'Unknown' | Raw. The CSV cell is unescaped (`sec-2`). |
| C10 | `src/components/map/NoiseMarkers.tsx:163-170` | Category filter (exact `includes`) | Would match, but **no UI supplies `categories`** (`MapPage.tsx:263-268` "More filters coming soon: ... Category") | — | Always excluded when a filter is set | Exact string only |
| C11 | `NoiseMarkers.tsx:304` popup; marker colour `:32-36` | Popup text; dB-only marker colour | Plain text. A 55 dB "Quiet" reading would get an orange pin, but the app keeps 55 dB room tone out of Quiet (`yamnet_class_mapping.dart:50-53`). | — | 'Unknown' | Raw |
| C12 | `src/components/map/HeatmapLayer.tsx:60-62` | dB only | Low intensity, still drawn | — | Unaffected | Unaffected |
| C13 | `src/utils/themeConstants.ts:40-145` `SOUND_CATEGORIES` ("14 Categories") | **Dead**: only `FLUTTER_THEME_COLORS` is imported (`Layout.tsx:14`, `ThemeContext.tsx:2`, `LoginPage.tsx:17`) | Absent | Absent | — | Absent |
| C14 | `themeConstants.ts:149` `// < 50 dB = Quiet`, `:163` `label: 'Quiet'` in unused `getNoiseLevel()`; comments `NoiseMarkers.tsx:33` `// Green - Quiet`, `HeatmapLayer.tsx:75` `quiet: <50dB` | dB-band "Quiet" | **Latent name collision.** No rendered string uses it today. If wired in, a row could read 'Quiet' (band) next to 'Quiet' (category), which are not equivalent: the category is YAMNet Silence only, the band is anything under 50 dB. | — | — | — |
| C15 | `src/types/NoiseReading.ts:20-22` | Types | `soundClass?: string` accepts it. `soundType` union includes the never-written `'Both'`. | — | — | — |
| C16 | `StatsCards.tsx`, `DashboardPage.tsx`, `AnalyticsPage.tsx`, `MapPage.tsx` | — | No category logic | — | — | — |

**Recommendation** (playbook carries the edits):
- Create one shared `categories.ts` mirroring the app taxonomy: 18 categories with colour, icon and type, `Quiet` = teal + muted-speaker icon, type Ambient.
- Treat `Speech-Pollution` and `Speech-Ambient` as aliases of `Speech` on the category axis, keeping their `soundType`.
- Drop the phantom `Sirens`/`Machinery`/`Animals` keys, or keep them as legacy aliases.
- Use one `categoryOf(reading)` helper with one precedence (`soundClass` then `soundCategory`) and one null label ('Unclassified') everywhere.
- Reserve the word "Quiet" for the category. The dB band stays "Low".

---

## 5. Requires a production check

The read-only probe is at `C:/Users/nuhaa/AppData/Local/Temp/claude/C--Users-nuhaa-Downloads-Chatgpt/eaf5ff64-5c29-438d-8072-7e20ec81df7a/scratchpad/dash/probe.js`. It loads the service account from the dashboard root, never prints it, performs zero writes and prints aggregates only. **It was blocked by policy for this session's agents, so the owner must run it themselves.**

The owner did so on 2026-10-16 ~00:20 (output `prod_probe.json` and `deployed_firestore.rules` in the same folder). That run answers P1-P7. P8-P12 remain open and need the owner to run an extended probe or the commands given.

| ID | Question | Exact read-only check | Status / answer | Settles |
|----|----------|-----------------------|-----------------|---------|
| P1 | Does the deployed Firestore ruleset equal the checked-in file? | `admin.securityRules().getFirestoreRuleset()` and compare `source[0].content`, normalised (CRLF to LF, trailing whitespace stripped), with both repos' `firestore.rules` (probe step 1). | **ANSWERED: equal.** Ruleset `ebff82af-152c-4626-a996-3e4e9f026a2c`, created 2026-09-09 16:38:07 GMT; `matchesAppRepo` and `matchesDashRepo` both true. Writer re-diff: identical. **Re-run before and after every rules deploy.** | 1.1, every rules finding |
| P2 | How many `users` docs have `role == 'admin'`? Any custom claims? | `db.collection('users').where('role','==','admin').count().get()`; `admin.auth().listUsers(1000)` and count `customClaims` (probe step 2). | **ANSWERED: 1 of 5** (4 have no role). 0 custom claims. 7 Auth users, all `password`; 2 have no `users` doc. | 1.2, `priv-2`, `sec-4` |
| P3 | Distinct `soundClass` / `soundType` values; is `Quiet`, `Uncertain` or `soundCategory` present? | Full scan, histogram of `soundClass`, `soundType`, `category` (probe step 3). | **ANSWERED.** 14 `soundClass` values (section 1.4); `Quiet` 0, `Uncertain` 0, `Speech-Pollution` 1; `soundType` Ambient 595, Pollution 96; no `soundCategory`/`category` field. | 1.4, `data-2`, `data-3` |
| P4 | Field presence and types the dashboard parses | Per-field `key:type` histogram (probe step 3). | **ANSWERED.** `timestamp` Timestamp 3,374/3,374; `createdAt` 602; `soundClass`/`soundType`/`confidence` 691; `decibelLevel`, `latitude`, `longitude`, `locationName`, `userId`, `deviceInfo` correctly typed on all; `userEmail` 3,372 masked, 2 missing, **0 raw-looking**. | section 2, `bug-8`, `data-2` |
| P5 | Have any account deletions happened (`deleted_user_*` docs)? | Count docs whose `userId` starts with `deleted_user_` (probe step 3). | **ANSWERED: 0.** Both the legitimate rewrite and `sec-3` abuse are latent. | 1.3, `sec-3`, `priv-1` |
| P6 | Does a Storage bucket exist? | `admin.storage().bucket(<name>).exists()` for `<id>.appspot.com`, `<id>.firebasestorage.app` and the bare id. | **ANSWERED (FACTS): none exists.** | 1.5, `priv-3`, `arch-2` |
| P7 | Which collections exist (is there a `cache` collection)? | `db.listCollections()` with doc counts (probe step 4). | **ANSWERED:** `noise_readings` 3,374, `users` 5, `app_config` 1 (`donations`). No `cache`. | Q11, `arch-2` |
| P8 | **Value ranges**, needed before deploying any `validReading()` rules (`sec-1`) | Admin-SDK scan printing only aggregates: min/max of `decibelLevel`, `latitude`, `longitude`, `confidence`; max `locationName.length` and `userEmail.length`; count of docs with `timestamp.toMillis() > Date.now() + 600000`; count of docs with `userEmail === null`. | **OPEN.** The probe's `decibelRange` (`min: null, max: null, nonFinite: 3374`) is a **probe bug**, not bad data: it reads `x.decibel ?? x.decibels ?? x.dB ?? x.db ?? x.noiseLevel` (`probe.js`, step 3) and never `decibelLevel`. A rules range clause that rejects an existing doc would make the app's email-propagation batch fail atomically. | `sec-1`, `sec-3` fix safety |
| P9 | Are the Cloud Functions `exportCacheDaily`/`exportCacheWeekly` deployed, and failing daily? | `firebase functions:list --project noise-pollution-mapper-9ad3d` (read-only). If listed: `gcloud scheduler jobs list --project noise-pollution-mapper-9ad3d --location us-central1` and `firebase functions:log --only exportCacheDaily --project noise-pollution-mapper-9ad3d`. | **OPEN.** | `priv-3` urgency, `arch-2`, `build-5` |
| P10 | How many readings were uploaded back-dated, so a browser's delta sync could have missed them? | Admin-SDK scan: count docs where `doc.createTime.toMillis() - doc.data().timestamp.toMillis() > 300000` (5 minutes), and the max of that gap. | **OPEN.** This sizes `data-1` part (i) and decides how long the overlap window must be. | `data-1` |
| P11 | Which dashboard browsers hold stale caches (deleted rows, pre-2026-09-09 raw emails)? | Browser-local, so **it cannot be probed server-side.** In each browser profile that has opened the dashboard: DevTools, Application, IndexedDB, `noise-pollution-db`. Compare `sync_metadata` `lastSyncTime` with the `noise_readings` row count against P4's 3,374. Any cache first synced before 2026-09-09 holds raw `userEmail` values. Purge with 'Fetch All Readings' (`/map`) or by clearing site data. | **OPEN (owner action).** | `priv-1`, `priv-4` |
| P12 | What does the live Vercel deployment actually serve, and is it pointed at this project? | `curl -sI https://<dashboard-vercel-domain>/` (Vercel, not Firebase): check for CSP, `X-Frame-Options` and `X-Content-Type-Options`. In the Vercel project settings, confirm `VITE_FIREBASE_PROJECT_ID` = `noise-pollution-mapper-9ad3d` and that every `VITE_FIREBASE_*` key is set (names only). In GCP Credentials, confirm the web API key's HTTP-referrer restriction (if any) includes the Vercel domain. | **OPEN.** | `sec-5`, `build-3` |

---

## 6. Detailed Findings

### Critical

None.

### High

#### [data-1] Delta sync filters timestamp > client-clock lastSync, permanently missing offline-uploaded (back-dated) readings and writes landing in the post-query race window

**Severity:** High | **Category:** data-contract | **Repo:** both (cross-repo) | **Reported by:** data, correctness (two agents), ux, react, performance

**Status:** confirmed. The verifier re-proved both sides:
- **Dashboard side:**
  - Both delta queries key only on `timestamp` (`syncManager.ts:84-87`, `:135-138`).
  - The watermark is browser wall-clock time taken after `getDocs` and after the IndexedDB write (`:156-157`). `forceFullSync` does the same (`:255`).
- **App side:**
  - The offline path writes capture time on purpose (`sync_service.dart:313-319`) and uploads later with `.doc(recording.id).set(data)` (`:338`).
  - The online path uses `serverTimestamp()` (`firebase_service.dart:173`).
  - A failed online write falls back to the offline queue (`firebase_service.dart:102-121`).
- **Result:** an offline reading back-dated before the browser's last sync never matches `timestamp > lastSync`. It stays missing until someone presses 'Fetch All Readings'. The normal 'Sync' path (`SyncStatus.tsx:60`) does not recover it.
- **Reachability:**
  - The hook runs in 5 components per page: StatsCards, NoiseTrendChart, CategoryChart, SoundTypeChart, plus AnalyticsPage or NoiseMarkers. These run concurrently, so the last finisher's later `now` wins.
  - The `cacheDownloaded` branch cannot mask any of this, because there is no bucket.
- **Severity:** missing readings with no visible sign on the map, stats, charts and exports. Offline queuing is a normal app path. High.

Verifier corrections:
1. The cited line 156 is the watermark; the queries are at `:84-87` and `:135-138`.
2. The race window in claim (ii) runs from the latest query among the concurrent instances to the last finisher's `now`. A write is missed only if it lands after every instance has queried, so (ii) is real but lower-probability than (i). The deterministic mechanism is (i).
3. "Max server timestamp seen minus a few minutes" alone does not catch offline docs back-dated by hours. Only an app-side upload-time cursor or a periodic full replace closes it. A 7-day lookback also misses uploads queued longer than 7 days.

**Location:** `src/utils/syncManager.ts:156` (dashboard); `noise_pollution_mapper/lib/services/sync_service.dart:319` (app)

**Description:** The two clients disagree on what `timestamp` means. To the app it is **when the sound was captured**: server time online, device capture time offline. That is a deliberate, documented choice (mobile fb-2) that keeps offline readings on the right day in analytics. The dashboard uses it as an **arrival cursor**: "give me everything newer than the moment I last synced, by my clock". A reading captured offline at 09:00 and uploaded at 12:00 is older than a 10:00 sync, so it is never asked for. Two smaller leaks share the cause:
- the watermark is taken after the fetch, from the browser's clock, so a write committed between query and watermark is skipped;
- a browser clock that runs ahead of server time loses every reading written in that offset after each sync.

The same applies to the app's undo/restore, which re-writes the original `timestamp` (`firebase_service.dart:304-308`).

**Evidence:**
- `noise_pollution_mapper/lib/services/sync_service.dart:313-319`: `// fb-2/flow2-3: the true capture time, NOT the sync time.` ... `'timestamp': Timestamp.fromDate(recording.timestamp),`
- `sync_service.dart:338`: `await _firestore.collection('noise_readings').doc(recording.id).set(data);`
- `noise_pollution_mapper/lib/services/firebase_service.dart:173`: `'timestamp': FieldValue.serverTimestamp(),`
- `firebase_service.dart:104`: `'[FirebaseService] Online save failed, falling back to offline queue',`
- `src/utils/syncManager.ts:135-138`: `const q = query(` / `collection(firebaseDb, 'noise_readings'),` / `where('timestamp', '>', Timestamp.fromDate(lastSync))`
- `src/utils/syncManager.ts:156-157`: `const now = new Date();` / `await setLastSyncTime(now);`
- Concurrent callers: `StatsCards.tsx:8`, `NoiseTrendChart.tsx:21`, `CategoryChart.tsx:67`, `SoundTypeChart.tsx:24`, `AnalyticsPage.tsx:22` (each `const { readings } = useSyncedReadings();`), and `NoiseMarkers.tsx:86` `const syncResult = await syncManager.syncNewReadings();`

**Impact:**
1. **Back-dated offline uploads.** A phone records offline at 09:00 and the dashboard syncs at 10:00, so `lastSync` is 10:00. The phone uploads at 12:00 with `timestamp = 09:00`. Every later delta asks for `timestamp > 10:00`, so that reading never reaches that browser. It is silently absent from the map, stats, charts and exports until someone finds 'Fetch All Readings'.
2. **Race window.** An online reading committed between the last instance's query and the last instance's `now` is skipped forever. On a first sync that window spans an IndexedDB write of about 3,330 docs.
3. **Fast browser clock.** If the browser clock runs Δ ahead of the server, each sync loses the readings written in the next Δ. A slow clock only causes harmless re-puts.

Different browsers therefore show different totals for the same data, with no indication. P10 sizes how many readings are affected.

**Recommendation:**
- **Dashboard-only, now:**
  - Derive the cursor from data, not the wall clock: track the maximum server `timestamp` seen in fetched docs.
  - Query `where('timestamp', '>', Timestamp.fromMillis(maxSeen - overlap))`. `put` is idempotent, single-field `>` needs no index, and `>=` is never needed.
  - Pair it with the periodic **full replace** from `priv-1`. That is the only dashboard-side cure for uploads back-dated by hours or days.
  - Collapse the 5 concurrent sync calls into one shared sync (`perf-2`).
- **Cross-repo, cleaner:**
  - Have both app writers also stamp an upload-time field with `FieldValue.serverTimestamp()` (for example `syncedAt`, on `.add()` and on the offline `set()`), and key the delta on it.
  - That field is single-field and needs no composite index.
  - This touches the closed app, so it is a new app change and must keep the dual `timestamp`/`createdAt` convention.
- **Long-term:** the SDK's `persistentLocalCache` with one listener, which needs no cursor at all.

---

#### [data-2] Readings with no soundClass (79.5% of production) are bucketed as 'Other' in CategoryChart but 'Unknown' elsewhere, and absent confidence renders as a red 0%

**Severity:** High | **Category:** data-contract | **Repo:** dashboard (cross-repo) | **Reported by:** data, ux

**Status:** confirmed. The verifier re-proved it:
- CategoryChart groups by `read.soundClass || read.soundCategory || 'Other'` (`CategoryChart.tsx:79`). It is mounted on both `/dashboard` (`DashboardPage.tsx:167`) and `/analytics` (`AnalyticsPage.tsx:104`).
- Production (probe): `soundClass` on only 691 of 3,374 docs, no `soundCategory` anywhere, and 391 genuine 'Other'.
- The 'Other' bar therefore holds 391 + 2,683 = **3,074 readings (91% of all data, 87% of that bar unclassified)**. Its length (`avgDb`, `:91`, `Bar dataKey="avgDb"` at `:192`) and its legend count (`:206-227`) are both blends that are silently wrong.
- The same docs read 'Unknown' in `DataTable.tsx:251`, `NoiseMarkers.tsx:304`, `exportHelpers.ts:74` (CSV) and `:121` (JSON).
- The app's own analytics skips docs with no class (`analytics_screen.dart:232-234`), so the app and the dashboard report different 'Other' totals for the same data.
- `confidence` is absent on the same 2,683 docs but typed as required (`NoiseReading.ts:23`). It renders as 0.

Verifier corrections:
1. "Red 0%" is slightly wrong. The bar's colour does fall through to `#F44336` (`DataTable.tsx:274`), but its width is `0%`, so no red is visible. The "0%" text is grey. The popup shows "0.0%", the CSV "0.00" and the JSON `0`.
2. The share is known, not "possibly large": 2,683 of 3,374 (79.5%).
3. Not all 2,683 are below-threshold results the app "deliberately" left unclassified. Many are probably legacy docs written before classification fields existed. The dashboard effect is identical.

**Location:** `src/components/analytics/CategoryChart.tsx:79` (dashboard); contract origin `noise_pollution_mapper/lib/screens/dashboard_screen.dart:652-668`, `lib/services/firebase_service.dart:178-180` (app)

**Description:** The app treats "no classification" as a first-class state. It omits `soundClass`, `soundType` and `confidence` entirely rather than writing a low-confidence guess (mobile ml-4/flow2-6). The dashboard has no such state:
- the bar chart files the reading under the real taxonomy category 'Other';
- the table, popup and exports call it 'Unknown';
- the sound-type pie calls it 'Unknown';
- the confidence column treats absence as zero.

No surface tells the researcher that most readings are unclassified.

**Evidence:**
- `noise_pollution_mapper/lib/screens/dashboard_screen.dart:652-654`: `// ml-4/flow2-6: only persist classification data that meets the` / `// 0.30 confidence threshold. Below-threshold ('Uncertain') results` / `// are shown live but never written to Firestore as fact.`
- `noise_pollution_mapper/lib/services/firebase_service.dart:178-180`: `if (soundClass != null) data['soundClass'] = soundClass;` / `if (soundType != null) data['soundType'] = soundType;` / `if (confidence != null) data['confidence'] = confidence;`
- `src/components/analytics/CategoryChart.tsx:79`: `const category = read.soundClass || read.soundCategory || 'Other';`
- `src/components/analytics/DataTable.tsx:251`: `{reading.soundCategory || reading.soundClass || 'Unknown'}`
- `src/utils/exportHelpers.ts:74`: `` `"${reading.soundCategory || reading.soundClass || 'Unknown'}"`, ``
- `src/components/analytics/SoundTypeChart.tsx:44`: `const type = reading.soundType || 'Unknown';`
- `noise_pollution_mapper/lib/screens/analytics_screen.dart:232`: `if (soundClass != null && soundClass.isNotEmpty) {`
- `src/types/NoiseReading.ts:23`: `confidence: number;`
- `src/components/analytics/DataTable.tsx:278`: `<span>{((reading.confidence || 0) * 100).toFixed(0)}%</span>`
- Manual reports: `report_noise_screen.dart:231` `confidence: _selectedSoundClass != null ? 1.0 : null, // Manual entry = 100% confidence`

**Impact:**
- The headline category chart, on the default route, tells researchers that about 91% of Sri Lanka's recorded noise is 'Other'. The 'Other' average dB is a blend of 2,683 unclassified readings and 391 genuinely-Other ones.
- The same reading is 'Other' in the chart, 'Unknown' in the table and CSV, and absent from the app's own category stats.
- Unclassified rows report 0% confidence, which reads as "the classifier was certain it was wrong" rather than "not classified".
- Manual reports report 100%, which reads as a model score.

**Recommendation:**
- Add one shared `categoryOf(reading)` that returns an explicit **'Unclassified'** label (with its own neutral colour) when `soundClass` is absent. Use it in CategoryChart, DataTable, NoiseMarkers and both exports.
- Either exclude 'Unclassified' from the category bar chart, matching `analytics_screen.dart:232`, and show its count as a note, or show it as its own clearly-labelled bar. Never merge it into 'Other'.
- Make `confidence` optional in the type. Render "—" when absent (sorted last) and "Manual" for manual reports. Export empty, not `0`.
- Give SoundTypeChart the same 'Unclassified' label.
- The playbook carries the edits.

---

### Medium

#### [data-3] Category maps lack Quiet, Uncertain and manual Speech-Pollution/Speech-Ambient (grey with a question-mark icon, Speech split three ways) and Quiet collides with the dB-band label

**Severity:** Medium | **Category:** data-contract | **Repo:** dashboard (cross-repo) | **Reported by:** correctness, data, ux, react, performance

**Status:** unverified (not individually re-checked). Writer notes from the probe and the correctness agent's inventory:
- **`Quiet` and `Uncertain` are not in production yet.** For them this is forward compatibility, not a present-day data bug. `Uncertain` is never persisted by design.
- **`Speech-Pollution` exists today** (1 doc), so the Speech split is live: 'Speech' 121 and 'Speech-Pollution' 1 are separate bars.
- **The dB-band name collision is latent.** The band label 'Quiet' lives only in the unused `themeConstants.getNoiseLevel()` and in comments. Rendered bands are 'Low'/'Moderate'/'High'.

**Location:** `src/components/analytics/CategoryChart.tsx:15` (dashboard); taxonomy origin `noise_pollution_mapper/lib/services/yamnet_class_mapping.dart:32-58`, manual values `lib/screens/report_noise_screen.dart:44,47` (app)

**Description:** CategoryChart's colour and icon maps claim to match the app's taxonomy but have drifted:
- The comment says 17 categories; the app has 18.
- `Quiet` (app commit `86c8c35`) is missing.
- `Sirens`, `Machinery` and `Animals`, which the app never writes, are present.
- Sports is filed under Pollution, but the app's `getSoundType` returns Ambient.
- Colours are duplicated: Tuk-tuk and Market, Industrial and Machinery.

Unknown keys fall back to the same grey and question-mark icon as 'Other'. A `Quiet` bar would therefore be indistinguishable from 'Other' except by its label. The manual report screen writes `Speech-Pollution` and `Speech-Ambient`, which the chart treats as two more unknown categories beside `Speech`. Chart and table/exports also use opposite field precedence (`soundClass` first versus `soundCategory` first), which is harmless while `soundCategory` is never written. The full site-by-site inventory is in section 4.

**Evidence:**
- `src/components/analytics/CategoryChart.tsx:14`: `// 17 sound categories with colors (matching Flutter app's yamnet_class_mapping.dart)`
- `CategoryChart.tsx:16`: `// Pollution Categories (9)`; `:21-22`: `'Sirens': '#EF5350',` / `'Machinery': '#FF6E40',`; `:25`: `'Sports': '#FF4081',`; `:29`: `'Animals': '#8BC34A',`; `:38`: `'Other': '#9E9E9E',`. There is no `'Quiet'` key in `:15-39` or `:42-63`.
- `CategoryChart.tsx:93`: `color: CATEGORY_COLORS[category] || '#9E9E9E',`
- `CategoryChart.tsx:156`: `const icon = CATEGORY_ICONS[category] || '❓';` (the same fallback at `:182`)
- `noise_pollution_mapper/lib/services/yamnet_class_mapping.dart:54`: `static const String categoryQuiet = "Quiet";`; `:624`: `'Silence': categoryQuiet,`; `:661-667`: `case categorySports:` ... `case categoryQuiet:` ... `return typeAmbient;`
- `noise_pollution_mapper/lib/screens/report_noise_screen.dart:44`: `{'value': 'Speech-Pollution', 'type': 'Pollution', 'icon': Icons.campaign},`; `:47`: `{'value': 'Speech-Ambient', 'type': 'Ambient', 'icon': Icons.person},`
- `src/utils/themeConstants.ts:149`: `low: 50, // < 50 dB = Quiet`; `:163`: `label: 'Quiet',` (function unused: only `FLUTTER_THEME_COLORS` is imported anywhere)

**Impact:**
- When the app's `Quiet` builds reach users, quiet-environment readings show as an anonymous grey bar with a question-mark icon, visually merged with 'Other'.
- Speech reports are already split across bars, so speech totals are understated in the 'Speech' bar.
- The chart's grouping disagrees with the app on Sports.
- If the unused dB-band helper is ever wired into the UI, "Quiet" would mean two different things in adjacent columns.

**Recommendation:** Replace the two hand-maintained maps with one shared taxonomy module generated from `yamnet_class_mapping.dart`:
- 18 categories with the app's colours and icons; `Quiet` = teal `#00897B` with the muted-speaker icon, type Ambient.
- `Speech-Pollution`/`Speech-Ambient` normalised to `Speech` on the category axis, keeping `soundType`.
- Legacy keys dropped, or kept only as aliases.
- One `categoryOf()` with one precedence and one 'Unclassified' label, shared with `data-2`.

Reserve the word "Quiet" for the category, and keep the dB band as "Low". The playbook carries the edits.

---

### Low

None in this category.

### Enhancement

None in this category.

---

## 7. Cross-repo findings recorded in other documents

The contract view is incomplete without these. Each is detailed in its own category document, and IDs are stable across the audit set.

| ID | Severity | Status | Category | Contract aspect |
|----|----------|--------|----------|-----------------|
| sec-1 | High | confirmed | security | The rules validate no field types or ranges. The dashboard renders unvalidated fields with no error boundary, so one doc blanks `/dashboard` and `/analytics`. |
| priv-1 | High | partial | privacy | App deletes and rewrites (Clear History, delete, account deletion, email change, the 2026-09-09 backfill) never reach the dashboard cache. |
| bug-1 | High | confirmed | bug | The dashboard's IndexedDB turns the app's `Timestamp` into a plain object, so every export timestamp is 'Unknown' and every popup reads 'No timestamp'. |
| perf-1 | High | confirmed (NEEDS PROD CHECK) | performance | A full-collection `onSnapshot` (Q1) bills about 3,374 reads per Overview visit just to show a count. |
| sec-3 | Medium | unverified | security | The `deleted_user_*` update branch accepts any suffix and any field change (section 1.3). |
| sec-4 | Medium | unverified | security | The dashboard gate is "any app account". Rules read is `isSignedIn()` because the app's community feed needs it. |
| priv-2 | Medium | partial | privacy | The user column joins raw `users.email` (admin) or shows UIDs (others) instead of the reading's masked `userEmail` (section 1.2). |
| bug-8 | Medium | unverified | bug | The map date filter prefers client-clock `createdAt` (present on 17.8% of docs) over server `timestamp`. |
| test-1 | Medium | unverified | testing | No CI guard against the two `firestore.rules` copies drifting (section 1.1). |
| priv-6 | Low | unverified | privacy (repo: app) | The legacy offline-queue raw-email fallback lands in every dashboard cache. |
| build-1 | Low | unverified | build-deploy | Deploy guides embed an obsolete ruleset that would regress the merged rules (section 1.1). |
| build-2 | Low | unverified | build-deploy | The app's `firebase.json` storage target makes a bare deploy hit the nonexistent bucket (section 1.5). |
