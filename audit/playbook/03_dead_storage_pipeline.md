# Playbook 03 — Dead Storage Pipeline Removal

Implementation spec for the defect cluster covering the Firebase Storage cache pipeline, which cannot run because the project has no Storage bucket: the Cloud Functions that `makePublic()` a full readings dump, the upload script, the browser cache downloader and its unmounted UI, the user-facing copy that recommends it, and the browser Storage init and Admin SDK dependency that sit beside it.

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors) and `npx eslint <the files the step changed>` (0 errors, no new warnings; skip deleted files); run `npm test` and `npm run build` ONCE, at the end of Step 3 (master playbook §1.3).**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`). If a BEFORE block does not match, STOP and re-read the file — do not guess. Match on exact text, never on line numbers.

Environment facts (verified):
- The Firebase project `noise-pollution-mapper-9ad3d` has NO Storage bucket (`.appspot.com`, `.firebasestorage.app` and the bare id all `exists=false`). Nothing in this cluster may run `firebase deploy --only storage` or a bare `firebase deploy`.
- `functions/` tracks 8 files (verify with `git ls-files functions`): `functions/DEPLOYMENT_GUIDE.md`, `functions/lib/cache-export.js`, `functions/lib/index.js` (tracked build output), `functions/package-lock.json`, `functions/package.json`, `functions/src/cache-export.ts`, `functions/src/index.ts` and `functions/tsconfig.json`. `functions/node_modules` is untracked (gitignored via `node_modules`). `functions/package.json` pins `"engines": { "node": "20" }`, `firebase-admin ^12.0.0`, `firebase-functions ^7.0.3`.
- `functions/src/cache-export.ts` exports two `onSchedule` functions, `exportCacheDaily` (`0 2 * * *`) and `exportCacheWeekly` (`0 3 * * 1`), both `region: "us-central1"`. Each calls `await file.makePublic();` (`cache-export.ts:115` and `:167`) straight after `predefinedAcl: "projectPrivate"` (`:105`, `:164`). `:19` runs `admin.storage().bucket()` at import time.
- No `firebase.json` exists in the dashboard repo, and `APP:firebase.json` declares no `functions` block, so these functions have no checked-in deploy path. Whether they were ever deployed is answered only by manual action M2 below.
- The dashboard `package.json` is `"type": "module"`, `firebase ^12.10.0`, `firebase-admin ^13.7.0` (installed `13.7.0`), `react-router-dom ^7.13.1` (installed `7.13.1`, ships its own types via `"types": "./dist/index.d.ts"`), `@types/react-router-dom ^5.3.3` (installed `5.3.3`). Installed Node `v20.20.0`, npm `10.8.2`.
- `tsconfig.app.json` sets `"types": ["vite/client"]`, so `@types/react-router-dom` is never auto-included; removing it cannot change type resolution of `react-router-dom` (the package's own `types` field wins). `tsconfig.json`/`tsconfig.node.json` never reference `functions/` or `scripts/`.
- `eslint.config.js` lints `**/*.{ts,tsx}` with `globalIgnores(['dist'])` only, so `functions/src/*.ts` is linted today and stops being linted when deleted.
- `src/` has NO importer of `CacheStatus` (grep: only its own file). `src/utils/cacheDownloader.ts` is imported only by `CacheStatus.tsx`. `storage` from `src/config/firebase.ts` is imported nowhere. `src/components/ui/progress.tsx` is imported only by `CacheStatus.tsx`.
- Baseline from the audit's precomputed checks: `tsc -b` 0 errors; eslint 0 errors + 1 warning (`CacheStatus.tsx:57:5 Unused eslint-disable directive`, deleted by Step 2); `bundle.txt`: "no server-only markers found in built JS" (`firebase-admin` is not bundled).
- `package.json`, `package-lock.json`, `.gitignore`, `src/config/firebase.ts` and `src/components/map/UserFilterToggle.tsx` are all LF in the index and the working tree (`git ls-files --eol`: `i/lf w/lf`).
- This cluster depends on cluster 01 only for `package.json` (Step 3 edits it after 01.1 added `vitest` and the `test` script, and 02.1 added `check:rules`). The BEFORE blocks for `package.json` below avoid every region 01 and 02 touch.

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| priv-3 | CONFIRMED (Medium, confidence high) | `functions/src/cache-export.ts:115` and `:167` call `file.makePublic()` on a full readings dump (exact lat/lng, `userId`). Inert today (no bucket), armed the moment Storage is enabled in the console. Step 1 deletes `functions/` and `scripts/upload-cache.sh`; M2 removes any deployed copy. |
| build-5 | CONFIRMED (Low, confidence medium) | `functions/package.json:15-17` pins Cloud Functions to Node 20 (past upstream EOL). Closed by deleting `functions/`; no runtime bump is needed because nothing is kept. |
| arch-2 | CONFIRMED (Low, confidence high) — only the Storage-pipeline part | `src/utils/cacheDownloader.ts:15` targets a nonexistent `.appspot.com` bucket and `CacheStatus.tsx` is imported nowhere. Step 2 deletes both. The other arch-2 dead code (unused `ui/*` files, `useSyncedReadings` `loadData`, `db.ts` helpers, `react.svg`) is NOT in this cluster (see Out of scope). |
| ux-7 | CONFIRMED (Low, confidence high) | `UserFilterToggle.tsx:108` tells users to "download the shared cache file", which no UI offers; `:22-23` call the filter "secure" and say All Users "requires downloading shared cache". Step 2 removes the recommendation and rewrites the comment honestly. |
| build-4 | CONFIRMED (Low, confidence high) — only the firebase-admin and Storage parts | `package.json:22` puts the server-only `firebase-admin` in the SPA's `dependencies`; `src/config/firebase.ts:12,30` initialise browser Storage with no bucket; `package.json:17` carries the redundant `@types/react-router-dom` v5. Step 3 fixes all three. The remaining build-4 sub-items (`react-leaflet`/`leaflet` placement, `autoprefixer`/`postcss`, `engines`, `npm ci` in `vercel.json`) are NOT in this cluster. |

Full finding text and verifier evidence: grep the IDs in `audit/00_MASTER_AUDIT_REPORT.md`, `audit/05_SECURITY_AUDIT.md`, `audit/06_ARCHITECTURE_AND_CODE_QUALITY.md`.

---

## Pre-reading

Open these files before touching anything:

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md` — §2 (conventions 2.3, 2.5, 2.6, 2.14), §3.4 (decision D4), §4.12 (`package.json` sequence), §4.13 (`firebase.ts` hand-off to 12.1), §5 (commit #7-#9 and manual action M2).
2. `functions/src/cache-export.ts` — whole file (`makePublic()` at `:115` and `:167`), and `functions/src/index.ts`.
3. `scripts/upload-cache.sh` — whole file. `scripts/export-cache.js` and `scripts/export-cache-to-firestore.js` are READ ONLY context: they stay (master §7). Never open `serviceAccountKey.json`, which they reference.
4. `src/utils/cacheDownloader.ts` (header and `CACHE_FILE_URL` at `:15`) and `src/components/map/CacheStatus.tsx` (imports at `:1-13`, the eslint directive at `:57`).
5. `src/components/map/UserFilterToggle.tsx` — whole file (141 lines). Its only importer is `src/pages/MapPage.tsx:8`.
6. `src/config/firebase.ts` — whole file (33 lines).
7. `package.json` — whole file, and `.gitignore:53-59`.
8. `src/utils/syncManager.ts:75-99` — READ ONLY. The `cacheDownloaded` branch stays here; cluster 05.1 deletes it.

---

## Steps

### Step 1 — priv-3, build-5: delete the `makePublic()` cache-export functions and the upload script

**Goal:** Remove every checked-in path that can publish the readings dump through Firebase Storage: the `functions/` package (both scheduled exporters and the tracked `functions/lib` build output) and `scripts/upload-cache.sh`. Fix the `.gitignore` comment that tells the reader to regenerate the cache with the deleted function. After this step no file in the repo calls `makePublic()` or targets Storage.

**Files:**
- `functions/` (entire directory, deleted: `src/`, `lib/`, `package.json`, `package-lock.json`, `tsconfig.json`, `DEPLOYMENT_GUIDE.md`)
- `scripts/upload-cache.sh` (deleted)
- `.gitignore` (modified: one comment line)

`scripts/export-cache.js` and `scripts/export-cache-to-firestore.js` are NOT touched (parked in master §7).

**Exact changes**

1a. Delete the tracked `functions/` tree and the upload script. From the DASH root run exactly:

```
git rm -r functions/
git rm scripts/upload-cache.sh
```

Then remove the leftover untracked dependency folder that `git rm` cannot see, so no stale `functions/` directory remains on disk:

```
rm -rf functions/node_modules
rmdir functions
```

`rmdir` fails if anything else is still inside `functions/`; if it does, run `ls -A functions` and stop to investigate, never `rm -rf functions` blindly. Do not stage anything under `functions/node_modules` (it is gitignored by the `node_modules` rule at `.gitignore:10`).

1b. `.gitignore` — fix the stale pointer to the deleted function.

BEFORE (`.gitignore`, lines 57-59, verbatim):
```
# 2026-09-09; history was rewritten to purge it. Never commit it again.
# Regenerate it with functions/src/cache-export.ts instead.
cache/
```

AFTER:
```
# 2026-09-09; history was rewritten to purge it. Never commit it again.
# scripts/export-cache.js can still write it locally; keep it out of git.
cache/
```

Placement note: only line 58 changes. Lines 55-56 above the block and the `cache/` rule stay byte-identical. The `/serviceAccountKey.json` rule at `.gitignore:53` must stay untouched (master §2.5).

**Edge cases to preserve**
- Keep `scripts/export-cache.js` and `scripts/export-cache-to-firestore.js` exactly as they are. `export-cache.js:124` still prints a stale `firebase storage:upload` hint; that is parked with those scripts in master §7, not fixed here.
- `storage.rules` and `firestore.rules` still mention `functions/src/cache-export.ts` in comments (`storage.rules:60,63`, `firestore.rules:24`). They are byte-mirrored with the APP repo. Do NOT edit them here: cluster 02 rewrites the `firestore.rules` comments generically, and the `storage.rules` removal is master §7 build-2 (APP-repo change, owner sign-off).
- Do not touch `APP:firebase.json` (it declares no `functions` block, so there is nothing to remove there).
- Never run `firebase deploy --only storage`, a bare `firebase deploy`, or `firebase deploy --only functions` in this step or this cluster.
- Stage by explicit path. The untracked `DEPLOYMENT_GUIDE.md`, `SESSION_39_SUMMARY.md` and `audit/` must NOT be staged (never `git add -A`). `git rm` stages the deletions itself; add only `.gitignore` explicitly.
- Deleting `functions/` removes the deployed functions' only source. If M2 finds them deployed, the delete command in M2 needs only their names and region, which are recorded above (`exportCacheDaily`, `exportCacheWeekly`, `us-central1`).

**Acceptance criteria**
- `git ls-files functions scripts/upload-cache.sh` prints nothing. `ls functions` reports "No such file or directory".
- `git ls-files scripts` lists exactly `scripts/export-cache-to-firestore.js` and `scripts/export-cache.js`.
- `grep -rn "makePublic" . --include=*.ts --include=*.js --include=*.tsx --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=audit` prints nothing.
- `.gitignore` line 58 reads `# scripts/export-cache.js can still write it locally; keep it out of git.` and `.gitignore:53` is still `/serviceAccountKey.json`.
- `git diff --cached --stat` shows only deletions under `functions/`, the deletion of `scripts/upload-cache.sh`, and the one-line `.gitignore` change.

**Verify**
```
git rm -r functions/
git rm scripts/upload-cache.sh
rm -rf functions/node_modules
rmdir functions
npx tsc -b
git ls-files functions scripts/upload-cache.sh
git ls-files scripts
git status --short
git diff --cached --stat
```
Manual:
- `npx tsc -b` still reports 0 errors (nothing in `src/` referenced `functions/`).
- No `npx eslint` target: no `.ts/.tsx` file is changed (the deleted `functions/src/*.ts` are gone).
- `git status --short` lists the deletions (`D`), ` M .gitignore`, and still the three untracked paths `?? DEPLOYMENT_GUIDE.md`, `?? SESSION_39_SUMMARY.md`, `?? audit/` unstaged.
- Do NOT run `npm run build` in this step.
- Then perform MANUAL action M2 below before starting Step 2.

**Commit title:** `fix(privacy): delete Storage cache-export functions that makePublic() the readings dump (priv-3, build-5)`

---

### MANUAL action M2 — owner-gated (decision D4), runs between Step 1 and Step 2, NOT a commit

**Goal:** Learn whether `exportCacheDaily` or `exportCacheWeekly` is deployed to production, remove them only with explicit owner approval, and record whether the project is on Blaze.

1. Run this read-only command (no flags that change state):
   ```
   firebase functions:list --project noise-pollution-mapper-9ad3d
   ```
   The CLI is logged in as the owner's Google account (`firebase login:list` shows which). If it errors because the Cloud Functions API is not enabled, or because the project is on the Spark plan, record that exact error text: it is itself the answer (nothing is deployed, and the project is not on Blaze). Stop M2 there.
2. If neither `exportCacheDaily` nor `exportCacheWeekly` appears in the listing, there is nothing to delete. Record "M2: no cache-export functions deployed" and continue to Step 2.
3. If either appears, show the owner this exact command, using the region the listing prints (the source says `us-central1`):
   ```
   firebase functions:delete exportCacheDaily exportCacheWeekly --project noise-pollution-mapper-9ad3d --region us-central1
   ```
   Wait for an explicit "yes". Silence, or approval of something else, is not a yes. Run it only on that yes, and answer the CLI's own confirmation prompt per the owner's reply. Deleting a scheduled v2 function also removes its Cloud Scheduler job. Never add `--force` unless the owner says so.
4. Record the outcome in the commit body of Step 3 (the last commit of this cluster), or in the PR description: which functions were listed, whether they were deleted, and whether the project is on Blaze (a successful `functions:list` of a v2 scheduled function implies Blaze; an API-not-enabled or plan error implies Spark). This feeds the perf-1 severity (master §6.7) and master §7 "Billing plan check".

**Edge cases to preserve**
- Read-only first. Never run `functions:delete`, `functions:config:*` or any `deploy` without the owner's yes.
- Do not delete anything except `exportCacheDaily` and `exportCacheWeekly`. If the listing shows other functions, leave them and tell the owner.
- Do not touch Storage: there is no bucket, and nothing may be created.

---

### Step 2 — arch-2, ux-7: remove the dead cache downloader, `CacheStatus` and their UI copy

**Goal:** Delete the browser half of the dead Storage pipeline (`cacheDownloader.ts`, whose `CACHE_FILE_URL` targets a nonexistent bucket, and `CacheStatus.tsx`, which nothing imports and which holds the only eslint warning). Remove the "download the shared cache file" recommendation from the All Users confirmation dialog, and describe the filter honestly in the header comment: it shows only the readings you recorded, and it is a view filter, not an access control.

**Files:**
- `src/utils/cacheDownloader.ts` (deleted)
- `src/components/map/CacheStatus.tsx` (deleted)
- `src/components/map/UserFilterToggle.tsx` (modified)

**Exact changes**

2a. Delete the two dead files. From the DASH root run exactly:

```
git rm src/utils/cacheDownloader.ts src/components/map/CacheStatus.tsx
```

Before deleting, confirm nothing imports them:

```
grep -rn "cacheDownloader\|CacheStatus" src
```

The only hits must be inside the two files being deleted. If any other file matches, STOP: that file is a live consumer this spec did not find.

2b. `src/components/map/UserFilterToggle.tsx` — header comment (ux-7, the "secure" and "requires downloading shared cache" claims).

BEFORE (`src/components/map/UserFilterToggle.tsx`, lines 22-23, verbatim):
```
 * Default: My Readings Only (secure, minimal Firebase reads)
 * Optional: All Users (requires downloading shared cache)
```

AFTER:
```
 * My Readings Only: shows only the readings you recorded.
 * All Users: shows readings from every contributor.
 * Both modes are a view filter over the readings already synced to this
 * browser; neither is an access control.
```

Placement note: the lines directly above (the `/**` line, ` * UserFilterToggle - Toggle between "My Readings Only" and "All Users"`, and the ` * ` line that carries one trailing space) and the closing ` */` line below stay byte-identical. The comment deliberately does not name a default: cluster 09.3 changes the default `showAllUsers` in `MapPage.tsx`.

2c. `src/components/map/UserFilterToggle.tsx` — remove the recommendation panel from the confirmation dialog (ux-7).

BEFORE (`src/components/map/UserFilterToggle.tsx`, lines 97-112, verbatim; line 111 is a whitespace-only line of exactly 14 spaces):
```
              <div className={`p-3 rounded-lg ${
                isDarkMode ? 'bg-gray-800' : 'bg-blue-50'
              }`}>
                <p className={`text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-blue-400' : 'text-blue-800'
                }`}>
                  💡 Recommendation:
                </p>
                <p className={`text-sm ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  For best performance with all users' data, download the shared cache file. This will load all readings instantly.
                </p>
              </div>
              
              <p className={`text-sm ${
```

AFTER:
```
              <p className={`text-sm ${
```

Placement note: the whitespace-only line that precedes the BEFORE block (line 96, 14 spaces, between `</p>` and `<div`) is NOT part of the block and stays, so the dialog body keeps one blank separator line between the `This will show noise readings from <strong>all users</strong>...` paragraph and the `You can switch back to "My Readings Only" at any time.` paragraph. After the edit the region reads:
```
              <p>
                This will show noise readings from <strong>all users</strong> instead of just your own.
              </p>
              
              <p className={`text-sm ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                You can switch back to "My Readings Only" at any time.
              </p>
```
All other code in the file is unchanged: `AlertCircle` is still used by the dialog title, and every import (`useState`, `Users`, `User`, `AlertCircle`, `useTheme`, `Button`, the `Dialog*` parts) is still referenced, so no import line changes.

**Edge cases to preserve**
- Do NOT touch `src/utils/syncManager.ts`. Its `cacheDownloaded` branch (`syncManager.ts:75-99`) is deleted by cluster 05.1, not here. After this step the metadata key `cacheDownloaded` is never written by any code; a stale value in an old browser's IndexedDB is purged by the cluster-04.4 schema bump.
- Do NOT delete `src/components/ui/progress.tsx` even though `CacheStatus.tsx` was its only importer; the unused-`ui/*` sweep is parked in master §7 ("dead-code sweep"). Do not remove the `@radix-ui/react-progress` dependency either.
- The toggle's button label (`My Readings Only` / `All Users`), its `title` strings, `handleToggle`, `handleConfirmAllUsers`, `handleCancel`, the dialog title `Switch to All Users Mode?`, and the `Cancel` / `Show All Users` buttons stay exactly as they are. `MapPage.tsx` passes the same two props and needs no change.
- Do not add a new "cache" or "download" sentence anywhere. The dialog now says only what All Users does and that you can switch back.
- Do not add or edit any test, and do not add a runtime dependency.

**Acceptance criteria**
- `src/utils/cacheDownloader.ts` and `src/components/map/CacheStatus.tsx` no longer exist; `git ls-files src | grep -iE "cachedownloader|cachestatus"` prints nothing.
- `grep -rn "cacheDownloader\|CacheStatus\|shared cache" src` prints nothing. (`grep -rn "cacheDownloaded" src` still prints the `syncManager.ts` branch; that is expected until 05.1.)
- `grep -rn "Recommendation\|secure, minimal" src/components/map/UserFilterToggle.tsx` prints nothing.
- On `/map`, clicking the toggle to switch to All Users opens a dialog that says it will show readings from all users, followed by "You can switch back to "My Readings Only" at any time." and no light-bulb panel, no mention of a cache file or a download.
- `npx eslint src/components/map/UserFilterToggle.tsx` reports 0 errors and 0 warnings; the baseline `CacheStatus.tsx:57` warning is gone with its file.

**Verify**
```
grep -rn "cacheDownloader\|CacheStatus" src
git rm src/utils/cacheDownloader.ts src/components/map/CacheStatus.tsx
npx tsc -b
npx eslint src/components/map/UserFilterToggle.tsx
grep -rn "cacheDownloader\|CacheStatus\|shared cache" src
git status --short
```
Manual:
- The first `grep` (before `git rm`) must show hits only inside the two files being deleted; the last `grep` (after) must print nothing.
- Run the dev server only if the machine is otherwise idle (never alongside `tsc` or a build): open `/map`, sign in, click "My Readings Only", and confirm the dialog copy above. Stop the dev server before the next step.
- Do NOT run `npm run build` in this step.

**Commit title:** `refactor(cache): remove the dead Storage cache downloader, CacheStatus and their UI copy (arch-2, ux-7)`

---

### Step 3 — build-4: drop browser Storage init and move `firebase-admin` to `devDependencies`

**Goal:** Stop shipping the Firebase Storage SDK to every browser for a bucket that does not exist, and stop installing the server-only Admin SDK as a runtime dependency of the SPA. `firebase-admin` is used only by `scripts/*.js` (it is not bundled; `bundle.txt`: "no server-only markers found in built JS"). Also remove the misplaced `@types/react-router-dom` v5, because `react-router-dom` v7 ships its own types.

**Files:**
- `src/config/firebase.ts` (modified)
- `package.json` (modified: `dependencies`, `devDependencies`)
- `package-lock.json` (modified by npm, never by hand)

**Exact changes**

3a. `src/config/firebase.ts` — remove the Storage import.

BEFORE (`src/config/firebase.ts`, lines 11-12, verbatim):
```
import { getFirestore } from 'firebase/firestore'; // Changed from 'firebase/firestore/lite' to support onSnapshot
import { getStorage } from 'firebase/storage';
```

AFTER:
```
import { getFirestore } from 'firebase/firestore'; // Changed from 'firebase/firestore/lite' to support onSnapshot
```

3b. `src/config/firebase.ts` — remove the `storage` export (nothing imports it).

BEFORE (`src/config/firebase.ts`, lines 29-30, verbatim):
```
export const db: any = getFirestore(app);
export const storage: any = getStorage(app);
```

AFTER:
```
export const db: any = getFirestore(app);
```

Placement note: the file's final shape after 3a and 3b is the original with exactly two lines removed. `/* eslint-disable @typescript-eslint/no-explicit-any */` at the top stays (`auth` and `db` are still `any` until cluster 12.1). The `storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET` line inside `firebaseConfig` stays: it is a plain config key, harmless without a bucket, and removing it would also touch the documented `.env` variable list. `export default app;` stays. **Cluster 12.1 anchors on this file:** its BEFORE block must be the two lines `export const auth: any = getAuth(app);` / `export const db: any = getFirestore(app);` with no `storage` line (master §4.13).

3c. Move `firebase-admin` to `devDependencies`. From the DASH root run exactly, with nothing else running (the machine has 2 cores and about 2 GB free; npm operations here can take many minutes):

```
npm install -D -E firebase-admin@13.7.0
```

`13.7.0` is the exact version already installed and locked, so the move changes no resolved version. npm moves the entry out of `dependencies` into `devDependencies` and regenerates `package-lock.json`. Never hand-edit the lockfile, and commit it in this same step (master §2.14). Do not use `--legacy-peer-deps` or `--force`.

Expected `package.json` result for the `dependencies` block (line removed):

BEFORE (`package.json`, lines 21-23, verbatim):
```
    "firebase": "^12.10.0",
    "firebase-admin": "^13.7.0",
    "leaflet.heat": "^0.2.0",
```

AFTER:
```
    "firebase": "^12.10.0",
    "leaflet.heat": "^0.2.0",
```

Expected `package.json` result for the `devDependencies` block (entry added in npm's alphabetical position, exact pin, no caret):

BEFORE (`package.json`, lines 44-45, verbatim):
```
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
```

AFTER:
```
    "eslint-plugin-react-refresh": "^0.4.24",
    "firebase-admin": "13.7.0",
    "globals": "^16.5.0",
```

Placement note: these two blocks avoid every `package.json` region that 01.1 (`"vite"`/`"vitest"` at the end of `devDependencies`, and the `scripts` tail) and 02.1 (`check:rules` in `scripts`) edit, so they match whether or not those steps already ran. Confirm with `git diff package.json` that npm produced exactly these two changes (one line removed from `dependencies`, one line added to `devDependencies`) and nothing else; if npm wrote a caret or a different version, correct only that one line by hand.

3d. Remove the redundant `@types/react-router-dom`. From the DASH root run exactly:

```
npm uninstall @types/react-router-dom
```

npm also removes the now-orphaned `@types/react-router` and `@types/history` from the lockfile.

Expected `package.json` result:

BEFORE (`package.json`, lines 16-18, verbatim):
```
    "@tailwindcss/vite": "^4.2.1",
    "@types/react-router-dom": "^5.3.3",
    "class-variance-authority": "^0.7.1",
```

AFTER:
```
    "@tailwindcss/vite": "^4.2.1",
    "class-variance-authority": "^0.7.1",
```

Gate for 3d: run `npx tsc -b` after the uninstall. It must stay at 0 errors. If it reports ANY error that mentions `react-router`, do not debug it: run `git checkout -- package.json package-lock.json src/config/firebase.ts`, then redo 3a, 3b and 3c only (skipping 3d), and record in the commit body that 3d was dropped and why. `react-router-dom` is imported in 9 files (`App.tsx`, `routes.tsx`, `Layout.tsx`, `ProtectedRoute.tsx`, `GlobalErrorPage.tsx`, `AnalyticsPage.tsx`, `DashboardPage.tsx`, `LoginPage.tsx`, `MapPage.tsx`), and all of them resolve the v7 package's own `dist/index.d.ts`.

**Edge cases to preserve**
- Exact pin, no caret for `firebase-admin` (master §2.14): the entry must read `"firebase-admin": "13.7.0"`. Do not bump it to a newer major.
- `package-lock.json` must change only by: the `firebase-admin` tree flipping to dev (the `"dev": true` markers on packages reachable only through it), the root `packages[""]` entry moving `firebase-admin` between `dependencies` and `devDependencies`, and the removal of the `@types/react-router-dom`, `@types/react-router` and `@types/history` entries. Check `git diff package-lock.json | grep '^[-+]' | grep '"version"'`: it must show only the removed `@types/*` entries' versions (and no resolved version change for any kept package).
- Vercel is unaffected: `vercel.json` uses `npm install`, which installs `devDependencies` (the build already needs `vite`, `typescript` and `@vitejs/plugin-react` from `devDependencies`). The CI workflow from 01.2 uses `npm ci`, which also installs `devDependencies`.
- `scripts/export-cache.js` and `scripts/export-cache-to-firestore.js` still `import admin from 'firebase-admin'`; they keep working because the package is still installed locally.
- Do not touch the other build-4 sub-items: `react-leaflet` and `leaflet` stay in `devDependencies`, `autoprefixer` and `postcss` stay, no `engines` field is added, and `vercel.json` `installCommand` stays `npm install`.
- Do not remove `storageBucket` from `firebaseConfig`, and do not add a Storage or Functions import anywhere.
- Do not run `npm audit fix`, `npm update` or `npm dedupe`.
- Stage by explicit path: `package.json`, `package-lock.json`, `src/config/firebase.ts`. The untracked `DEPLOYMENT_GUIDE.md`, `SESSION_39_SUMMARY.md` and `audit/` must NOT be staged.

**Acceptance criteria**
- `grep -rnE "getStorage|firebase/storage|makePublic" src scripts` prints nothing.
- `grep -rn "storage" src/config/firebase.ts` prints only the `storageBucket:` config line.
- `package.json` has no `firebase-admin` under `dependencies`, has `"firebase-admin": "13.7.0"` under `devDependencies`, and has no `@types/react-router-dom` (unless 3d was dropped and recorded).
- `npm ls firebase-admin` shows `firebase-admin@13.7.0` with no error; `npm ls react-router-dom` still shows `react-router-dom@7.13.1`.
- `npx tsc -b` reports 0 errors. `npx eslint src/config/firebase.ts` reports 0 errors and 0 warnings.
- `npm test` passes (from cluster 01) and `npm run build` succeeds with the single audited ">500 kB" chunk warning. In the build output the main JS chunk is not larger than the audited baseline (`1,422.67 kB` / `419.78 kB gzip`); dropping the Storage SDK makes it smaller, never larger. Record the new chunk size in the commit body.
- The commit body records the M2 outcome (master §6.4): the functions listed, whether deleted, and the Spark/Blaze finding.

**Verify**
```
npm install -D -E firebase-admin@13.7.0
npm uninstall @types/react-router-dom
git diff package.json
npx tsc -b
npx eslint src/config/firebase.ts
npm ls firebase-admin
npm ls react-router-dom
grep -rnE "getStorage|firebase/storage|makePublic" src scripts
npx eslint .
npm test
npm run build
git status --short
```
Manual:
- `git diff package.json` must show exactly three hunks: `@types/react-router-dom` removed from `dependencies`, `firebase-admin` removed from `dependencies`, and `firebase-admin` added to `devDependencies`.
- `npx eslint .` is the cluster-end lint: it must report 0 errors and 0 warnings (the baseline `CacheStatus.tsx` warning was removed in Step 2).
- `npm test` and `npm run build` are the **cluster-end** gates: run each exactly once here, never alongside `tsc`, `eslint` or a dev server (the build takes about 7.5 minutes on this machine). `dist/` is gitignored and must not appear in `git status`.
- Do not push. A push of DASH `main` is a production Vercel deploy (master §4.15); wait for the owner.

**Commit title:** `build(deps): drop browser Storage init and move firebase-admin to devDependencies (build-4)`

---

## Risks & rollback

- **A deployed copy of the functions is the only live exposure, and Step 1 cannot remove it.** Deleting `functions/` from git does not undeploy anything. If M2 lists the functions and the owner declines the delete, record that and do not enable Storage in the console until they are removed: enabling the default bucket would let the next 02:00 UTC run publish the dump with `makePublic()`.
- **M2 may fail for a plan or API reason.** `firebase functions:list` on a Spark project, or one without the Cloud Functions API enabled, errors out. That is a valid recorded outcome (nothing deployed), not a blocker.
- **`npm install -D -E firebase-admin@13.7.0` on this machine is slow and memory-hungry** (the audit's `npm ci` took 18 minutes). Run it with nothing else running. If it is interrupted, `git checkout -- package.json package-lock.json` and rerun.
- **`npm install` may move `firebase-admin` as a plain `devDependencies` add without removing the old `dependencies` entry on some npm versions.** `git diff package.json` after 3c is the check; if the `dependencies` line is still there, run `npm uninstall firebase-admin` then `npm install -D -E firebase-admin@13.7.0` and re-check.
- **`@types/react-router-dom` removal (3d) is the only step with a type-resolution risk.** It is gated by `npx tsc -b` and has an explicit back-out (restore the three files and redo 3a-3c). It cannot affect the runtime bundle.
- **Rollback.** Each step reverts on its own with `git revert <commit>`. Revert newest first: Step 3 (restores `firebase-admin` in `dependencies` and the Storage import; the lockfile reverts with it), then Step 2 (restores `cacheDownloader.ts`, `CacheStatus.tsx` and the dialog copy), then Step 1 (restores `functions/` including `makePublic()`; revert it only with the owner's explicit decision, because it re-introduces the latent exposure). Reverting Step 1 does not redeploy anything.
- **Ordering with other clusters.** Cluster 12.1 later edits `src/config/firebase.ts` and must drop the `storage` line from its anchor (master §4.13). Cluster 05.1 deletes the now-orphaned `cacheDownloaded` branch in `syncManager.ts`. Cluster 09.3 anchors on `UserFilterToggle.tsx` after Step 2's AFTER text (the header comment is the 4-line block above and the dialog no longer has the recommendation panel). `package.json` edits by later steps must anchor on the post-Step-3 `dependencies` / `devDependencies` text.

## Out of scope

- **`syncManager.ts` `cacheDownloaded` branch (`:75-99`)**: cluster 05.1 deletes it. Do not edit `syncManager.ts` here.
- **Rules comments naming `functions/src/cache-export.ts`** (`firestore.rules:24`, `storage.rules:60,63`) and the APP-repo `firebase.json` `storage` target / `storage.rules` removal: cluster 02 rewrites the `firestore.rules` comments; the `storage.rules` and `firebase.json` clean-up is master §7 build-2 (APP change, owner sign-off). Never `--only storage`.
- **`scripts/export-cache.js` and `scripts/export-cache-to-firestore.js`** (including the stale `firebase storage:upload` hint at `export-cache.js:124`): parked in master §7. They are Admin SDK tools that write a full dump; delete them later if unused. Never open `serviceAccountKey.json`.
- **The rest of arch-2's dead code**: unused `components/ui/*` files (including `progress.tsx`, now unused), `GlobalErrorPage` (08.2), `themeConstants` `SOUND_CATEGORIES` (06.1), `useSyncedReadings` `loadData`/`refresh` duplication (05.3), `db.ts` `getLatestTimestamp`/`updateManyReadings`, `src/assets/react.svg`. Master §7 parks the generic dead-code sweep.
- **The rest of build-4**: moving `react-leaflet` and `leaflet` to `dependencies`, dropping `autoprefixer` and `postcss`, adding an `engines` field, and switching `vercel.json` to `npm ci`.
- **Untracked `DEPLOYMENT_GUIDE.md` and `SESSION_39_SUMMARY.md`** at the repo root: master §7 build-1 owns the obsolete ruleset in `DEPLOYMENT_GUIDE.md`. Never stage them.
- **Enabling Storage, creating a bucket, or building an authenticated shared-cache feature.** If a shared cache is ever wanted, keep the object private and serve it through an authenticated `getDownloadURL` with real `storage.rules`, never `makePublic()`.
- **Re-checking the mobile app.** `noise_pollution_mapper/` is closed; this cluster changes no APP file.
