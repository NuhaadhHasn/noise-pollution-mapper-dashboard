# Architecture, Build/Deploy and Testing Audit - Noise Pollution Mapper Web Dashboard

> Generated 2026-10-15 - multi-agent cross-repo audit, read-only. Dimension agents (security, data layer, correctness, React/Vite, UX, performance, build/deploy) read the dashboard repo (`noise-pollution-mapper-dashboard`, HEAD `353bbdd`) and the Flutter app (`noise_pollution_mapper`, master `9b08e68`) as its contract counterpart only. Every Critical/High finding was re-checked by an adversarial verifier; uncertain claims default to refuted. Production facts come from the owner-run read-only probe of 2026-10-16 ~00:20 (`prod_probe.json`, aggregates only, no PII). No file outside `audit/` was modified, `serviceAccountKey.json` was never opened, and no build, install or network call to Firebase was made by the audit. The static-check results in the "Static checks" section below were produced once by a background job at below-normal priority and are quoted, not re-run.
>
> Status legend: `confirmed` = verifier re-proved it against the code; `partial` = mechanism confirmed, part of the claim corrected; `refuted` = disproved (kept for transparency, excluded from recommendations); `unverified` = not individually re-checked. Severity shown is the post-verification severity. Repo: `dashboard`, `app`, or `both`; "cross-repo" means the defect lives in the contract between the two clients.

## Executive Summary

Total findings in this area: **10** (0 Critical, 0 High, 2 Medium, 8 Low): 4 architecture (`arch-1`..`arch-4`), 5 build and deploy (`build-1`..`build-5`) and 1 testing (`test-1`). None was individually adversarially verified (all are `unverified (not individually re-checked)`); the evidence below was re-opened in the source files and quoted verbatim.

The dashboard builds cleanly and nothing here breaks production today. The risk is in what the toolchain does not catch, in dead code, and in stale operating instructions:

1. **The static checks pass because they are lax** (`arch-1`, `test-1`). `tsc -b` reports nothing and ESLint reports one warning, but `strict` is `false`, the Firebase handles are typed `any`, there is no test runner and no CI. The Timestamp/`toDate` defect reported elsewhere (`bug-1`) compiled cleanly for exactly this reason.
2. **A dead Storage cache pipeline and stale deploy guides** (`arch-2`, `build-1`, `build-2`, `build-4`). Functions, scripts, a downloader and a UI component all target a Firebase Storage bucket that does not exist. The untracked `DEPLOYMENT_GUIDE.md` still prints the old Firestore ruleset, which would drop the `users` and `app_config` grants if pasted into the console. The app's `firebase.json` still declares a `storage` target, so a bare `firebase deploy` (no `--only`) would hit the nonexistent bucket. The correct deploy command (`firebase deploy --only firestore:rules,firestore:indexes`, from the app repo) appears in neither repo's README.
3. **Duplicated logic and a fragile local database wrapper** (`arch-3`, `arch-4`). The 50/70 dB band, coordinate extraction and timestamp parsing are copy-pasted with diverging behaviour. The IndexedDB wrapper opens a connection per call and never closes it, so any future `DB_VERSION` bump can hang across tabs.
4. **Minor build hygiene** (`build-3`, `build-5`): no validation of the six `VITE_FIREBASE_*` variables, and the Cloud Functions runtime is pinned to Node 20.

## Static checks

Inputs: `tsc.log`, `eslint.log`, `build.log`, `bundle.txt` in the audit scratchpad (`.../scratchpad/dash/`). The completion marker `CHECKS_DONE` was present (it reads `CHECKS DONE`). The checks ran against the dashboard working tree at HEAD `353bbdd`. The build wrote to a scratch directory, so the repo's own `dist/` was not touched. Dependencies were installed beforehand with `npm ci` (`npm-ci.log`: 813 packages added, 2 deprecation warnings for `node-domexception@1.0.0` and `glob@10.5.0`).

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `npx tsc -b --pretty false` | `tsc.log` is empty (0 bytes): **0 diagnostics**. The exit code was not captured by the job script, so "0 errors" rests on the empty output. The project is not strict, see `arch-1`. |
| ESLint | `npx eslint . --format stylish` | **1 problem: 0 errors, 1 warning.** `src/components/map/CacheStatus.tsx 57:5 warning Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')`, flagged as fixable with `--fix`. |
| Vite build | `npx vite build --outDir <scratch>` | **Succeeded.** vite v7.3.1, 2,880 modules transformed, built in 7m 25s (on a loaded machine; `DEPLOYMENT_GUIDE.md` claims about 30 seconds). Emitted 3 files (below). One build warning: `(!) Some chunks are larger than 500 kB after minification`. |
| Bundle | `bundle.txt` | `1,422,665 bytes index-BKHYcTwv.js`, `92,045 bytes index-Bd92eCl1.css`, and `no server-only markers found in built JS` (the job searched the JS for `firebase-admin`, `private_key`, `serviceAccount` and `google-auth-library`; none present). |

Build output as printed in `build.log`:

| File | Size | Gzip |
|------|------|------|
| `index.html` | 0.48 kB | 0.31 kB |
| `assets/index-Bd92eCl1.css` | 92.05 kB | 19.84 kB |
| `assets/index-BKHYcTwv.js` | 1,422.67 kB | 419.78 kB |

Totals: 3 emitted files, exactly 1 JavaScript chunk and 1 CSS file, 1 chunk-size warning. No test results exist because the repo has no test runner (`test-1`).

Reading the results: a clean `tsc` and one lint warning are weak evidence of quality here. `tsconfig.app.json` sets `"strict": false` and the main Firebase handles are typed `any` (`arch-1`), and the single lint warning points at a file nothing imports (`arch-2`). The bundle check confirms the Admin SDK listed in `dependencies` (`build-4`) does not reach the browser bundle.

## Summary Table

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| arch-1 | Medium | TypeScript strictness is off and Firebase handles are typed any, so Timestamp and missing-field bugs compile cleanly | `tsconfig.app.json:26` (dashboard) | unverified |
| test-1 | Medium | No test runner, no tests and no CI, including no guard against the two firestore.rules copies drifting | `package.json:6` (both) | unverified |
| arch-2 | Low | Dead Firebase Storage cache pipeline (functions, upload scripts, cacheDownloader, CacheStatus) cannot deploy or run without a bucket, alongside other unreachable code | `src/utils/cacheDownloader.ts:15` (dashboard) | unverified |
| arch-3 | Low | dB-band, coordinate and timestamp logic is copy-pasted with diverging behaviour, themeConstants is dead and stale, and the VITE_*_THRESHOLD env vars are never read | `src/components/map/NoiseMarkers.tsx:32` (dashboard) | unverified |
| arch-4 | Low | IndexedDB wrapper opens a new connection per call, never closes it, and has no onblocked/onversionchange handling, so a DB_VERSION bump will hang across tabs | `src/utils/db.ts:20` (dashboard) | unverified |
| build-1 | Low | Deploy guides and comments embed an obsolete ruleset and nonexistent files and CLI commands that would regress the merged rules if followed | `DEPLOYMENT_GUIDE.md:229` (both) | unverified |
| build-2 | Low | App firebase.json still declares a storage target, so a bare firebase deploy hits the nonexistent bucket, and the cross-repo deploy procedure is undocumented in the dashboard | `storage.rules:10` (both) | unverified |
| build-3 | Low | No validation of VITE_FIREBASE_* env vars, so a missing value on Vercel crashes the app to a blank page at module load | `src/config/firebase.ts:16` (dashboard) | unverified |
| build-4 | Low | Server-only firebase-admin and misplaced packages sit in the browser app's dependencies with no Node engine pin, and Firebase Storage is initialised in the browser with no bucket | `package.json:22` (dashboard) | unverified |
| build-5 | Low | Cloud Functions runtime is pinned to Node 20, past upstream end-of-life | `functions/package.json:16` (dashboard) | unverified |

## Detailed Findings

### Critical

None. No finding in this area is a breach, data loss, or a production feature dead today.

### High

None. The one High in the neighbouring performance document (`perf-1`) is not an architecture, build or testing defect.

### Medium

#### [arch-1] TypeScript strictness is off and Firebase handles are typed any, so Timestamp and missing-field bugs compile cleanly

**Severity:** Medium | **Status:** unverified (not individually re-checked) | **Category:** architecture | **Repo:** dashboard | **Confidence:** high

**Location:** `tsconfig.app.json:26`, `src/config/firebase.ts:28-30`, `src/types/NoiseReading.ts:23` (dashboard)

**Description:**

The app project has `strict`, `noUnusedLocals` and `noUnusedParameters` all off (the Node tooling config next to it is strict). The `auth`, `db` and `storage` handles are annotated `any`, so every Firestore call in the app is untyped. Firestore documents are cast to `NoiseReading` without validation, and the type does not match what the app actually writes. The clean `tsc` result in the Static checks section is therefore not evidence that the code is type-safe.

**Evidence:**

`tsconfig.app.json:26-28`:
```
    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
```
`src/config/firebase.ts:28-30`:
```
export const auth: any = getAuth(app);
export const db: any = getFirestore(app);
export const storage: any = getStorage(app);
```
`src/types/NoiseReading.ts:23`: `confidence: number;` (declared required, while the app writes the field only for classified readings; the prod probe shows `confidence:number` on 691 of 3,374 documents). `src/utils/syncManager.ts` casts Firestore data with type assertions and no validation, for example `:120` `const data = doc.data() as NoiseReading;`, `db.ts:55` `resolve(request.result as NoiseReading[]);`, and the delta path (`:93`)'s `})) as NoiseReading[];`.

Counts from a grep of `src` (excluding `components/ui` for the second): 19 `no-explicit-any` suppression comments and 21 `as any` / `: any` occurrences. `tsc.log` is empty and `eslint.log` has 1 warning, so the lax configuration is why the checks pass.

**Impact:**

With `strictNullChecks` off, optional or missing fields (for example a reading without `soundClass`, which is 79.5% of production documents), plain-object timestamps and string fall-throughs for new category values are never flagged. A typo in a collection name or a query shape is not caught at build time because `db` is `any`. The Timestamp round-trip defect reported as `bug-1` shipped for this reason.

**Recommendation:**

Remove the `any` annotations on `auth`, `db` and `storage` (they infer correctly), then enable `strict` and fix the resulting errors once, starting with `strictNullChecks`. Add a runtime `parseReading(doc)` that validates and normalises Firestore data into one typed reading model before it enters IndexedDB. Make `confidence` and `soundClass` optional in the type to match production.

---

#### [test-1] No test runner, no tests and no CI, including no guard against the two firestore.rules copies drifting

**Severity:** Medium | **Status:** unverified (not individually re-checked) | **Category:** testing | **Repo:** both (cross-repo) | **Confidence:** high

**Location:** `package.json:6`, `firestore.rules:13-16`, `storage.rules` (both repos)

**Description:**

The dashboard has no test script, no test dependency and no CI workflow. The Flutter app has 205 tests. The dashboard and app each carry a copy of `firestore.rules` and `storage.rules`. Their content is identical and equals the deployed ruleset (owner probe: `matchesAppRepo` and `matchesDashRepo` both true), but nothing enforces that they stay identical. The comment in the rules file says to keep the other repo's copy byte-identical or delete it. The two working-tree copies already differ by line endings.

**Evidence:**

`package.json:6-10`: the scripts are `"dev": "vite"`, `"build": "tsc -b && vite build"`, `"lint": "eslint ."`, `"preview": "vite preview"`; there is no `test` script and no test package in `dependencies` or `devDependencies`. `git ls-files` for the dashboard shows no `.github` directory and no `firebase.json`.

`firestore.rules:13-16`:
```
// The app repo's firebase.json is what wires rules to a deploy
// ("firestore": {"rules": "firestore.rules"}); the dashboard repo has no
// firebase.json at all. Therefore: keep the copy in the OTHER repo BYTE
// IDENTICAL to this file, or DELETE it. Two divergent copies is exactly the
```
`git ls-files --eol firestore.rules storage.rules` in the dashboard: `i/lf    w/lf` for both. The same command in the app repo: `i/lf    w/crlf` for both. Both repos index LF; the working-tree CRLF in the app copy comes from `core.autocrlf=true`.

**Impact:**

Today the copies agree. A future rules edit in the app repo (a new field or collection) that is not mirrored leaves the dashboard copy stale, and anyone who later adds a `firebase.json` to the dashboard and deploys from there would revert the live rules, which is the last-deploy-wins incident the merged ruleset exists to end. A naive byte comparison would false-alarm forever because of the CRLF difference. A type or lint regression reaches Vercel production on push to `main` with no pre-merge check (Vercel runs `tsc -b` only at deploy time).

**Recommendation:**

Prefer deleting the dashboard copies of both rules files and pointing to the app repo as the single source. If the copies are kept, add a small script that compares them after stripping carriage returns (`tr -d '\r'`), run in CI. Add a GitHub Actions workflow running `npm ci && npm run lint && npx tsc -b && npm run build`. Add `vitest` with `jsdom`; useful first tests are a timestamp normaliser (Timestamp, plain `{seconds, nanoseconds}`, ISO string, missing), weekly bucketing, the sync delta window with a mocked local database, and a check that the category map covers every category the app can write (including `Quiet` and `Uncertain`).

---

### Low

#### [arch-2] Dead Firebase Storage cache pipeline (functions, upload scripts, cacheDownloader, CacheStatus) cannot deploy or run without a bucket, alongside other unreachable code

**Severity:** Low | **Status:** unverified (not individually re-checked) | **Category:** architecture | **Repo:** dashboard | **Confidence:** high

**Location:** `src/utils/cacheDownloader.ts:15`, `src/components/map/CacheStatus.tsx`, `scripts/upload-cache.sh:48`, `functions/src/cache-export.ts:19`, `src/utils/syncManager.ts:75-99` (dashboard)

**Description:**

The project has no Firebase Storage bucket (owner probe and project facts), yet the dashboard carries a complete pipeline that uploads to and downloads from one. Nothing in `src` imports `CacheStatus` or `cacheDownloader` (apart from `CacheStatus` importing the downloader), so the user-facing part is unreachable. `GlobalErrorPage` is also never imported. The one live consequence is a stale user-facing instruction and a latent branch in the sync code: `syncNewReadings` has a `cacheDownloaded` branch that only the dead downloader can enable, and in it, when no last-sync time exists, it fetches nothing yet still stamps the last-sync time.

**Evidence:**

`src/utils/cacheDownloader.ts:15`: `const CACHE_FILE_URL = 'https://firebasestorage.googleapis.com/v0/b/noise-pollution-mapper-9ad3d.appspot.com/o/cache%2Fnoise-readings-master-cache.json?alt=media';`

A grep of `src` finds no importer of `CacheStatus` (only its own file), of `cacheDownloader` (only `CacheStatus.tsx`), or of `GlobalErrorPage` (only its own file). `src/components/map/CacheStatus.tsx:55-58`: `useEffect(() => {` / `checkCacheStatus();` / `// eslint-disable-next-line react-hooks/exhaustive-deps` (the ESLint warning in the Static checks section is about this directive, line 57).

`scripts/upload-cache.sh:17`: `BUCKET="noise-pollution-mapper-9ad3d.appspot.com"`, `:48`: `firebase storage:upload "$CACHE_FILE" --bucket "$BUCKET" --destination "$DESTINATION"`. `functions/src/cache-export.ts:19`: `const bucket = admin.storage().bucket();` (executes at import time), `:63`: `export const exportCacheDaily = onSchedule({`, `:129`: `export const exportCacheWeekly = onSchedule({`.

`src/components/map/UserFilterToggle.tsx:108`: `For best performance with all users' data, download the shared cache file. This will load all readings instantly.`

`src/utils/syncManager.ts:75`: `const cacheDownloaded = await localDb.getSyncMetadata('cacheDownloaded');`, `:80`: `if (cacheDownloaded) {`, `:82`: `if (lastSync) {` (the only fetch inside that branch), and `:157`: `await setLastSyncTime(now);` (runs unconditionally afterwards). The flag is written only in `src/utils/cacheDownloader.ts:157`.

Unreferenced code (grep): `themeConstants.ts` exports `SOUND_CATEGORIES`, `DB_THRESHOLDS` and `getNoiseLevel` that nothing imports (`:41`, `:148`, `:155`); `src/components/ui/avatar`, `badge`, `chart` (355 lines), `scroll-area`, `select` and `tabs` have no importer outside `components/ui`; `db.ts` `getLatestTimestamp` has no caller; `src/assets/react.svg` is not referenced.

**Impact:**

Roughly a thousand lines of unreachable code, a user-facing instruction to use a feature that cannot work (no bucket, no UI), and an operator guide that tells someone to deploy functions that cannot run. If a stale `cacheDownloaded` flag ever exists in a browser's IndexedDB (an older build), `syncNewReadings` would skip the first sync yet stamp the last-sync time, hiding history; low today because the flag cannot be set. The scheduled functions would also call `makePublic()` (see `priv-3` in the security document) if a bucket were ever created.

**Recommendation:**

Delete `CacheStatus.tsx`, `cacheDownloader.ts`, `GlobalErrorPage.tsx` (or mount it as the root error fallback, see `build-3`), the unused `themeConstants` exports and unused `ui` files, `scripts/upload-cache.sh`, and the `cacheDownloaded` branch in `syncManager.ts`. Fix the `UserFilterToggle` copy. Decide separately whether to delete `functions/` and `scripts/export-cache-to-firestore.js`. Note on the original finding text: `updateManyReadings` is used (`syncManager.ts:97,151`) and `ui/skeleton` has three importers, so neither belongs on the dead-code list.

---

#### [arch-3] dB-band, coordinate and timestamp logic is copy-pasted with diverging behaviour, themeConstants is dead and stale, and the VITE_*_THRESHOLD env vars are never read

**Severity:** Low | **Status:** unverified (not individually re-checked) | **Category:** architecture | **Repo:** dashboard | **Confidence:** high

**Location:** `src/components/map/NoiseMarkers.tsx:32`, `src/components/analytics/DataTable.tsx:154`, `src/utils/exportHelpers.ts:185`, `src/utils/themeConstants.ts:148-165`, `.env.example:13` (dashboard)

**Description:**

The 50 and 70 dB band edges are hard-coded in at least four places with different labels, and the `.env.example` threshold variables are read by nothing. Coordinate extraction (four possible document shapes) is repeated in several files with different truthiness rules, although the app only ever writes flat `latitude`/`longitude` numbers. The timestamp-to-`Date` helper is duplicated. `themeConstants.ts` carries a stale 14-category map and a third copy of the band logic that nothing imports.

**Evidence:**

dB bands: `src/components/map/NoiseMarkers.tsx:32-36`:
```
function getMarkerColor(decibelLevel: number): string {
  if (decibelLevel < 50) return '#4CAF50'; // Green - Quiet
  if (decibelLevel <= 70) return '#FF9800'; // Orange - Moderate
  return '#F44336'; // Red - Loud
}
```
`src/components/analytics/DataTable.tsx:154-158`: `if (dB < 50) return 'Low';` / `if (dB <= 70) return 'Moderate';` / `return 'High';`. `src/utils/exportHelpers.ts:185-189`: `function getNoiseLevel(decibels: number): 'low' | 'moderate' | 'high' {` / `if (decibels < 50) return 'low';`. `src/utils/themeConstants.ts:149`: `low: 50, // < 50 dB = Quiet`, `:163`: `label: 'Quiet',`, and `:40`: `// Sound Categories (14 Categories - Session 29)`.

Unused configuration: `.env.example:13-14`: `VITE_HIGH_NOISE_THRESHOLD=` and `VITE_MODERATE_NOISE_THRESHOLD=` (values omitted here); the only `import.meta.env` use in `src` is `src/config/firebase.ts:16-21`.

Coordinates: `src/components/map/NoiseMarkers.tsx:124` `if (typeof read.latitude === 'number' && typeof read.longitude === 'number') {` (type-checked), `:298` `if (!lat || !lng) {` (truthiness), `src/components/map/HeatmapLayer.tsx:64` `return [lat || 0, lng || 0, intensity] as [number, number, number];`, `src/utils/exportHelpers.ts:33` `if (reading.latitude && reading.longitude) {`.

Timestamps: `function toDate(timestamp: unknown): Date {` is defined separately at `src/components/analytics/DataTable.tsx:52` and `src/components/analytics/NoiseTrendChart.tsx:24`, and parsed ad hoc in `NoiseMarkers.tsx` around `:179-211`.

**Impact:**

Changing a threshold or a field name takes several edits, and the copies already disagree: truthiness checks drop readings at latitude or longitude 0, and `lat || 0` plots a missing coordinate at 0,0. The same band is called "Quiet", "Low" and "low" in different places, and "Quiet" is now also the name of the new 18th sound category (`data-3` in the data-contract document), so a shared label would be ambiguous.

**Recommendation:**

Create one module (for example `src/lib/readings.ts`) exporting `getCoordinates`, `toDate`, a single dB-band function with one pair of threshold constants, and the category helpers. Replace the copies. Delete `themeConstants` exports nothing uses, and delete the three unused `.env.example` variables (or implement them). Reserve the label "Quiet" for the sound category and call the dB band "Low".

---

#### [arch-4] IndexedDB wrapper opens a new connection per call, never closes it, and has no onblocked/onversionchange handling, so a DB_VERSION bump will hang across tabs

**Severity:** Low | **Status:** unverified (not individually re-checked) | **Category:** architecture | **Repo:** dashboard | **Confidence:** medium

**Location:** `src/utils/db.ts:20` (dashboard)

**Description:**

Every helper in `db.ts` calls `openDB()`, which opens a fresh connection that is never closed. There is no `onblocked` or `onversionchange` handler. Separately, the `timestamp` index is created over a field whose stored value is an object, which IndexedDB cannot use as a key.

**Evidence:**

`src/utils/db.ts:18-41`:
```
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    ...
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
```
There is no `db.close()`, no `request.onblocked` and no `db.onversionchange` in the file. `src/utils/db.ts:28`: `store.createIndex('timestamp', 'timestamp', { unique: false });` (the `timestamp` value stored is a Firestore `Timestamp` object, which is cloned as a plain `{seconds, nanoseconds}` object and is not a valid index key, so those records are skipped by that index).

**Impact:**

Today this only leaks connections (up to six sync callers per page, each with several opens). The fixes proposed for the data-layer findings may need a schema change (normalising the timestamp to a number, a user-scoped store, or a forced cache purge via a `DB_VERSION` bump). With a second dashboard tab open, the upgrade is blocked by the old connections and, with no `onblocked` handler, the open promise never settles, so reads of the cache hang and the map and charts sit on loading state with no error.

**Recommendation:**

Cache a single connection promise at module scope. Set `db.onversionchange = () => db.close()` and handle `request.onblocked` with a visible "close other tabs" message. Do this before any commit that bumps `DB_VERSION`. Store the timestamp as epoch milliseconds (then the index works) or drop the index.

---

#### [build-1] Deploy guides and comments embed an obsolete ruleset and nonexistent files and CLI commands that would regress the merged rules if followed

**Severity:** Low | **Status:** unverified (not individually re-checked) | **Category:** build-deploy | **Repo:** both (cross-repo) | **Confidence:** high

**Location:** `DEPLOYMENT_GUIDE.md:229` (untracked), `storage.rules:10-12`, `scripts/upload-cache.sh:48`, `functions/DEPLOYMENT_GUIDE.md:25` (dashboard)

**Description:**

The untracked root `DEPLOYMENT_GUIDE.md` tells the operator to configure Firestore rules and prints the pre-merge ruleset, which has no `users` or `app_config` block and no `userId`-reassignment guard. Other documents and comments refer to a file (`firebase.rules`) that no longer exists, to a CLI command that does not exist, and to deploying functions from a repo with no `firebase.json`.

**Evidence:**

`DEPLOYMENT_GUIDE.md:229`: `Ensure Firestore rules are properly configured:` followed by a block containing `allow read: if request.auth != null;` and, at `:244`: `allow update, delete: if request.auth != null` (the block has no `users` or `app_config` match and no catch-all).

`storage.rules:10-12`: `//               (its Storage rules live in the misleadingly named` / `//                `firebase.rules` — despite the name that file is STORAGE` / `//                rules, not Firestore rules)`. The file does not exist in the repo.

`scripts/upload-cache.sh:48`: `firebase storage:upload "$CACHE_FILE" --bucket "$BUCKET" --destination "$DESTINATION"` (`storage:upload` is not a firebase-tools command, and the bucket does not exist). `functions/DEPLOYMENT_GUIDE.md:25`: `firebase deploy --only functions:exportCacheDaily,functions:exportCacheWeekly` (the dashboard repo has no `firebase.json`), `:112` and `:127`: `firebase functions:call exportCacheDaily`. `DEPLOYMENT_GUIDE.md:9`: `Node.js 18+ and npm` (installed Vite 7 requires `^20.19.0 || >=22.12.0`, per `node_modules/vite/package.json:57`), `:87` `VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX` and `:90` `VITE_ENABLE_ANALYTICS=true` (nothing reads either).

**Impact:**

Pasting the guide's ruleset into the console would drop the `users` and `app_config` grants (the app's profile and donation features would break) and remove the reassignment guard. That is the same last-deploy-wins regression the merged ruleset exists to end. The Node and variable lists also mislead a fresh Vercel setup.

**Recommendation:**

Replace the guide's rules block with a pointer: rules live in `noise_pollution_mapper/firestore.rules` and deploy only with `firebase deploy --only firestore:rules,firestore:indexes` from the app repo. Fix the `storage.rules` comment (or delete the dashboard's `storage.rules`), delete `scripts/upload-cache.sh` and `functions/DEPLOYMENT_GUIDE.md`, and delete `SESSION_39_SUMMARY.md` (history lives in git). Commit a short README "Environment and deploy" section with the six required `VITE_FIREBASE_*` names and Node `>=20.19`.

---

#### [build-2] App firebase.json still declares a storage target, so a bare firebase deploy hits the nonexistent bucket, and the cross-repo deploy procedure is undocumented in the dashboard

**Severity:** Low | **Status:** unverified (not individually re-checked) | **Category:** build-deploy | **Repo:** both (cross-repo) | **Confidence:** medium

**Location:** `noise_pollution_mapper/firebase.json` (app), `storage.rules:10-12`, `README.md` (dashboard)

**Description:**

The app's `firebase.json` wires both Firestore and Storage deploy targets, but the project has no Storage bucket. A deploy without `--only` would therefore attempt the Storage target and fail. The correct command lives only in memory notes and the closed mobile audit, not in either repo's README. The dashboard README is the unmodified Vite template.

**Evidence:**

`noise_pollution_mapper/firebase.json`:
```
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  }
```
`README.md:3`: `This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.` (a grep for "deploy" finds nothing in the file). `storage.rules:10-12` refers to the nonexistent `firebase.rules`. The dashboard has no `firebase.json`.

**Impact:**

A bare `firebase deploy` from the app repo attempts the Storage target and fails or aborts partway, which has been called out as a trap. The stale `firebase.rules` reference misleads anyone searching for the dashboard's rules.

**Recommendation:**

Document the single rules-deploy command (`firebase deploy --only firestore:rules,firestore:indexes`, app repo only, never `--only storage`) in both READMEs. Remove the `storage` block from the app `firebase.json` and delete both `storage.rules` until a bucket exists. The app repo is public and the dashboard repo is private; keep the deploy note free of account details. The playbook carries the exact edits.

---

#### [build-3] No validation of VITE_FIREBASE_* env vars, so a missing value on Vercel crashes the app to a blank page at module load

**Severity:** Low | **Status:** unverified (not individually re-checked) | **Category:** build-deploy | **Repo:** dashboard | **Confidence:** medium

**Location:** `src/config/firebase.ts:16` (dashboard)

**Description:**

The Firebase config is read straight from `import.meta.env` with no presence check, and `getAuth(app)` runs at module load. The root of the app has no error boundary. The only list of required Vercel variables sits in the untracked `DEPLOYMENT_GUIDE.md`.

**Evidence:**

`src/config/firebase.ts:16-25`:
```
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  ...
const app = initializeApp(firebaseConfig);
...
export const auth: any = getAuth(app);
```
A grep of `src` shows these six reads (`:16-21`) are the only `import.meta.env` use. `src/main.tsx:6-10`: `createRoot(document.getElementById('root')!).render(` / `<StrictMode>` / `<App />`, with no boundary. `ErrorBoundary` is mounted only at `src/pages/DashboardPage.tsx:113` and `src/pages/MapPage.tsx:145`. `vercel.json` declares no environment variables.

**Impact:**

Vite inlines `undefined` at build time for an absent variable (for example in a fresh Vercel project or preview environment). Firebase's `getAuth()` validates the API key and throws `auth/invalid-api-key` during module evaluation, before React mounts. The user sees an empty page, the error shows only in DevTools, and the build itself is green. Variables added after a build also need a redeploy. This is expected behaviour of the Firebase SDK; the claim that it throws at module load was not exercised (no code was run).

**Recommendation:**

In `firebase.ts`, collect the six required names, throw a clear error listing any that are missing, and render that message from `main.tsx` (a try/catch around a dynamic import, or a root `ErrorBoundary` using the existing `GlobalErrorPage`). Commit an "Environment" section to the README.

---

#### [build-4] Server-only firebase-admin and misplaced packages sit in the browser app's dependencies with no Node engine pin, and Firebase Storage is initialised in the browser with no bucket

**Severity:** Low | **Status:** unverified (not individually re-checked) | **Category:** build-deploy | **Repo:** dashboard | **Confidence:** high

**Location:** `package.json:22`, `src/config/firebase.ts:12,30`, `vercel.json:4` (dashboard)

**Description:**

`firebase-admin` is listed under the SPA's `dependencies`, although only `scripts/` use it. `@types/react-router-dom` (v5 types) sits next to `react-router-dom` v7, which ships its own types. `leaflet` and `react-leaflet`, which are runtime imports, are under `devDependencies`. `autoprefixer` and `postcss` are listed although the Tailwind 4 Vite plugin does not need them. There is no `engines` field although Vite 7 and the React plugin require Node `^20.19.0 || >=22.12.0`. Vercel installs with `npm install`, not `npm ci`.

**Evidence:**

`package.json:22`: `"firebase-admin": "^13.7.0",` under `dependencies`. `package.json:17`: `"@types/react-router-dom": "^5.3.3",`; `:46` `"leaflet": "^1.9.4",` and `:48` `"react-leaflet": "^5.0.0",` appear in the `devDependencies` block (which starts at `:33`). `bundle.txt`: `no server-only markers found in built JS` (the Admin SDK does not reach the browser bundle today). `node_modules/vite/package.json:57` and `node_modules/@vitejs/plugin-react/package.json:63`: `"node": "^20.19.0 || >=22.12.0"`. `vercel.json:4`: `"installCommand": "npm install",`. `src/config/firebase.ts:12`: `import { getStorage } from 'firebase/storage';` and `:30`: `export const storage: any = getStorage(app);`, with no importer of `storage` in `src`.

**Impact:**

Every Vercel build installs the Admin SDK dependency tree for nothing, and an accidental import of it from `src` would try to bundle a service-account SDK into the browser build. The Storage SDK ships to every browser for a bucket that does not exist (see `perf-5`). With no `engines` pin, a build on an older Node fails with an opaque error. Packages in `devDependencies` still build correctly today because Vercel installs dev dependencies, so the misplacement is a hygiene issue, not a failure.

**Recommendation:**

Move `firebase-admin` to `scripts/`' own `package.json` or to `devDependencies`. Remove `@types/react-router-dom`, `postcss` and `autoprefixer`. Move `leaflet` and `react-leaflet` to `dependencies`. Add `"engines": {"node": ">=20.19.0"}`, switch Vercel's `installCommand` to `npm ci`, and delete `getStorage` and the `storage` export.

---

#### [build-5] Cloud Functions runtime is pinned to Node 20, past upstream end-of-life

**Severity:** Low | **Status:** unverified (not individually re-checked) | **Category:** build-deploy | **Repo:** dashboard | **Confidence:** medium

**Location:** `functions/package.json:16` (dashboard)

**Description:**

The functions package pins Node 20 and uses an older Admin SDK major than the root `package.json`. The functions cannot be deployed today anyway (no `firebase.json`, no bucket), so this is only relevant if they are revived.

**Evidence:**

`functions/package.json:15-17`: `"engines": {` / `"node": "20"` / `},`. `functions/package.json:19`: `"firebase-admin": "^12.0.0",`. Root `package.json:22`: `"firebase-admin": "^13.7.0",`.

**Impact:**

Node 20 reached upstream end-of-life on 2026-04-30, and Google deprecates and eventually blocks new deploys on end-of-life Cloud Functions runtimes, so a future deploy may be refused until the runtime is bumped. The exact Google decommission date was not verified. Low because the functions are not deployable today.

**Recommendation:**

If the functions are kept, set `engines.node` to 22 and align `firebase-admin` with the root (`^13`). If they are deleted (see `arch-2`), this finding disappears.

---

### Enhancement

None recorded for this area.
