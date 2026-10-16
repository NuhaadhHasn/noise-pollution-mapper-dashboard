# 08 — MASTER FIX IMPLEMENTATION PLAYBOOK (web dashboard, cross-repo)

This is the master document for the executing AI that applies the twelve cluster
specs in `audit/playbook/`. It is the single entry point. It does four things:

- fixes the execution order;
- resolves every shared-file conflict between clusters, and between the two
  repos;
- lists the owner decisions and the manual production actions;
- defines what "done" means.

The cluster specs hold the exact BEFORE/AFTER edits. This document says the
order to apply them in, and how to adapt where clusters touch the same code.

**Roots.** Both repos are siblings under `C:/Users/nuhaa/Downloads/Chatgpt/`.

- **DASH** = `noise-pollution-mapper-dashboard/` (React 19 + Vite 7 + TS 5.9).
  A private repo, HEAD at audit time `353bbdd`. Every path in this document
  is relative to DASH unless it is prefixed `APP:`.
- **APP** = `noise_pollution_mapper/` (Flutter). A public repo at master
  `9b08e68`, with 205 tests green. Its own 338-finding audit is CLOSED.
  This playbook changes exactly one APP file: `APP:firestore.rules`, in
  cluster 02.
- **Firebase project** (shared by both): `noise-pollution-mapper-9ad3d`. The
  APP is the only writer. The dashboard browser is read-only.

**Baseline at audit time.** These are the precomputed checks; nothing was
re-run.

- `npx tsc -b`: 0 errors.
- eslint: 0 errors and 1 warning (`CacheStatus.tsx:57`; cluster 03 deletes
  that file).
- `npm run build`: OK in **7m25s**. It produced one JS chunk,
  `1,422.67 kB` / `419.78 kB gzip`, and the ">500 kB" warning.
- Tests: none. No runner, no CI.
- Production ground truth comes from the owner's read-only probe on
  2026-10-16:
  - The deployed ruleset equals the checked-in one in both repos.
  - Exactly one `users` doc has `role:"admin"`.
  - `noise_readings` holds 3,374 docs. Every doc has `timestamp` as a
    Firestore Timestamp.
  - `createdAt` is on only 17.8% of docs. `soundClass`, `soundType` and
    `confidence` are on only 20.5% (79.5% are unclassified).
  - Every doc uses only these 12 keys: `userId`, `userEmail`,
    `decibelLevel`, `latitude`, `longitude`, `locationName`, `timestamp`,
    `createdAt`, `deviceInfo`, `soundClass`, `soundType`, `confidence`.
  - No `Quiet`, `Uncertain` or `deleted_user_*` values exist yet.

---

## 1. How to use this playbook

> **Mechanically validated 2026-10-16.** `audit/tools/dryrun_playbook.py` replays every
> BEFORE→AFTER of clusters 01→12, in order, against an in-memory copy of both repos.
> Every anchor matches under both D1 branches (`BRANCH=A`/`BRANCH=B`): 0 misses, 0 ambiguous.
> Five anchors that pointed at HEAD text an earlier cluster rewrites were corrected:
> 06.3c, 06.3d, 10.4e, 10.4g and one 10.4o block. The five whole-file replacements
> (05.1, 05.3, 05.6c, 09.1c, 09.4) were checked line by line. Every line they drop from an
> earlier cluster was confirmed relocated (for example, into `mapFilters.ts` /
> `buildHeatPoints()`), not lost. Re-run the dry run after editing any spec, and before
> starting execution if the working tree has moved past HEAD `353bbdd`.
>
> **Compile-checked 2026-10-16 (D1 = B, 09.6 applied).** `dryrun_playbook.py` with
> `MATERIALIZE` writes each cluster's result into a `git archive` copy (node_modules
> junctioned in, no downloads) and runs `tsc -p tsconfig.app.json` after every cluster.
> - **Clusters 01-11: 0 type errors.**
> - **After 12 (full `strict`): 0 real errors.** The only 2 errors were `it.each` parameters
>   typed by the audit's stand-in for vitest, which was not downloaded.
> - **ESLint on the final tree: 0 problems.** HEAD has 1 warning.
> - **`vite build` of the final tree: passes** with no circular-chunk or >500 kB warning.
>
> That build caught a real 11.2 defect, now fixed in the spec. Rollup had dragged
> react/react-dom into `vendor-leaflet` and clsx into `vendor-recharts`, so `/login` still
> loaded both heavy chunks. The new `vendor-core` group fixes it. `/login` now loads the
> entry + `vendor-core` + `vendor-firebase` ≈ 700 kB, against 1,423 kB at HEAD; recharts
> (421 kB) and Leaflet (193 kB) load only on their pages.
>
> The same check fixed two of 11.2's acceptance greps, and step 11.3 (stale-tab recovery)
> was added from a live production check. **Not verified here:** running the vitest suites
> (it needs the vitest download) and rules behaviour in the Firestore emulator.
>
> **EXECUTED 2026-10-16.** All 12 clusters were applied, one fresh subagent per cluster, each one
> verified by the orchestrator before the next started. Result: 49 DASH commits
> (`fb99501`…`bef6056`) and 3 APP commits (`b51ed1d`, `3190f49`, `3fe2dfd`).
> - **M1 deployed:** the owner said yes after a clean dry run and a check of every app
>   writer. The APP repo is pushed.
> - **Deviations, all recorded in the commit bodies:**
>   - 01.1 installed vitest with `--legacy-peer-deps`. npm 10.8.2 crashes on vitest's
>     optional peer cycle; a plain `npm install --offline` over the lockfile passes.
>   - Under D1 = B, 08's D1(A) blocks and 09.3a were skipped, so `/map` still defaults to
>     "My Readings Only". 09.3's title overstates this; its body explains.
>   - 10.5 remapped 09's overlays onto the new z-index scale.
>   - 09.6 was applied without the D5 measurement, as the owner chose.
> - **§6 locally:** tsc (strict) 0 errors, eslint 0, 198/198 tests, build OK with no
>   warnings, every grep clean.
> - **Still open:** the §6.5 owner QA pass in a browser, 11.3's post-deploy curl checks,
>   and the post-M1 phone smoke test.

1. **Read this document fully first.** Then settle the owner decisions in §3.4
   with the owner in ONE round of questions before the first commit. After
   that, execute the cluster specs in the §3.1 order, one spec at a time,
   front to back.
   Each spec lives at
   `C:/Users/nuhaa/Downloads/Chatgpt/noise-pollution-mapper-dashboard/audit/playbook/NN_<slug>.md`.
2. **One commit per step.** Each numbered step in a cluster spec is exactly
   one commit, with the title given in the spec (also listed in §5). Never
   merge steps and never split them.
   **The only exception:** a step tagged **[APP+DASH]** (steps 02.2–02.4)
   makes exactly ONE commit in EACH repo, with the identical title. The two
   commits are one logical change: the edited `APP:firestore.rules` plus
   its byte-mirror in DASH.
   Totals: 48 steps, giving **51 commits** (48 in DASH, 3 in APP), plus 3
   manual actions (§5).
   **Notation:** `NN.k` means cluster NN, step k of that cluster's spec.
   §5 numbers the same steps globally, #1–#48.
3. **Gate every DASH step on all of these:**
   - `npx tsc -b`: 0 errors.
   - `npx eslint <the files the step changed>`: 0 errors and no new
     warnings. Skip deleted files.
   - From cluster 01 onward, `npx vitest run <the test files the step names>`
     must pass.
   
   Run `npm test` and `npm run build` **once at the END of each cluster**,
   never per step. The machine is resource-constrained (2 cores, about 2 GB
   free, and a build takes about 7.5 minutes), so never run a build, a type
   check and a dev server at the same time.
4. **Gate APP steps** (cluster 02 only, and only `firestore.rules` changes):
   - Before committing, `git -C ../noise_pollution_mapper diff --cached --name-only`
     must list ONLY `firestore.rules`.
   - The drift check (§4.2) must pass.
   - At the end of cluster 02, run `flutter analyze` (must be clean) and
     `flutter test` (205 must pass) ONCE in APP. This proves the baseline is
     untouched.
5. **Never re-audit.** Every Critical and High finding was adversarially
   verified. The evidence is in `audit/00_*` (master report) and the
   per-dimension docs `audit/01_*`–`audit/07_*`. Do not re-derive findings,
   do not second-guess verified BEFORE blocks, and do not drive-by fix
   anything listed in a spec's "Out of scope" section or in §7.
6. **If a BEFORE block does not match, STOP.**
   - First check §4. Most mismatches come from an earlier cluster that
     legitimately edited the same region, and §4 says how to adapt.
   - Only if §4 has no entry should you re-read the file and apply the edit
     semantically, preserving every earlier cluster's change.
   - Never revert another cluster's work to make an anchor match.
   - Match on exact text, never on line numbers. Line numbers drift after
     every step.
7. **Revert discipline.** Each step can be reverted on its own, but later
   BEFORE anchors build on earlier AFTER text. When reverting several steps,
   revert the newest first.
   An [APP+DASH] step is reverted in BOTH repos, and also needs a rules
   redeploy (§4.2) if it was already deployed.
8. **Manual actions (M1–M3) are not commits.** These are the rules deploy,
   the deployed-functions check, and role provisioning. Each has an explicit
   owner-approval gate, written next to it in §5.
   Show the exact diff or command, and wait for an explicit "yes". Silence,
   or approval of something else, is not a yes.
9. **Do not push either repo without the owner's go-ahead.** If the Vercel
   Git integration is connected, a push to DASH `main` is a **production
   deploy**. Push timing is in §4.15.
10. **Do NOT use plan mode for these clusters.** The spec *is* the plan. The
    only genuinely open choices are the §3.4 decisions, and they are settled
    up front.

---

## 2. Global conventions (verbatim — every step of every cluster must respect these)

1. **Firestore index rule (CRITICAL).**
   - The ONLY composite index is `noise_readings (userId ASC, timestamp DESC)`
     (`APP:firestore.indexes.json`).
   - Every range query on `timestamp` uses `'>'` (`isGreaterThan`), with
     `orderBy('timestamp', 'desc')` when ordering is needed. **Never `'>='` /
     `isGreaterThanOrEqualTo`.**
   - No step adds an index, edits `firestore.indexes.json`, or introduces a
     query that needs another composite index.
   - The only `noise_readings` query shapes the dashboard may use are:
     - the full fetch, `orderBy('timestamp','desc')`;
     - the delta, `where('timestamp','>', ts)` (optionally with
       `orderBy('timestamp','desc')`).
   - The only `users` access allowed is the owner's own doc,
     `getDoc(doc(db,'users',uid))` (cluster 08).
2. **Rules source of truth and mirroring.**
   - `APP:firestore.rules` is canonical; it is the only copy wired to a
     deploy (`APP:firebase.json`).
   - Any rules edit is made in `APP:firestore.rules` FIRST. In the same
     logical change it is mirrored into `DASH:firestore.rules` byte-identical
     modulo CR. The APP working tree is CRLF (`core.autocrlf=true`), the DASH
     working tree is LF, and both index blobs are LF.
   - The drift check `node scripts/check-rules-drift.mjs ../noise_pollution_mapper`
     (added in 02.1) must pass before every rules commit and before any
     deploy.
3. **Deploying rules.**
   - Deploy ONLY from the APP repo root, with
     `firebase deploy --only firestore:rules,firestore:indexes`.
   - **NEVER `--only storage` and never a bare `firebase deploy`.** The
     project has NO Storage bucket, so the storage target fails outright.
     `APP:firebase.json` still declares a `storage` target (§7). *(Historical:
     the target and `storage.rules` were removed on 2026-10-16, build-2,
     APP `decbe0c` and DASH `f2f8cc2`. The rule to never deploy storage stays.)*
   - Deploy only after showing the owner the full rules diff against the
     deployed ruleset, and receiving an explicit "yes". The deployed
     ruleset `ebff82af-…` equals `APP:firestore.rules` at `9b08e68`, per
     the 2026-10-16 probe.
   - The CLI is logged in as the owner's account. Deploying is manual action
     M1, never a commit.
4. **The dashboard browser stays read-only.** No Firestore writes from `src/`:
   no `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`, `writeBatch` or
   `runTransaction`. Auth calls (`signInWithEmailAndPassword`, `signOut`,
   `sendPasswordResetEmail`) are fine.
5. **Secrets.** Never open, print, `cat`, `grep` or commit
   `serviceAccountKey.json`. It is gitignored at `.gitignore:53` and must
   stay so. Never print `.env` values (key NAMES are fine). Never commit
   `.env`.
6. **No AI attribution in any commit message, in either repo.** No
   `Co-Authored-By:` trailer naming Claude or Anthropic, and no "Generated
   with Claude Code". This is the owner's global rule and it overrides every
   default. The repos are public portfolio repos (APP) or may become public
   (DASH).
7. **One commit per step** (the [APP+DASH] exception is in §1.2), with the
   gates in §1.3–§1.4. Use conventional-commit titles that cite finding IDs.
8. **Match BEFORE blocks on exact text, never line numbers.** On a mismatch,
   STOP and check §4.
9. **APP-repo changes** are allowed ONLY where the dashboard contract
   requires them (security rules, write shape). In this playbook that means
   only `APP:firestore.rules`. Do not touch Dart.
10. **Stored-reading shape (from cluster 04 Step 3 on).** In IndexedDB and in
    memory, `NoiseReading.timestamp` and `createdAt` are epoch-ms
    `number | null`. Every date read goes through `toDate()` / `toMillis()`
    in `src/lib/readings.ts`. Nothing outside `src/lib/readings.ts` may call
    `.toDate()` or read `.seconds` on a reading field.
11. **Categories and dB bands (from cluster 06 on)** come only from
    `src/lib/categories.ts` and `src/lib/noiseBands.ts`. Do not add category
    or band colour maps anywhere else. "Quiet" is a **category** name only.
    No dB band is ever labelled "Quiet"; bands are Low / Moderate / High.
12. **No HTML-string sinks for reading data.** Do not use
    `bindPopup(string)`, `bindTooltip(string)`, `innerHTML`,
    `insertAdjacentHTML`, `dangerouslySetInnerHTML`, or `L.divIcon({html})`
    with reading fields.
    Reading fields such as `locationName` and `soundClass` are writable by
    any registrant. React-escaped JSX is the only rendering path. The
    security audit found no XSS today; keep it that way (§4.6).
13. **Logging.** Never `console.log` or `console.warn` a whole reading
    object: it contains GPS and the author label. Log ids and counts only.
14. **Dependencies.**
    - Install exact versions (`npm install -E`).
    - Never hand-edit `package-lock.json`. Commit it in the same step that
      changes `package.json`.
    - Add no runtime dependency beyond what a spec names.
15. **Tests never touch Firebase.** Test files import only pure modules
    (`src/lib/*`, extracted pure functions), or `vi.mock('@/config/firebase')`
    and `vi.mock('firebase/firestore')`. Importing the real
    `src/config/firebase.ts` in a test initializes the SDK with undefined
    env and may throw at import.

---

## 3. Execution order

### 3.1 Order and rationale

| # | Cluster | Spec file (`audit/playbook/…`) | Steps | Complexity | Suggested executor | Why here |
|---|---------|-------------------------------|-------|-----------|--------------------|----------|
| 1 | 01 Test harness & CI | `01_test_harness_ci.md` | 2 | low | Sonnet | Tiny. Lets every later cluster add unit tests (`toDate`, `normalizeReading`, taxonomy, week buckets, `csvCell`, sync watermark). First `package.json` edit. |
| 2 | 02 Firestore rules hardening (cross-repo) | `02_firestore_rules_hardening.md` | 4 | **high** | Opus | Highest-severity security work (sec-1 High). Independent of dashboard code; no later cluster depends on deploy M1 having happened. Must close the "any registrant can poison every dashboard" write path, the deleted_user impersonation and the raw-email profile list. |
| 3 | 03 Dead Storage pipeline removal | `03_dead_storage_pipeline.md` | 3 | low | Haiku-capable (deletions) / Sonnet for 03.3 | Privacy (priv-3, the latent `makePublic()` exposure). Pure deletion, which shrinks the surface every later cluster reads. Must land before 04/05 so they never see `cacheDownloader`/`CacheStatus`. |
| 4 | 04 Readings storage contract | `04_readings_storage_contract.md` | 4 | **high** | Opus | Root cause of bug-1 (High): every export and popup timestamp is broken. Defines the stored `NoiseReading` shape that 05–12 build on. arch-4 must precede its own IndexedDB version bump. |
| 5 | 05 Sync engine & ReadingsProvider | `05_sync_engine_provider.md` | 7 | **high** | Opus | data-1, priv-1, perf-1 (all High) and five Mediums. It rewrites `syncManager` on top of 04's normalised fetch helper, and creates the single provider that 06–10 consume. |
| 6 | 06 Category taxonomy & analytics | `06_taxonomy_analytics.md` | 4 | low | Sonnet | data-2 (High) and data-3. It creates `categories.ts` and `noiseBands.ts`, which 07, 09 and 10 use. It must follow 04, because it edits the type and the post-04 consumers. |
| 7 | 07 Research export & privacy | `07_export_privacy.md` | 3 | low | Sonnet | sec-2, priv-2 and ux-3. It edits `exportHelpers.ts` and `DataTable.tsx` last among the data clusters (after 04 and 06), so the final export shape is written once. |
| 8 | 08 Access control & resilience | `08_access_resilience.md` | 3 | **high** | Opus | sec-4 (auth gate, which also gates the provider's reads), plus the sec-1 render-side defence (error boundaries) and a11y-7 (login). It needs the 05 provider. |
| 9 | 09 Map correctness & performance | `09_map_correctness_perf.md` | 6 | low | Sonnet (09.6: Opus) | Six map Mediums. It needs the 05 provider, the 06 bands and the 07 caveat string. 09.6 is the most dangerous MERGE in the playbook (§4.6). |
| 10 | 10 Accessibility & layout | `10_accessibility_layout.md` | 7 | low | Sonnet | Touches nearly every UI file. It goes after the functional clusters so it edits their final shapes once. |
| 11 | 11 Bundle splitting | `11_bundle_splitting.md` | 3 | low | Sonnet | perf-5. `routes.tsx` and `index.css` are touched only after 08 and 10 settle them. |
| 12 | 12 Type safety | `12_type_safety.md` | 3 | **high** | Opus | arch-1. Turning on `strict` touches types in almost every file, so it runs LAST: any earlier position would break every later cluster's anchors. |

### 3.2 Hard dependencies (must not be violated)

- **04 Step 1 → 04 Step 4.** The IndexedDB connection must handle
  `onversionchange` / `onblocked` before `DB_VERSION` is bumped; otherwise
  the upgrade hangs across open tabs (arch-4).
- **04 Step 2 → 04 Step 3.** Every consumer must read dates through
  `toDate()` before the stored type changes from Timestamp to epoch ms.
  Otherwise `tsc -b` fails on `.toDate` against `number`.
- **04 (all) → 05.** 05 rewrites sync on top of 04's `fetchReadings()` /
  `normalizeReading()`.
- **05 Step 3 → 05 Steps 4–7, and → 08 Step 1, and → 09 Step 1.** The
  provider must exist before anything consumes it or gates it.
- **06 Step 1 → 06 Steps 2–3, and → 07 Step 2 (labels), → 09 Step 4
  (bands/legend), and → 10 Step 4 (band colours).**
- **07 Step 3 → 09 Step 4.** The legend reuses the shared `DB_CAVEAT`
  string.
- **02.1 (drift check) → 02.2–02.4 (rules edits) → M1.**
- **Everything → 12.** Strict mode is last.
- **Soft dependencies,** each with an explicit adaptation in §4:
  01→02/03 (`package.json`), 05→06 (`NoiseMarkers` popup), 08→10
  (`Layout`), 08/10→11 (`routes.tsx` and `index.css`), and 03→12
  (`firebase.ts`).

### 3.3 Shared-file conflict table

The "touched by" column lists the clusters that change each file, in
execution order. "Later must re-check" names the §4 note that later clusters
must follow, because their BEFORE anchors will not match verbatim. Spec
authors wrote BEFORE blocks against HEAD `353bbdd` unless the spec says
otherwise.

| File | Touched by (cluster.step, in order) | Later must re-check |
|------|-------------------------------------|---------------------|
| `package.json` / `package-lock.json` | 01.1 (vitest, `test` script), 02.1 (`check:rules` script), 03.3 (move `firebase-admin` to devDependencies) | §4.12 — edit the current `scripts`/`dependencies` blocks; regenerate the lockfile via npm |
| `APP:firestore.rules` + `DASH:firestore.rules` | 02.2, 02.3, 02.4 | §4.1, §4.2 — 02.3 replaces the `matches('^deleted_user_.*')` alternative that 02.2 kept intact |
| `README.md` | 02.1 | — |
| `.gitignore` | 03.1 (stale comment at `:58` names `functions/src/cache-export.ts`) | — |
| `src/config/firebase.ts` | 03.3 (drop `getStorage`/`storage`), 12.1 (type `auth`/`db`) | §4.13 |
| `src/utils/db.ts` | 04.1, 04.4, 05.2 (`replaceAllReadings`), 12 | §4.4 |
| `src/utils/syncManager.ts` | 04.3 (`fetchReadings`), 05.1, 05.2, 12 | §4.4 — 05 rewrites `syncNewReadings`/`forceFullSync` against post-04 text |
| `src/types/NoiseReading.ts` | 04.3, 06.3 (drop `soundCategory`), 12 | §4.3 |
| `src/lib/readings.ts` (new) | 04.2, 04.3 | — |
| `src/lib/categories.ts`, `src/lib/noiseBands.ts` (new) | 06.1, 10.4 (band colours) | §4.11 |
| `src/lib/authorLabel.ts` (new) | 07.2 | — |
| `src/hooks/useSyncedReadings.ts` | 05.3 (becomes a context consumer, same name) | §4.5 |
| `src/contexts/ReadingsContext.tsx` (new) | 05.3, 05.6, 05.7, 08.1 (`enabled` by role) | §4.5 |
| `src/App.tsx` | 05.3 (mount the provider) | — |
| `src/main.tsx` | 08.2 (root boundary) | §4.10 |
| `src/contexts/AuthContext.tsx` | 05.7 (sign-out cleanup), 08.1 (`role`) | §4.5 |
| `src/components/ProtectedRoute.tsx` | 08.1 | — |
| `src/components/Layout.tsx` | 08.2 (`{children}` boundary), 10.1 (sidebar) | regions are disjoint; 10.1 must keep 08.2's boundary |
| `src/components/ErrorBoundary.tsx`, `GlobalErrorPage.tsx` | 08.2 | §4.10 |
| `src/routes.tsx` | 11.1 | §4.14 |
| `src/pages/DashboardPage.tsx` | 05.5, 08.2, 09.1, 10.6 | §4.9 |
| `src/pages/AnalyticsPage.tsx` | 05.4, 07.2, 07.3, 08.1 (option B only), 08.2 | §4.9 |
| `src/pages/MapPage.tsx` | 05.6, 09.1–09.4, 10.5, 10.6, 10.7 | §4.8 |
| `src/pages/LoginPage.tsx` | 05.7 (dead `remembered_email` write), 08.1 (copy), 08.3, 10.4 | §4.9 |
| `src/components/map/NoiseMarkers.tsx` | 04.2, 05.3, 06.3, 09.1, 09.5, 09.6, 10.4 | **§4.6 — 09.6 is a MERGE** |
| `src/components/map/MarkerClusterGroup.tsx` | 09.6 | §4.6 |
| `src/components/map/HeatmapLayer.tsx` | 04.2 (`getCoordinates` replaces its nested-`location` branch at `:40-41`), 09.1 (placement), 09.4 | §4.3, §4.8 |
| `src/components/map/MapLegend.tsx` (new) | 09.4, 10.4 | §4.11 |
| `src/components/map/DateRangeFilter.tsx` | 09.2 | — |
| `src/components/map/SyncStatus.tsx` | 05.6, 10.7 | §4.8 |
| `src/components/map/UserFilterToggle.tsx` | 03.2 (dead cache copy), 09.3 | — |
| `src/components/map/MapContainer.tsx` | 10.6 | — |
| `src/components/analytics/DataTable.tsx` | 04.2, 06.3, 07.2, 10.2, 10.4 | §4.7 |
| `src/components/analytics/NoiseTrendChart.tsx` | 04.2, 05.4, 06.4, 10.3 | §4.3 |
| `src/components/analytics/CategoryChart.tsx` | 05.4, 06.2, 06.3, 10.3, 10.4 | §4.11 |
| `src/components/analytics/SoundTypeChart.tsx` | 04.3 (`'Both'` colour key), 05.4, 10.3, 10.4 | §4.3 |
| `src/components/analytics/StatsCards.tsx` | 05.4, 07.3, 10.4 | — |
| `src/utils/exportHelpers.ts` | 04.2, 06.3, 07.1, 07.2, 07.3 | **§4.7** |
| `src/services/userService.ts` | 07.2 (deleted) | — |
| `src/utils/themeConstants.ts` | 06.1 (delete dead `SOUND_CATEGORIES` and the `getNoiseLevel` 'Quiet' label; keep `FLUTTER_THEME_COLORS`) | — |
| `src/components/ui/dialog.tsx` | 10.5 (z-index scale) | — |
| `src/index.css` | 10.7, 11.2 (move the `leaflet.css` import) | §4.14 |
| `vite.config.ts` | 11.2 | (vitest uses its own `vitest.config.ts`, so there is no clash) |
| `tsconfig.app.json` | 12.2, 12.3 | — |

### 3.4 Owner decisions — settle ALL of these before commit #1 (one round of questions)

| ID | Decision | Default (use it if the owner says "go with defaults") | Affects |
|----|----------|-----------------------------------------------------|---------|
| **D1** | Who may use the dashboard, and may any browser path read other users' profiles? | **(A) Admin-only.** ProtectedRoute requires the signed-in user's own `users/{uid}.role == 'admin'` (an owner read, already allowed). Everyone else sees a no-access page. The provider never syncs for them. No browser path lists `users`, so rules step 02.4 makes `users` owner-read only. **(B) Alternative:** community-wide viewing, with only the CSV/JSON export gated on the admin role and the "Request access" copy removed. 02.4 still applies. | 02.4, 05.3, 08.1, 09.3 (map default), M3 |
| **D2** | How CategoryChart treats readings with no `soundClass` (79.5% of production) | **Exclude them from the bars**, matching `APP:lib/screens/analytics_screen.dart:232-234`. Show a caption, "N of M readings are unclassified and not shown". Label them **'Unclassified'** in the table, popup and exports. Confidence shows '—' in the UI, an empty cell in CSV and `null` in JSON. | 06.3, 07.1 |
| **D3** | How strict the rules validation is | dB in `[0, 200]`; lat `[-90, 90]`; lng `[-180, 180]`; `timestamp <= request.time + 1 day` (offline captures from fast device clocks still pass); key whitelist = the 12 production keys; `userEmail` string ≤120 **or null** (the offline path can write null); `soundType in ['Pollution','Ambient']`; `confidence` in `[0, 1]`. Legacy docs are not re-validated on email-only and anonymization updates (§4.1). | 02.2 |
| **D4** | Are the cache-export Cloud Functions deployed? | Check read-only (M2). If they are listed, the owner approves deleting them. If they are not listed, there is nothing to do. | 03.1, M2 |
| **D5** | perf-4 (bulk cluster add) | Measure first (Performance panel, `/map`, all users). If the marker commit burst is under 300 ms on the owner's hardware, skip the step with a note and record it in §7. Otherwise implement it. | 09.6 |

**DECIDED by the owner, 2026-10-16.** Execute with these choices and do not re-ask.

| ID | Decision | Basis |
|----|----------|-------|
| **D1** | **(B) Community-wide viewing.** Apply every `D1(B) only` block and skip every `D1(A) only` block. Only the CSV/JSON export is gated on `users/{uid}.role == 'admin'`. The "Request access" copy is removed. 02.4 still applies. | Checked in code: the dashboard login is `signInWithEmailAndPassword` against the app's own Firebase Auth (`LoginPage.tsx:36`). `ProtectedRoute.tsx` checks only `isAuthenticated`, and nothing in `src/` checks a role. So any app user can already log in, and (B) keeps that behaviour. It exposes nothing the app's own community map does not already show any signed-in user; the bulk GPS export is the part that gets gated. M3 is already satisfied: production has exactly one `role: 'admin'` doc (probe, 2026-10-16). |
| **D2** | **Default: "Unclassified".** Exclude unclassified readings from the CategoryChart bars, show the caption, label them 'Unclassified' in the table, popup and exports. | Owner's choice. |
| **D3** | **Default bounds, as listed above.** | Owner chose the recommendation. `probe2.cjs` showed all 3,374 production docs pass them: no extra keys, dB 6.0-80.7, all coordinates in Sri Lanka, confidence 0.043-1.0, no future timestamps, longest strings 20 characters. |
| **D4** | **Nothing to do; M2 is resolved.** No cache-export function is deployed, and none ever was. | `firebase functions:list` (2026-10-16) returned 403: "Cloud Functions API has not been used in project noise-pollution-mapper-9ad3d before". 03.1 still deletes the dead `functions/` source. |
| **D5** | **Implement 09.6 without the measure-first gate.** | Owner's choice. Skip the D5 measurement and apply 09.6 as written. |

### 3.5 Session batching

Clusters must run in the §3.1 order. Each batch is a contiguous run.
Estimates assume ~270 tokens/KB of files read, ×2.5 working overhead, plus
~30K fixed per session.

| Session | Clusters | Commits | Est. context | Notes |
|---------|----------|---------|--------------|-------|
| S1 | 01 → 02 → 03 → 04 | 13 DASH + 3 APP | ~280K | M1 (deploy) and M2 (functions check) happen here, each gated on the owner. |
| S2 | 05 → 06 → 07 | 14 | ~300K | 05 is the heaviest cluster (~130K). Do not batch it with more than two neighbours. |
| S3 | 08 → 09 → 10 | 16 | ~330K | 09.6 needs a fresh read of the post-05/06/09.5 `NoiseMarkers.tsx`. |
| S4 | 11 → 12 | 5 | ~150K | Strict-mode fixes may touch many files; budget extra time for that. |

Rules: never start a cluster you cannot finish in the current session. Above
~70% context, stop at the last completed commit; `git log` is the resume
pointer. Re-read files fresh in each cluster: the file on disk is the truth,
not the copy in context.
**Parallelism:** none. Clusters 04–10 share `NoiseMarkers.tsx`,
`exportHelpers.ts`, `DataTable.tsx` and `MapPage.tsx`, and later anchors build
on earlier output.

---

## 4. Cross-cluster interactions and required adaptations

Each entry is mandatory.

### 4.1 Rules writer-compatibility matrix (02.2–02.4 ↔ every APP writer)

The tightened rules must still admit EVERY write the app makes today. Do not
deploy (M1) until each row below has been checked against the final rules
text. Two sources settle the field set:
- the app writers, `APP:lib/services/firebase_service.dart:160-182`,
  `APP:lib/services/sync_service.dart:305-338`, `:308` and `:970-973`;
- the 2026-10-16 production probe (exactly the 12 keys listed in the
  header).

| App write | Path | Firestore op | Must be ALLOWED by |
|-----------|------|--------------|--------------------|
| Online capture | `firebase_service.dart:182` `.add(data)`, with `timestamp: serverTimestamp()` (equal to `request.time`) | create | `create`: owner uid + `validReading` |
| Offline upload, first write | `sync_service.dart:338` `.doc(id).set(data)`, with `timestamp` = capture time (may be hours or days old) and `userEmail` possibly **null** (`:308`) | create | same; `userEmail` null must pass (D3) |
| Offline upload, retry after a lost ack | same `set()` on an existing id, same data | update | same-userId branch: `affectedKeys()` is empty or only `userEmail`, OR `validReading` |
| History undo (restore) | `firebase_service.dart:308` `.doc(id).set(originalData)` | create | `validReading` on the original doc. Accepted residual: a legacy doc outside the D3 ranges cannot be restored. |
| Email propagation | `profile_sync_service.dart:80` `batch.update(ref, {'userEmail': authorDisplay})` | update | same-userId branch with `affectedKeys().hasOnly(['userEmail'])` and `userEmail is string` (≤120). **Do NOT also require `validReading` here**, so legacy docs stay updatable. |
| Account-deletion anonymization | `settings_screen_enhanced.dart:970-973` `batch.update(ref, {'userEmail':'Deleted User','userId':'deleted_user_${uid.substring(0,8)}'})` | update | a dedicated branch: `request.resource.data.userId == 'deleted_user_' + request.auth.uid[0:8]` && `request.resource.data.userEmail == 'Deleted User'` && `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['userId','userEmail'])`. **Do NOT AND `validReading` into this branch**, so a legacy doc is always anonymizable. |
| Clear history / single delete | `settings_screen_enhanced.dart:1110-1114`, `firebase_service.dart:300` | delete | unchanged: `resource.data.userId == request.auth.uid` |
| Profile create/update | `registration_screen.dart:58`, `edit_profile_screen.dart:90`, `profile_sync_service.dart:55` | users create/update | unchanged. **The `role` guards (`!('role' in …)` on create, role unchanged on update) become load-bearing for the cluster 08 gate. Never loosen them.** |
| Owner profile read | `profile_sync_service.dart:43` | users get | `isOwner(userId)` (02.4 keeps this) |

Further requirements:

- Step 02.2 introduces `validReading()`, ANDs it into `create`, and ANDs
  `(affectedKeys email-only || validReading)` into the same-userId update
  branch. It leaves the existing `matches('^deleted_user_.*')` alternative
  untouched. Step 02.3 then replaces that alternative with the dedicated
  branch above.
- This satisfies the mobile playbook's warning
  (`APP:audit/11_FIX_IMPLEMENTATION_PLAYBOOK.md` §4.8: "do not tighten
  update rules later without re-checking the sync path"). An identical-data
  retry has empty `affectedKeys()`.
- Rules strings support the range operator (`uid[0:8]`). Firebase uids are
  28 characters, so the 8-character prefix always exists.
- The rules comments currently cite `src/pages/DashboardPage.tsx:33`
  (onSnapshot), which cluster 05 removes. While editing in 02, describe the
  dashboard's reads generically ("IndexedDB sync via
  `src/utils/syncManager.ts`: full `orderBy` fetch plus `timestamp >`
  delta"). Never cite line numbers in rules comments. Do not edit the rules
  again later just for comments: that would need another mirror and
  redeploy.
- **Verification before M1.**
  - Preferred: the Firestore emulator with a short rules test, but only if
    Java is installed (§7 makes this a permanent suite).
  - Mandatory: run `firebase deploy --only firestore:rules,firestore:indexes --dry-run`
    from APP. It is a compile check, does not deploy, and contacts Firebase
    read-only. If this CLI version does not report rules compilation on a
    dry run, note that and rely on the post-deploy smoke.
  - Then complete the smoke list in M1 (§5).

### 4.2 Mirroring and deploy procedure (02 → M1)

1. Edit `APP:firestore.rules`.
2. Produce the DASH copy with CR stripped:
   `tr -d '\r' < ../noise_pollution_mapper/firestore.rules > firestore.rules`
   (Git Bash, from DASH).
3. Run `node scripts/check-rules-drift.mjs ../noise_pollution_mapper`. It
   compares `firestore.rules` AND `storage.rules` after stripping `\r`, and
   exits non-zero on any difference. *(Historical: `storage.rules` was removed
   in both repos on 2026-10-16, build-2, and the drift check now compares
   `firestore.rules` only.)*
4. Commit APP, then DASH, with the identical title.
5. After both commits, `git ls-files -s firestore.rules` must print the
   **same blob id in both repos**. The audit-time id is `04bd418e`; it
   changes with every edit, but the two repos must stay equal.
6. **M1 (deploy):**
   - Show the owner `git -C ../noise_pollution_mapper diff 9b08e68 -- firestore.rules`,
     i.e. the full diff against the deployed source. The deployed source
     equals the 9b08e68 copy, per the probe.
   - Get an explicit "yes".
   - From APP, run `firebase deploy --only firestore:rules,firestore:indexes`.
   - `firestore.indexes.json` is unchanged, so the index part is a no-op.
     **If the CLI offers to delete any index, answer No and STOP.**
7. **Rollback:** the Firebase console → Firestore → Rules → history → roll
   back to ruleset `ebff82af-…` (created 2026-09-09). Alternatively,
   `git -C ../noise_pollution_mapper show 9b08e68:firestore.rules`, deployed
   the same way after owner approval. Then revert the [APP+DASH] commits in
   both repos, tail-first.

No later cluster depends on M1 having happened. If the owner postpones the
deploy, continue with cluster 03.

### 4.3 Stored-reading shape changes in 04 (→ 05, 06, 07, 09, 10, 12)

After 04 Step 3, `src/types/NoiseReading.ts` has this target shape. It is
for verification, not to be copied verbatim:

```ts
export interface NoiseReading {
  id: string;
  userId: string;
  userEmail?: string;          // masked author label the app writes (sec-2); 07 displays it
  decibelLevel: number;        // finite — normalizeReading drops docs otherwise
  latitude: number;            // finite — dropped otherwise
  longitude: number;
  locationName?: string;
  soundCategory?: string;      // never written by any app version; kept ONLY until 06.3 removes it
  soundClass?: string;         // raw app value; absent = unclassified
  soundType?: 'Pollution' | 'Ambient';
  confidence?: number;         // 0..1; absent when unclassified
  timestamp: number | null;    // epoch ms
  createdAt?: number | null;   // epoch ms (client clock; on 17.8% of docs)
}
```

The nested `location` union and the `'Both' | 'Unknown'` soundType members
are deleted in 04.3. No writer produces them, and every one of the 3,374
production docs is flat.

For that deletion to compile, 04.2 must first route EVERY coordinate read
through `getCoordinates()`. The sites are:

- `NoiseMarkers.tsx:117-147` and `:266-295`;
- `HeatmapLayer.tsx:40-41`;
- `exportHelpers.ts:29-58` and its `extractCoordinates` helper.

Separately, 04.3 removes or rekeys the `'Both'` entry in
`SoundTypeChart.tsx:18`'s colour map, so the map no longer names a type
member that has been removed.

Effects on later clusters:

- Any BEFORE block in clusters 05–10 that contains `reading.timestamp?.toDate`,
  `'seconds' in ts`, `.seconds * 1000`, a local `function toDate(`, the
  nested-`location` branches or the `Invalid location data` warn is stale.
  Apply it semantically against the helper call 04.2 left behind.
- The `NoiseMarkers` date filter must already prefer `timestamp`, falling
  back to `createdAt` only when `timestamp` is null (bug-8, part 1, done in
  04.2). 09.2 only changes how the range is computed.
- 06.3 deletes `soundCategory` from the type, and with it every
  `soundCategory ||` precedence expression in `NoiseMarkers`, `DataTable`,
  `exportHelpers` and `CategoryChart`.

### 4.4 IndexedDB version bump and sync metadata (04.1 → 04.4 → 05.1/05.2)

- 04.1 caches a single `IDBDatabase` promise, sets
  `db.onversionchange = () => { db.close(); cached = null; }`, and rejects
  `request.onblocked` with a user-visible "close other dashboard tabs"
  error.
- 04.4 bumps `DB_VERSION` to 2. Its `onupgradeneeded` deletes and recreates
  the `noise_readings` store (the `timestamp` index now indexes epoch-ms
  numbers) and **clears `sync_metadata`**. Every browser therefore performs
  one full re-fetch: about 3,374 reads per browser, once. This is the
  one-time purge of rows deleted or rewritten in Firestore, and of
  pre-2026-09-09 raw `userEmail` values at rest (priv-1).
- 05.1 replaces the wall-clock `lastSyncTime` with a server-time watermark
  (`maxTimestampMs`). 05.2 adds `lastFullSyncAt`. Both keys are absent
  after the v2 purge. A missing `lastFullSyncAt` means a full replace is
  due, so the first load after 04.4 + 05 is a full replace and never a
  delta.
- **05 must NOT bump `DB_VERSION` again.** The stored shape does not change
  in 05. The `cacheDownloaded` metadata branch in `syncNewReadings`
  (`syncManager.ts:80-99`) is deleted in 05.1. The key is never set after
  cluster 03, and the v2 purge removes any stale value.
- Sync constants are named in `syncManager.ts`. Defaults:
  - `OVERLAP_MS = 10 * 60_000` (re-query 10 minutes behind the watermark;
    idempotent `put`);
  - `FULL_REPLACE_INTERVAL_MS = 24 * 3_600_000`;
  - `AUTO_SYNC_INTERVAL_MS = 3_600_000`.
  
  A delta query is `where('timestamp','>', Timestamp.fromMillis(watermark - OVERLAP_MS))`,
  never `>=`.
- **Accepted residual (data-1):** a reading uploaded offline with a capture
  time older than the watermark minus `OVERLAP_MS` appears at the next full
  replace (within 24 h), or at once on "Fetch All". The complete fix (an
  app-side `syncedAt: serverTimestamp()` cursor) is in §7.

### 4.5 ReadingsProvider placement, public API, and role gating (05.3 ↔ 08.1)

- `src/contexts/ReadingsContext.tsx` is mounted ONCE in `src/App.tsx`,
  INSIDE `AuthProvider` and wrapping `BrowserRouter`. It is NOT mounted
  inside `ProtectedRoute`: every route has its own `ProtectedRoute` element
  (`routes.tsx:22-45`), so a provider there would remount on every
  navigation.
- The provider is idle while `enabled` is false. In 05 that is
  `enabled = !!user`. **08.1 changes it to
  `enabled = !!user && role === 'admin'` under D1(A)**, so non-admins never
  download readings. Under D1(B) it stays `!!user`.
- The `useSyncedReadings()` hook keeps its name and import path. It becomes
  `useContext(ReadingsContext)`, so the call sites in `StatsCards`,
  `NoiseTrendChart`, `CategoryChart`, `SoundTypeChart` and `AnalyticsPage`
  do not change. Target value:
  ```ts
  { readings: NoiseReading[]; loading: boolean; syncing: boolean; error: Error | null;
    lastSync: Date | null; synced: boolean;
    refresh(): Promise<void>; forceFullSync(): Promise<{ count: number }> }
  ```
- `NoiseMarkers` loses its own load/sync effect in 05.3 and reads the
  provider. Until 09.1 it keeps its `filters` / `onMarkersLoaded` /
  `onDataChange` props.
- **Sign-out (05.7).** When the provider sees the uid change (to null or to
  a different uid), it:
  1. bumps a generation counter, so any in-flight sync result is discarded;
  2. calls `syncManager.clearSyncData()`;
  3. resets its state.
  
  A `cacheOwnerUid` metadata key catches the case where the browser was
  closed without signing out: on sign-in with a different uid, clear first.
  `AuthContext.signOut` also removes `localStorage['remembered_email']`.
  05.7 deletes the dead write at `LoginPage.tsx:37-41`; the value is never
  read back.
- **Role (08.1)** lives in `AuthContext`: `role: string | null`, plus
  `roleLoading`. It is loaded with `getDoc(doc(db,'users',uid))`, an
  owner read allowed by both the current rules and the post-02.4 rules.
  The 2 Auth users with no `users` doc resolve to `null`, which means no
  access under D1(A).
  - A role-read failure (offline) shows a Retry state, never access.
  - `ProtectedRoute` waits for `roleLoading` before deciding.

### 4.6 `NoiseMarkers.tsx` composite (04.2 → 05.3 → 06.3 → 09.1 → 09.5 → 09.6 → 10.4) — 09.6 is a MERGE

Final target (for verification). `NoiseMarkers` is purely presentational and
receives `readings: NoiseReading[]` that is already filtered (09.1). It does
not load, filter, call `console.warn` or invoke parent callbacks.

| Concern | Must be in the final file | Added by |
|---------|---------------------------|----------|
| Popup timestamp | via `toDate()` | 04.2 |
| Data source | from the provider, not a local effect | 05.3 |
| Popup category | `categoryLabel()` | 06.3 |
| Popup confidence | `confidenceLabel()` | 06.3 |
| Marker icons | from a module-level cache keyed by noise band | 09.5 |
| Marker addition | bulk-added to the cluster layer | 09.6 |
| Pin appearance | band glyph or shape, and AA badge colours | 10.4 |

**09.6 (perf-4) must be applied as a MERGE, never as a verbatim file
replace.** Pasting a pre-written imperative version would silently drop the
04, 05 and 06 work: the popups would show 'No timestamp' again, and
'Unclassified' would revert. **And 09.6 must not introduce an HTML-string
popup** (convention §2.12). `locationName` is attacker-writable, so
`marker.bindPopup(\`<h3>${reading.locationName}</h3>\`)` is stored XSS.
Use one of these instead:

- a single React-rendered popup: keep the selected reading in state, then
  render `<Popup position=…>` with JSX;
- `createRoot` into the popup container on `popupopen`;
- popup content built with `textContent`.

The cluster count icon may interpolate only the numeric count.
`HeatmapLayer` currently sits INSIDE `<MarkerClusterGroup>`
(`MapPage.tsx:182`). 09.1 moves it to be a sibling under `<MapComponent>`.

### 4.7 `exportHelpers.ts` and `DataTable.tsx` composites (04.2 → 06.3 → 07.1–07.3 → 10.2/10.4)

Final `exportHelpers.ts` target:
- pure functions `buildCsv(readings): string` and
  `buildJsonExport(readings, exportedAt)`, which are unit-tested;
- thin `exportToCSV(readings, filename)` and `exportToJSON(readings,
  filename)` wrappers that call `downloadFile`. The `userMap` parameter is
  removed in 07.2.

CSV columns, in order:

| Column | Content |
|--------|---------|
| `Timestamp` | `format(toDate(ts), 'yyyy-MM-dd HH:mm:ss')`, or empty when null |
| `Location` | location name |
| `Latitude` | latitude |
| `Longitude` | longitude |
| `Noise Level (dB, uncalibrated estimate)` | dB value |
| `Category` | the raw `soundClass`, or `Unclassified` |
| `Type` | sound type |
| `Confidence (%)` | empty when absent |
| `Contributor` | the masked label (07.2) |

**Every** cell passes through `csvCell()` (07.1), numbers included. It
prefixes `'` to values starting with `= + - @ \t \r`, doubles `"`, and
wraps the value in quotes.

The uncalibrated-dB caveat goes into the column header and into JSON
`metadata.note`. Do not add a `#` comment row: it breaks
`pandas.read_csv` and similar parsers.

- 06.3 edits only the category and confidence expressions. 07.1 then
  rewrites the whole row builder. Its BEFORE block is the post-06 text; if
  it does not match, apply it semantically: every cell goes through
  `csvCell`, and no 04 or 06 change is lost.
- `DataTable.tsx`: 04.2 deletes its local `toDate` (`:52-79`) in favour of
  the helper. 06.3 changes the category and confidence cells. 07.2 replaces
  the 'User Email' column (`:209`, `:282`) with 'Contributor' =
  `authorLabel(reading.userEmail)` and removes the `userMap` prop and the
  `UserInfo` import. 10.2 and 10.4 touch only the headers and badge
  classes.
- `src/lib/authorLabel.ts` (07.2) shows the stored masked label. It also
  **re-masks anything that still looks like a raw address**
  (`local@domain` → `lo***@domain`). This is a defence against legacy
  offline uploads via `APP:sync_service.dart:308` (priv-6, §7). Show
  `'Deleted User'` as-is, and 'Anonymous' when the label is missing.

### 4.8 `MapPage.tsx` composite (05.6 → 09.1–09.4 → 10.5–10.7)

- 05.6 makes these changes:
  - It replaces the logging-only `onSyncComplete` (`:91-93`) with the
    provider's `refresh`, so the map refreshes on sync (bug-4).
  - It routes `handleForceFullSync` (`:33-49`) through
    `provider.forceFullSync()`.
  - It replaces `confirm()`, `alert()` and `window.location.reload()` with
    the existing `ui/dialog` and inline status (bug-5 UX).
  - `SyncStatus` reads `lastSync`, `syncing`, `error` and `count` from the
    provider. Its hourly interval actually calls `refresh()`.
- 09.1 lifts the filter into MapPage as a `useMemo` over
  `[readings, userId, showAllUsers, datePreset]`, with primitive
  dependencies. The same array feeds `NoiseMarkers`, `HeatmapLayer` and the
  marker badge. `onDataChange` and `onMarkersLoaded` are deleted, and so is
  `readingsData` state.
- 09.2 stores a preset id (not a frozen `{start, end}`) and computes the
  range at filter time.
- 09.3 sets the default for `showAllUsers` to `true` under D1(A). Under
  D1(B) the default stays own-readings, but the empty state becomes a
  filter-aware overlay that offers "Show all readings".
- 10.5–10.7 add aria attributes, sizing and wrapping only. They must keep
  every 05 and 09 behaviour.

### 4.9 Pages and login composites

- **`DashboardPage.tsx`:**
  - 05.5 deletes the `onSnapshot` effect (`:31-39`) and the `db` /
    `firebase/firestore` imports. It sets
    `const { readings, loading } = useSyncedReadings(); hasData = readings.length > 0`.
    Skeletons gate on `loading`, the IndexedDB read, never on the network.
  - 08.2 wraps each chart card in its own `ErrorBoundary`.
  - 09.1 passes `readings` to `NoiseMarkers`.
  - 10.6 fixes the mini-map height.
- **`AnalyticsPage.tsx`:**
  - 05.4 renders skeletons while `loading`, and an error card with Retry
    (`refresh`) when `error` is set.
  - 07.2 deletes the `fetchAllUsers` effect (`:25-30`) and `userMap` state,
    and changes the export calls to `exportToCSV(readings, 'noise_readings')`.
  - 08.1 under D1(B) only wraps the export buttons in an admin check.
  - 08.2 adds per-card boundaries.
- **`LoginPage.tsx`:**
  - 05.7 removes only the dead `remembered_email` write. It keeps the
    checkbox, or removes it too if the spec says so; the field is never
    read.
  - 08.1 fixes the access copy to match D1: "Request access" stays only
    under D1(A).
  - 08.3 rewrites error handling, the password toggle, `autoComplete` and
    password reset.
  - 10.4 touches only contrast classes.

### 4.10 Root error boundary placement (08.2)

- `GlobalErrorPage.tsx` calls `useNavigate()` (`:2`), so it cannot render
  outside `BrowserRouter`. 08.2 removes that dependency (use
  `window.location.assign('/dashboard')` for "Go home") before using it as
  the fallback of a root `ErrorBoundary` in `main.tsx` that wraps `<App/>`.
  A root boundary outside the providers also catches provider-level
  failures (partly covering bug-11, §7).
- 08.2 also replaces the false "our team has been notified" copy
  (`:36`): nothing reports errors.
- 08.2 adds a `Layout` boundary around `{children}`, keyed by
  `location.pathname` so navigation resets it, plus per-card boundaries.

### 4.11 Shared constants (06 → 07 → 09 → 10)

- **`src/lib/noiseBands.ts` (06.1)** owns the thresholds: `< 50` Low,
  `≤ 70` Moderate, `> 70` High. This matches the current
  `NoiseMarkers.tsx:33-35` and the app. It also owns the band labels and
  the band colours. The marker, table badge, export `noiseLevel`, heatmap
  gradient stops (09.4) and legend (09.4) all import from it. **10.4
  changes band colours ONLY here** (dark text or darker shades for AA). It
  never adds per-component overrides.
- **`src/lib/categories.ts` (06.1)** mirrors
  `APP:lib/services/yamnet_class_mapping.dart:32-58`: 18 categories
  including **Quiet**, plus `Uncertain`. It provides:
  - aliases `Speech-Pollution` → `Speech` and `Speech-Ambient` → `Speech`
    for the category axis (the raw value is kept in exports and its
    `soundType` in the type chart);
  - `UNCLASSIFIED = 'Unclassified'`;
  - `categoryOf(reading)` (canonical, for grouping) and
    `categoryLabel(reading)` (for display);
  - `confidenceLabel()`;
  - one colour and one icon per category. Quiet must be visually distinct
    from Other; the app uses teal and 🔇 per
    `yamnet_class_mapping.dart:1183-1229`, and 06.1 reads the exact values
    there.
  
  The legacy `Sirens` / `Machinery` / `Animals` keys are dropped: no app
  version writes them, and production has none. A unit test asserts that
  every app category string plus both Speech aliases has a colour and an
  icon.
- **`DB_CAVEAT`** (07.3, exported from `src/lib/noiseBands.ts`): "dB values
  are uncalibrated estimates from phone microphones; levels vary by
  device." It is reused verbatim by the 09.4 legend.

### 4.12 `package.json` sequence (01 → 02 → 03)

- 01.1 adds the `vitest` devDependency (exact version, with a peer range
  that includes `vite ^7`; check with `npm view vitest@<v> peerDependencies`)
  and `"test": "vitest run"`. It adds `vitest.config.ts` (node environment,
  `@` alias via `mergeConfig` with `vite.config.ts`). There is no jsdom
  unless a spec requires it.
- 02.1 adds `"check:rules": "node scripts/check-rules-drift.mjs ../noise_pollution_mapper"`
  into the `scripts` block as it exists after 01.
- 03.3 moves `firebase-admin` from `dependencies` to `devDependencies`
  (only `scripts/*.js` use it; it is not bundled, per `bundle.txt`). Use
  `npm install -D -E firebase-admin@<current exact>` /
  `npm uninstall firebase-admin` so the lockfile is regenerated.
- 01.2's CI must not need secrets. `npm run build` succeeds without
  `VITE_FIREBASE_*` (the values are only read at runtime), and tests never
  initialise Firebase (§2.15).

### 4.13 `src/config/firebase.ts` (03.3 → 12.1)

03.3 deletes the `getStorage` import and `export const storage: any`. No
file imports `storage`, and the project has no bucket. 12.1's BEFORE will
still contain that line: drop it from the anchor, and type `auth: Auth`
and `db: Firestore` on the remaining lines.

### 4.14 `routes.tsx` and `index.css` (10.7 → 11.1/11.2)

- 11.1 converts the four page imports (`routes.tsx:3-6`) to `React.lazy`
  with a `Suspense` fallback, and must keep `ProtectedRoute` wrapping
  exactly as it is.
- 11.2 moves `@import "leaflet/dist/leaflet.css"` (`index.css:7`) into the
  map components (`MapContainer.tsx`), and must keep 10.7's edits to the
  44 px rule and the reduced-motion block.
- `manualChunks` goes in `vite.config.ts` only.

### 4.15 Push and Vercel timing

- Push DASH only with owner approval. Never push between 04.4 and the end
  of 05: 04.4 forces a full re-fetch, and 05.2 is what keeps later loads
  cheap. Ship 04 + 05 together.
- A push of 08 under D1(A) immediately locks out non-admin accounts. Tell
  the owner before pushing.
- The APP repo push (rules commits) is independent of M1, but push it
  before or with M1, so that the public source matches what is deployed.

### 4.16 Strict mode last (12)

- 12.2 enables `strictNullChecks`; 12.3 enables the rest of `strict`.
- The fixes stay type-level: guards, narrowing and explicit types. **A
  null error that reveals a real behaviour bug not covered by an earlier
  cluster is fixed minimally and named in the commit body. It is not
  redesigned.**
- `noUnusedLocals` and `noUnusedParameters` stay false. That is out of
  scope (§7).

---

## 5. Master commit checklist (final execution order)

To convert between the two numberings: `01.k` = #k; `02.k` = #(2+k);
`03.k` = #(6+k); `04.k` = #(9+k); `05.k` = #(13+k); `06.k` = #(20+k);
`07.k` = #(24+k); `08.k` = #(27+k); `09.k` = #(30+k); `10.k` = #(36+k);
`11.k` = #(43+k); `12.k` = #(45+k).

Each numbered checkbox is one step, which means one commit, or one commit in
each repo for [APP+DASH]. MANUAL entries are not commits. Titles are
verbatim from the cluster specs.

**Cluster 01 — Test harness & CI** (`audit/playbook/01_test_harness_ci.md`)
- [ ] 1. `test(harness): add vitest with a test script and a first pure-module test (test-1)`
- [ ] 2. `ci: run lint, type-check, tests and build on every push and pull request (test-1)`

**Cluster 02 — Firestore rules hardening** (`audit/playbook/02_firestore_rules_hardening.md`; apply §4.1, §4.2)
- [ ] 3. [DASH] `chore(rules): add a drift check that compares both firestore.rules copies modulo CRLF (test-1)`
- [ ] 4. [APP+DASH] `fix(rules): validate noise_readings field types, ranges and keys on create and update (sec-1)`
- [ ] 5. [APP+DASH] `fix(rules): pin the deleted_user rewrite to the caller's own uid prefix and two fields (sec-3)`
- [ ] 6. [APP+DASH] `fix(rules): make users profiles owner-read only and remove the isAdmin list grant (priv-2)`
- [ ] **M1 — MANUAL, owner-gated: deploy the rules.**
  1. Show the full `firestore.rules` diff against `9b08e68` and get an
     explicit "yes".
  2. From APP, run `firebase deploy --only firestore:rules,firestore:indexes`.
  3. Post-deploy smoke, in the app on a device or emulator, within
     minutes: one online save; one offline save, then reconnect and upload;
     History delete plus Undo.
  4. Optional, with a throwaway account only: account deletion
     (anonymization must succeed).
  5. Dashboard: sign in as the admin and confirm `/dashboard` loads.
  
  If anything fails: roll back (§4.2.7) and STOP.

**Cluster 03 — Dead Storage pipeline removal** (`audit/playbook/03_dead_storage_pipeline.md`)
- [ ] 7. `fix(privacy): delete Storage cache-export functions that makePublic() the readings dump (priv-3, build-5)`
- [ ] **M2 — MANUAL, owner-gated (D4): check for deployed functions.**
  1. Run `firebase functions:list --project noise-pollution-mapper-9ad3d`
     (read-only).
  2. If `exportCacheDaily` or `exportCacheWeekly` is listed, show the owner
     `firebase functions:delete exportCacheDaily exportCacheWeekly --project noise-pollution-mapper-9ad3d`,
     plus `--region <region from the listing>`, and get a "yes".
  3. Record the result. It also tells you whether the project is on Blaze,
     which the perf-1 severity depends on.
- [ ] 8. `refactor(cache): remove the dead Storage cache downloader, CacheStatus and their UI copy (arch-2, ux-7)`
- [ ] 9. `build(deps): drop browser Storage init and move firebase-admin to devDependencies (build-4)`

**Cluster 04 — Readings storage contract** (`audit/playbook/04_readings_storage_contract.md`; apply §4.3, §4.4)
- [ ] 10. `fix(idb): reuse one IndexedDB connection and handle versionchange and blocked upgrades (arch-4)`
- [ ] 11. `fix(readings): shared toDate/getCoordinates helpers fix 'Unknown' export and popup timestamps (bug-1, bug-8, bug-13, priv-5)`
- [ ] 12. `fix(sync): normalize Firestore docs into a whitelisted plain DTO before IndexedDB (bug-1, sec-1)`
- [ ] 13. `fix(idb): bump cache schema to v2 so every browser purges stale rows and re-fetches (priv-1, bug-1)`

**Cluster 05 — Sync engine & ReadingsProvider** (`audit/playbook/05_sync_engine_provider.md`; apply §4.4, §4.5, §4.8, §4.9)
- [ ] 14. `fix(sync): server-time watermark with overlap window and single-flight sync (data-1, perf-2)`
- [ ] 15. `fix(sync): periodic full replace swapped in one transaction evicts deleted and rewritten readings (priv-1, bug-5)`
- [ ] 16. `refactor(readings): one ReadingsProvider loads and syncs once for every consumer (perf-2)`
- [ ] 17. `fix(analytics): show sync loading and error states instead of a false 'no data' (ux-1)`
- [ ] 18. `perf(dashboard): drop the full-collection onSnapshot and derive counts from the cache (perf-1)`
- [ ] 19. `fix(map): route Sync, hourly auto-sync and Fetch All through the provider so the map refreshes (bug-4, bug-5)`
- [ ] 20. `fix(privacy): clear the readings cache and remembered email on sign-out or account switch (priv-4)`

**Cluster 06 — Category taxonomy & analytics** (`audit/playbook/06_taxonomy_analytics.md`; apply §4.3, §4.11; D2)
- [ ] 21. `feat(taxonomy): shared category and noise-band module mirroring the app's 18 categories (data-3)`
- [ ] 22. `fix(analytics): CategoryChart uses the shared taxonomy, adds Quiet and folds manual Speech reports (data-3)`
- [ ] 23. `fix(analytics): one 'Unclassified' label for missing soundClass and '—' for absent confidence (data-2)`
- [ ] 24. `fix(analytics): bucket trend weeks by ISO week-year with zero-padded sortable keys (bug-3)`

**Cluster 07 — Research export & privacy** (`audit/playbook/07_export_privacy.md`; apply §4.7, §4.11)
- [ ] 25. `fix(export): quote every CSV cell and neutralize formula-leading values (sec-2)`
- [ ] 26. `fix(privacy): show the masked author label and stop listing the users collection (priv-2)`
- [ ] 27. `fix(ux): disclose that dB values are uncalibrated phone estimates in stats and exports (ux-3)`

**Cluster 08 — Access control & resilience** (`audit/playbook/08_access_resilience.md`; apply §4.5, §4.9, §4.10; D1)
- [ ] 28. `fix(auth): gate the dashboard on the users/{uid} admin role with a no-access page (sec-4)`
- [ ] 29. `fix(ui): root and per-card error boundaries so one bad reading cannot blank the app (sec-1)`
- [ ] 30. `fix(login): announce friendly auth errors, label the password toggle, add reset and autocomplete (a11y-7)`
- [ ] **M3 — MANUAL, owner-gated, only if needed.** Grant dashboard access to
  another account by setting `users/{uid}.role = 'admin'` in the Firebase
  console. Use the console or Admin SDK, never the browser. Show the uid and
  get a "yes" first. Production today has exactly one admin, the owner.

**Cluster 09 — Map correctness & performance** (`audit/playbook/09_map_correctness_perf.md`; apply §4.6, §4.8, §4.11; D5)
- [ ] 31. `fix(map): one filtered reading set feeds markers, heatmap and the marker badge (bug-2, bug-9)`
- [ ] 32. `fix(map): controlled date presets recomputed at filter time with day boundaries (bug-6, bug-8)`
- [ ] 33. `fix(map): default to all readings and show a filter-aware empty overlay instead of a fake pin (ux-2)`
- [ ] 34. `fix(heatmap): app-aligned dB intensity, correct 0 dB handling and a map legend (bug-7)`
- [ ] 35. `perf(map): cache marker icons per band and memoize the marker list (perf-3)`
- [x] 36. `perf(map): bulk-add markers to the cluster group in cancellable chunks (perf-4)` (MERGE, §4.6; skip per D5 if the measurement says so)

**Cluster 10 — Accessibility & layout** (`audit/playbook/10_accessibility_layout.md`; apply §4.8, §4.11)
- [ ] 37. `fix(a11y): sidebar open on desktop, inert when closed, closes on navigate and Esc (a11y-1)`
- [ ] 38. `fix(a11y): keyboard-sortable DataTable headers with aria-sort (a11y-2)`
- [ ] 39. `fix(a11y): text summaries, accessibilityLayer and non-colour cues for charts (a11y-3)`
- [ ] 40. `fix(a11y): raise text and badge contrast to WCAG AA and add band glyphs to pins (a11y-4, a11y-5)`
- [ ] 41. `fix(a11y): name map controls, expose toggle state, make the filter panel a dismissable dialog (a11y-6)`
- [ ] 42. `fix(layout): size maps to their containers so OSM attribution stays visible (ux-4)`
- [ ] 43. `fix(layout): wrap map controls on phones, scope 44px targets, honor reduced motion (ux-5, a11y-8)`

**Cluster 11 — Bundle splitting** (`audit/playbook/11_bundle_splitting.md`; apply §4.14)
- [ ] 44. `perf(bundle): lazy-load route pages behind Suspense (perf-5)`
- [ ] 45. `perf(bundle): split firebase, recharts and leaflet vendor chunks and scope leaflet CSS (perf-5)`
- [ ] 45a. `fix(deploy): recover stale tabs from missing chunks and stop serving index.html as an asset (perf-5, sec-5)` (11.3, added 2026-10-16 from a live production check; numbered 45a so later items keep their numbers)

**Cluster 12 — Type safety** (`audit/playbook/12_type_safety.md`; apply §4.13, §4.16)
- [ ] 46. `refactor(types): type Firebase handles as Auth and Firestore instead of any (arch-1)`
- [ ] 47. `build(ts): enable strictNullChecks and fix the surfaced null bugs (arch-1)`
- [ ] 48. `build(ts): enable full strict mode (arch-1)`

---

## 6. Definition of done

The playbook is DONE when all of the following hold.

1. **Every non-refuted Critical, High and Medium finding is fixed.** "In
   scope" means the IDs listed in each spec's Scope table; together they
   cover every High and Medium in the audit. Each is verified by its
   spec's per-step acceptance criteria. Do not re-audit: the acceptance
   criteria ARE the verification. The Highs are bug-1, data-1, data-2,
   perf-1, priv-1 and sec-1 (sec-1 spans 02, 04 and 08).
2. **DASH gates at HEAD:**
   - `npx tsc -b` reports 0 errors under `strict` (after 12), and passed
     after every one of the 48 DASH commits.
   - `npx eslint .` reports 0 errors and 0 warnings (the one baseline
     warning was in a file deleted in 03).
   - `npm test` is green, with at least these suites present and passing:
     - `toDate` / `normalizeReading`;
     - the sync watermark and full-replace decision (mocked Firestore and
       localDb);
     - taxonomy coverage of all 18 app categories plus the aliases;
     - ISO week buckets;
     - `csvCell` / `buildCsv`, including formula-prefixed and quote-bearing
       values;
     - `authorLabel` re-masking.
   - `npm run build` succeeds. The login route loads no leaflet or recharts
     chunk (11). Record the before and after chunk table in the 11.2 commit
     body.
3. **APP gates at HEAD:**
   - `flutter analyze` is clean and `flutter test` passes 205.
   - The APP diff since `9b08e68` is `firestore.rules` only.
   - `node scripts/check-rules-drift.mjs ../noise_pollution_mapper` passes.
   - `git ls-files -s firestore.rules` gives the same blob id in both
     repos.
4. **Manual actions recorded.** Put the outcome of each in the cluster's
   last commit body, or in the PR description:
   - M1: rules deployed with owner approval, and the post-deploy smoke
     passed. Or explicitly postponed by the owner.
   - M2: functions listed, and deleted if present, with owner approval.
   - M3: done only if requested.
5. **Owner QA pass** on `npm run preview` or a Vercel preview, signed in as
   the admin:
   - Analytics → Export CSV and JSON: real timestamps on every row; a
     'Contributor' column holding masked labels only; Category reads
     'Unclassified' where `soundClass` is missing.
   - The CategoryChart 'Other' bar is no longer inflated, and the caption
     shows the unclassified count.
   - The weekly trend is chronological.
   - Every map popup shows a date.
   - With "Last 7 days" selected, a reading recorded on the phone appears
     after pressing Sync, without a reload. Heatmap and markers agree.
   - Network panel: `/dashboard` opens no `Listen` channel on
     `noise_readings`. A warm reload issues only the delta query.
   - Sign out, then DevTools → Application: the `noise-pollution-db`
     readings store is empty and there is no `remembered_email`.
   - Under D1(A), a non-admin test account sees the no-access page, and no
     `noise_readings` request appears in the Network panel.
   - A wrong password shows a friendly message. The whole app is usable by
     keyboard alone.
6. **Convention grep checks** (run from DASH; each must print nothing
   unless stated):
   - `grep -rnE "where\([^)]*'>='" src`
   - `grep -rnE "\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b" src`
   - `grep -rn "onSnapshot" src`
   - `grep -rnE "getStorage|firebase/storage|makePublic" src scripts`, and
     `ls functions` (the directory is gone)
   - `grep -rn "\.toDate()" src | grep -v "src/lib/readings.ts"`
   - `grep -rnE "fetchAllUsers|userService|collection\(db, 'users'\)" src`
   - `grep -rnE "bindPopup|bindTooltip|innerHTML|insertAdjacentHTML|divIcon\(\{[^}]*html" src`.
     This may list only `components/ui/chart.tsx` (static `ChartStyle`)
     and a numeric cluster-count icon.
   - `grep -rn "label: 'Quiet'" src`. The only "Quiet" left must be the
     category in `src/lib/categories.ts`.
   - `git ls-files | grep -i serviceAccountKey`
   - `git log 353bbdd..HEAD --format=%B | grep -iE "co-authored-by|generated with"`
     in DASH, and the same with `9b08e68..HEAD` in APP.
7. **Accepted residuals.** These are documented, not bugs to fix:
   - An offline-uploaded reading back-dated past the watermark overlap
     appears within 24 h, or at once on "Fetch All" (§4.4).
   - A deleted or anonymized reading leaves a long-lived browser within
     24 h, not instantly.
   - Any signed-in account can still read every `noise_readings` doc
     through the SDK. The app's community feed requires
     `allow read: if isSignedIn()`, so the D1 gate is UI and cost
     protection, not a rules boundary.
   - Rules validation applies to new writes only. Existing docs are not
     re-validated; email-only and anonymization updates deliberately skip
     range checks.
   - A legacy doc outside the D3 ranges cannot be restored via History
     undo.
   - CSV and JSON files exported before this playbook remain wherever they
     were saved.
   - The legacy raw-email offline upload path (priv-6) is masked at display
     time by 07.2 but stored unmasked in Firestore until the app fix in §7.
   - The billing plan (Spark or Blaze) is unverified unless M2 settled it.

---

## 7. After the playbook — follow-up work (do NOT start during execution)

**Low and Enhancement findings, not bundled above.** Each is one line, and
the full evidence is in the audit docs.

- **DONE (`06e124f`)** **bug-10**: StatsCards counts a missing dB as 0, and
  `Math.max(...spread)` throws at about 100k rows. Use `reduce`, and
  decide between an arithmetic mean and Leq labelling.
- **DONE (`4a9c3e1`)** **bug-11**: `ThemeContext` reads `localStorage` unguarded during the
  first render. Add a try/catch `safeStorage` helper. The 08.2 root
  boundary only softens this.
- **DONE (`ac40704`)** **bug-12**: Trend buckets and CSV timestamps use browser-local time.
  Bucket in `Asia/Colombo` explicitly, and add an ISO-UTC timestamp column
  to the exports.
- **DONE (`59c08aa`, the new tracked DEPLOYMENT_GUIDE.md)** **build-1**: The untracked `DEPLOYMENT_GUIDE.md:229-248` embeds an
  obsolete, weaker ruleset. Replace it with a pointer to
  `APP:firestore.rules` and the §2.3 deploy command.
- **DONE (APP `decbe0c`, DASH `f2f8cc2`)** **build-2**: `APP:firebase.json` still declares a `storage` target, and
  `storage.rules:10-12` names a nonexistent `firebase.rules`. Remove the
  target and both `storage.rules` copies until a bucket exists. This is an
  APP-repo change that needs owner sign-off.
- **DONE (`9b840a8`)** **build-3**: Validate the six `VITE_FIREBASE_*` env vars at startup and
  render a readable configuration error.
- **DONE (`1b741db`)** **perf-6**: DataTable re-sorts the whole dataset on every page change.
  Split it into a sort memo and a slice memo.
- **DONE (APP `83df6e1`)** **priv-6** (APP): `APP:lib/services/sync_service.dart:308` falls back to
  the raw auth email for legacy queue entries. The fix is a one-line
  change to `authorLabel(...)`; the mobile playbook §4.2 accepted it as a
  residual. 07.2 masks it at display time in the meantime.
- **DONE (`0e46946` headers and report-only CSP, `dad3004` rewrite, `a7a644d` CSP enforced)** **sec-5**: `vercel.json` sets no security headers (CSP, frame-ancestors,
  nosniff), and its catch-all rewrite serves `index.html` for missing
  assets. (The rewrite half moved into 11.3 on 2026-10-16. CSP, frame-ancestors
  and nosniff stay here.)
- **DONE (`2e4dd35`)** **ux-6**: The dead map search box, the "Current location" button, and
  "More filters coming soon" placeholders. Wire them up or remove them.
- **DONE (`19e93f4`)** **ux-8** (the remainder): Add a NotFound route; preserve the return path
  through login; redirect authenticated users away from `/login`.
- **DONE (`0ac68ed`)** **ux-9**: Clamp DataTable pagination (it shows "1/0" and "Showing -9 to
  0").
- **DONE (`1d1c6af`)** **ux-10**: The trend chart's max and min lines are invisible for a
  single bucket.
- **DONE (`c8339c4`)** **ux-11**: Print outputs only the current 10-row page.
- **DONE (`8f76776`)** **ux-12**: The "Real-time" subtitle overstates how fresh the data is.
- **DONE (`7d862d7`)** **ux-13**: Markers outside the Sri Lanka `maxBounds` are counted but can
  never be reached.
- **DONE (`cc07bc4`)** **ux-14**: The Vite default title and favicon, with no per-route title.
- **DONE (`0aac0f8`)** **arch-3** (the remainder): `VITE_*_THRESHOLD` env vars are never read.
  Remove them or wire them to `noiseBands.ts`.

**Parked engineering work:**

- **DONE in code 2026-10-16 (APP `d2f2779` rules + `4b826cd` writers; DASH `1a58715` rules + emulator tests 88/88, `9b5472f` DTO, `0e009d7` second delta query on `syncedAt`). Effective once the rules are deployed and the new app build is released — deploy order: rules → dashboard → app.** **App-side sync cursor (data-1, complete fix).**
  - Add `syncedAt: FieldValue.serverTimestamp()` to BOTH app writers
    (`firebase_service.dart` `_saveToFirebase`, `sync_service.dart`
    `_saveToFirebase`).
  - Add `syncedAt` to the rules key whitelist (mirrored and redeployed per
    §4.2).
  - Move the dashboard delta to `where('syncedAt','>', …)`. That is a
    single-field query and needs no composite index.
  - Docs written by older app versions lack `syncedAt`, so the 24 h full
    replace must stay as the backstop.
  - This needs an app release.
- **DONE (`b637437`, run in CI by `01c04ec`)** **Firestore rules unit tests:** `@firebase/rules-unit-testing` against
  the emulator (needs Java). Cover every row of the §4.1 matrix, plus the
  attack cases: a map-typed `soundClass`, a dB of 1e300, a 1 MB
  `locationName`, `deleted_user_<another uid prefix>`, and a reassign to an
  arbitrary uid. Run the suite in APP CI.
- **DECIDED AGAINST (see the decision note below)** **The SDK's own persistence:** replace the hand-rolled IndexedDB cache
  with `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`
  and one shared listener. It handles removed and modified docs natively,
  with no new index. Re-evaluate the read cost first.
- **DONE (`71332f7`, `dac3ad1`, `7d3b12a`)** **`noUnusedLocals` / `noUnusedParameters`,** and a dead-code sweep of the
  unused `components/ui/*` files.
- **DONE (`d1857a1`, deleted along with `firebase-admin`)** **Review `scripts/export-cache.js` and
  `scripts/export-cache-to-firestore.js`.** They are Admin SDK tools that
  write a full dump. The `cache/` collection does not exist; delete them if
  unused.
- **DONE (owner answered 2026-10-16: Spark plan)** **Billing plan check** (perf-1 needs_prod_check).

### Decision: do not migrate to the SDK persistentLocalCache

Decided 2026-10-16. The dashboard keeps its hand-rolled IndexedDB cache and delta
sync (`src/utils/syncManager.ts`) instead of moving to
`initializeFirestore(... persistentLocalCache(...))` with a shared listener.

- **Cost.** Per the Firebase billing documentation, a snapshot listener that
  reconnects after being offline for more than 30 minutes is charged as a new
  query. With the SDK cache, every dashboard visit more than 30 minutes after
  the last one would therefore re-bill the whole result set, about 3,374 reads
  today, and more as the collection grows.
- **Current behaviour.** The delta sync reads only documents that are new or
  changed since the stored watermark (`timestamp >` the watermark minus an
  overlap window), so a returning visit costs a handful of reads. The periodic
  full replace is the only full read.
- **Quota.** The project is on the Spark plan, whose limit is 50,000 reads per
  day, shared with the mobile app. At about 3,374 reads per visit, roughly 15
  visits a day would exhaust it for both clients. That is the perf-1 quota risk
  the cache and delta sync were built to remove, and the migration would bring
  it back.
- **Revisit** only if the project moves to the Blaze plan and the collection
  stays small, or if the SDK's reconnect billing rule changes.

Consult `audit/00_*` (master report) before scheduling any of this. Do not
re-audit the codebase.
