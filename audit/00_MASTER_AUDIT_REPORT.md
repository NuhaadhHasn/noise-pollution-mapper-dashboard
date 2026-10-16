# Master Audit Report - Noise Pollution Mapper Web Dashboard

> **FINAL** - generated 2026-10-16 from the read-only, multi-agent, cross-repo audit. Seven dimension auditors took part (security/rules, data layer and query shape, correctness, React/Vite quality, UX, performance, build/deploy). An adversarial verification pass re-checked every Critical and High, and a consolidation pass merged 142 raw dimension findings into the 65 reported here.
>
> Status legend:
> - `confirmed`: an independent adversarial reviewer re-proved the finding against the code.
> - `partial`: the reviewer confirmed the mechanism but corrected part of the claim. Read the corrections in the category document before fixing.
> - `refuted`: the reviewer disproved it. Refuted items are kept for transparency and excluded from the playbook.
> - `unverified`: not individually re-checked.
>
> Only Critical and High findings were adversarially verified. A Critical needs two independent review lenses to agree, and no finding is Critical after verification. Reviewers defaulted to refuted when uncertain. Every severity in this audit set is the post-verification severity.

**Scope.**
- **Target.** The React 19 + Vite 7 + TypeScript 5.9 web dashboard at `noise-pollution-mapper-dashboard/` (private repo, HEAD `353bbdd`).
- **Counterpart.** It was audited as one system with the Flutter app at `noise_pollution_mapper/` (public repo, master `9b08e68`), because both share Firebase project `noise-pollution-mapper-9ad3d`. The app is the only writer of `noise_readings` and `users`. The dashboard browser only reads. Its `functions/` and `scripts/` use the Admin SDK, which bypasses the security rules.
- **The app's own audit.** Its 338-finding audit is closed. It was read only to establish the contract, that is, what the app writes and what it expects the rules to allow. An app-side defect appears here only where it changes what the dashboard reads or shows, tagged `repo: app`.
- **Dimensions.** All seven were covered.
- **Read-only.**
  - Nothing outside `audit/` was modified, and no fix was applied.
  - `serviceAccountKey.json` was never opened.
  - No agent built, installed, linted, type-checked or called Firebase over the network.
- **Inputs.**
  - Static-check results come from precomputed logs.
  - Production facts come from the owner-run read-only probe of 2026-10-16 ~00:20 (`prod_probe.json` and `deployed_firestore.rules`). The probe prints aggregates only, with no PII.

## Statistics

Total findings: **65**. Of these, 11 are cross-repo (they live in the contract between the two clients) and 54 are dashboard-only.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 6 |
| Medium | 33 |
| Low | 26 |
| Enhancement | 0 |

| Category | High | Medium | Low | Total |
|----------|------|--------|-----|-------|
| ui-ux | 0 | 5 | 9 | 14 |
| bug | 1 | 8 | 4 | 13 |
| accessibility | 0 | 7 | 1 | 8 |
| performance | 1 | 4 | 1 | 6 |
| privacy | 1 | 3 | 2 | 6 |
| security | 1 | 3 | 1 | 5 |
| build-deploy | 0 | 0 | 5 | 5 |
| architecture | 0 | 1 | 3 | 4 |
| data-contract | 2 | 1 | 0 | 3 |
| testing | 0 | 1 | 0 | 1 |
| **Total** | **6** | **33** | **26** | **65** |

| Verification status | Count |
|---------------------|-------|
| unverified | 58 |
| confirmed | 5 |
| partial | 2 |
| refuted | 0 |

| Repo | Count | IDs (cross-repo only) |
|------|-------|-----------------------|
| dashboard | 54 | - |
| both (cross-repo) | 6 | data-1, sec-1, sec-3, test-1, build-1, build-2 |
| dashboard (cross-repo) | 4 | data-2, priv-1, data-3, sec-4 |
| app (cross-repo) | 1 | priv-6 |

## Verification Results (adversarial re-review)

Seven findings were adversarially re-reviewed. Six stand at High; `priv-2` was downgraded from High to Medium. No finding was refuted.

| ID | Verdict | Severity after | Reviewer reasoning (abridged) |
|----|---------|----------------|-------------------------------|
| bug-1 | CONFIRMED | High | The sync spreads `...doc.data()`, which still holds live SDK `Timestamp` instances, into IndexedDB (`syncManager.ts:90-93`, `:141-147`, `:247-250`; `db.ts:77-79`). A `Timestamp` keeps only `seconds`/`nanoseconds` as own fields; `toDate()` lives on its prototype, which structured clone drops. Every consumer reads back from IndexedDB, so `exportHelpers.ts:61` always takes the `'Unknown'` branch. |
| data-1 | CONFIRMED | High | Both delta queries key only on `timestamp >` (`syncManager.ts:84-87`, `:135-138`). The watermark is the browser clock, taken after the fetch and the IndexedDB write (`:156-157`). The app's offline path deliberately writes capture time (`sync_service.dart:313-319`) and uploads later (`:338`), so a back-dated upload never matches the query. Corrections: the race window is real but less likely than the back-dating case; only a periodic full replace or an app-side upload cursor closes the back-dating gap. |
| data-2 | CONFIRMED | High | `CategoryChart.tsx:79` falls back to `'Other'`. Per the probe, `soundClass` is on 691 of 3,374 docs, no doc has `soundCategory`, and 391 docs are genuinely 'Other'. The 'Other' bar therefore holds 3,074 readings: 91% of all data, of which 87% are unclassified. The table, popup, CSV and JSON call the same docs 'Unknown', and the app's own analytics skips them. Correction: the confidence bar is 0% wide, so no red is actually visible. |
| perf-1 | CONFIRMED (NEEDS PROD CHECK) | High | `/` redirects to `/dashboard` and login navigates there, so the page is every session's landing page. `DashboardPage.tsx:33-37` is an unfiltered, unlimited `onSnapshot` used only for `.size`, with no error callback. `config/firebase.ts:29` enables no persistence, so each attach bills about 3,374 reads. The real cost depends on the billing plan. |
| priv-1 | PARTIAL | High | Root mechanism confirmed. Delta sync uses `timestamp >` only. Writes are upsert-only (`db.ts:93-95`). The only row removal sits behind the `confirm()` in `forceFullSync`. Sign-out clears nothing. No app mutation touches `timestamp`. Corrections: raw pre-backfill `userEmail` values are never displayed or exported, only held at rest in IndexedDB. The `deleted_user_*` sub-case is latent: production has 0 such docs. |
| priv-2 | PARTIAL | Medium (reported High) | Path confirmed. `AnalyticsPage.tsx:26-30` lists `users`, `userService.ts:24` maps the raw `email`, and the value is rendered at `DataTable.tsx:282` and exported at `exportHelpers.ts:77` beside the coordinates. Downgraded because only the single admin (the owner, who already has console and Admin-SDK access) gets raw emails; everyone else sees a mislabelled UID column. This is a data-minimisation regression, not an access breach. |
| sec-1 | CONFIRMED | High | The rules check only `userId` on create (`firestore.rules:106-108`) and on update (`:130-134`). Sign-up is open, and `ProtectedRoute` needs only `isAuthenticated`. A map-typed `soundClass` passes through `CategoryChart.tsx:79` and throws at `:220` as a React child. The only error boundary wraps the map, so React 19 unmounts the root. The cache never evicts the doc. It is an attack path, not a live crash: production data is well typed. |

## Top risks

**1. One write from any registrant can blank the dashboard for every viewer (`sec-1`, with `sec-3` and `sec-4`).**
- **The rules prove who wrote a reading, never what it contains.** Create and update check only `userId` (`firestore.rules:106-108`, `:130-134`). Email/password sign-up is open project-wide (7 Auth users, all `password`). The dashboard admits any signed-in account (`ProtectedRoute.tsx:25`).
- **How the crash happens.** A single `noise_readings` doc with, for example, a map-typed `soundClass` reaches every browser on its next delta sync. It throws inside CategoryChart's render. There is no route-level or root error boundary, so the whole app unmounts on `/dashboard` (the default route) and on `/analytics`.
- **Why it persists.**
  - The browser cache never evicts the doc (`priv-1`).
  - The `deleted_user_*` update branch accepts any suffix (`sec-3`). The attacker can rewrite the doc's `userId` that way, after which no client can delete it.
- **Status.** Production data is clean today, so this is an open attack path, not an outage.
- **Fix (spans both repos).**
  - A `validReading()` predicate in the app repo's `firestore.rules`: playbook cluster 02, owner decision D3. Run the value-range check P8 first.
  - A whitelisting normaliser and error boundaries in the dashboard: clusters 04 and 08.

**2. Every exported and popup timestamp is lost (`bug-1`).**
- **Mechanism.** The sync stores whole Firestore documents, live `Timestamp` instances included, in IndexedDB. Structured clone keeps `seconds`/`nanoseconds` but drops the prototype, so `toDate()` is gone when a row is read back. Every consumer reads from IndexedDB.
- **Impact.** Every CSV and JSON row says 'Unknown' (`exportHelpers.ts:61`, `:111`), and every map popup says 'No timestamp' (`NoiseMarkers.tsx:362-364`). The research export, the dashboard's main deliverable, has no usable time column.
- **Why it went unnoticed.** The table, the trend chart and the map date filter parse the plain `{seconds}` shape themselves (`DataTable.tsx:70-71`, `NoiseTrendChart.tsx:42-43`, `NoiseMarkers.tsx:179-183`). The comment at `NoiseMarkers.tsx:179` even says the value is "stored as { seconds, nanoseconds }". The export and popup paths were never updated.
- **Fix (cluster 04).** Store epoch millis behind one shared `toDate()` helper, then bump the IndexedDB schema so every browser re-fetches.

**3. The cache silently misses back-dated offline uploads (`data-1`).**
- **The two clients mean different things by `timestamp`.**
  - The app deliberately stamps offline readings with their capture time (`sync_service.dart:313-319`) and uploads them later.
  - The dashboard uses `timestamp > lastSync` as an arrival cursor. Its watermark is taken from the browser clock, after the fetch (`syncManager.ts:156`).
- **Impact.** A reading captured offline before a browser's last sync is never fetched. It is missing from the map, stats, charts and exports, with no sign anything is missing, until someone presses 'Fetch All Readings'.
- **Neither repo is wrong on its own;** the contract between them is broken.
- **Fix.** A server-time watermark with an overlap window narrows the race but cannot catch uploads back-dated by hours. Closing that needs a periodic full replace (cluster 05) or, later, an app-side upload-time field. How many readings are affected today is production check P10.

**4. Deletions are never honoured in browser caches (`priv-1`, `priv-4`).**
- **Mechanism.** The IndexedDB cache is upsert-only and driven by the same `timestamp` cursor. App-side Clear History, single delete, email propagation and account-deletion anonymisation never touch `timestamp`, so they never reach it.
- **Impact.**
  - Deleted readings, with GPS, stay in every browser that cached them: on the map, in the charts and in both exports.
  - On the admin's browser, stale uids still resolve to raw emails through the leftover `users` doc.
  - Browsers that synced before the 2026-09-09 backfill still hold raw `userEmail` values at rest. They are not displayed.
  - Sign-out clears nothing (`priv-4`).
- **Fix (clusters 04-05).** Bounded staleness through an automatic full replace, plus a one-time schema bump that purges every existing cache. P11 lists how to find the browsers that hold old caches.

**5. Category analytics are wrong for 79.5% of the data (`data-2`, `data-3`).**
- **Present-day defect.**
  - 2,683 of 3,374 readings have no `soundClass`: the app omits classification below its threshold, and older docs predate it.
  - CategoryChart folds them into the real 'Other' bar, making it 3,074 readings (91% of all data). The table, popup and exports call the same readings 'Unknown', and the app's own analytics excludes them.
  - Missing confidence renders as 0%.
- **Forward-compat gap (`data-3`).** `Quiet` (the 18th category) and the manual-report values `Speech-Pollution`/`Speech-Ambient` are missing from the colour and icon maps. This only matters later: no `Quiet` doc exists in production yet.
- **Fix (cluster 06).** One shared taxonomy, with unclassified readings excluded from the bars and counted in a caption (owner decision D2).

**6. The Overview page reads the whole collection on every visit (`perf-1`, `perf-2`).**
- **Mechanism.** DashboardPage attaches an unfiltered `onSnapshot` on `noise_readings` only to show a count (`DashboardPage.tsx:33-37`).
- **Cost.** About 3,374 billed reads per visit, and roughly 6,700 on a browser's first visit together with the initial full sync.
- **Failure mode.** There is no error callback, so a failed or denied listener leaves the skeletons up forever.
- **Billing.** If the project is on the no-cost Spark plan, the daily free read quota is shared with the app, so heavy dashboard use could exhaust it for both clients. Which plan applies is an open production question (see below).
- **Related (`perf-2`, unverified).** Each chart runs its own sync hook, so a fresh browser starts up to five parallel first syncs. The data auditor found the SDK most likely shares one watch target between them, which would make the multiplied cost local CPU and IndexedDB work rather than billed reads.
- **Fix (cluster 05).** Derive counts from one shared readings provider.

**7. The export and access surface outruns the 2026-09-09 remediation (`sec-4`, `priv-2`, `sec-2`, `priv-3`).**
- **Access (`sec-4`).** Any account that can sign up in the app can open the research dashboard and bulk-export every reading with its coordinates.
- **User column (`priv-2`).**
  - The single admin's table and CSV join raw `users.email` to coordinates. This is the one export path `d1fb172` never covered.
  - Everyone else sees raw Firebase UIDs under a 'User Email' header.
  - Every reading already carries a masked `userEmail` label, which the dashboard ignores.
- **CSV injection (`sec-2`).** CSV cells allow formula and column injection from writer-controlled `locationName` and `soundClass` values.
- **Latent public dump (`priv-3`).** The scheduled cache-export Cloud Function still calls `makePublic()` on a full readings dump. It is harmless only because no Storage bucket exists.
- **Fix.** Clusters 03, 07 and 08, under owner decision D1 (default: an admin-only dashboard).

## Known items from the handoff — resolution

The full resolutions, with evidence, are in `03_CROSS_REPO_CONTRACT_AUDIT.md` section 1.

| # | Handoff item | Resolution | Findings |
|---|--------------|------------|----------|
| 1 | The two `firestore.rules` contradict each other; whichever deploys last wins | **RESOLVED** in source and in production. Dashboard commit `353bbdd` adopted the merged ruleset, and both repos commit the same blob (`04bd418e`). The owner's probe shows the deployed ruleset `ebff82af-...` (created 2026-09-09) equals both copies. Residual risk: only a header comment prevents future drift, and an untracked deploy guide still prints an obsolete ruleset. | `test-1`, `build-1` |
| 1a | The `users` list is denied for everyone because nothing writes `role`, so `/analytics` is silently dead | **Half true, and "dead" is REFUTED.** No code writes `role`, but exactly one `users` doc has `role:"admin"`, set by hand. `/analytics` renders for every account. For non-admins the `users` list is denied, the error is swallowed, and the 'User Email' column shows raw UIDs. For the admin it shows raw emails. | `priv-2` (Medium) |
| 1b | `allow update` constrains only the pre-write doc, so an owner can reassign a reading to another user | **FIXED** in source and deployed (`firestore.rules:130-134`). The guard admits the app's `deleted_user_<8-char prefix>` account-deletion rewrite. Residual risk: the `deleted_user_*` branch accepts any suffix and has no `affectedKeys()` limit. Production has 0 `deleted_user_*` docs. | `sec-3` (Medium) |
| 2 | `Quiet` is a brand-new `soundClass` value (18th category) that the dashboard has never seen | **Forward-compat gap only**: no `Quiet` doc exists in production yet. CategoryChart's colour and icon maps lack it, so it would render as a grey bar with a question-mark icon, indistinguishable from 'Other'. Every other surface treats it as a plain string. The dB-band "Quiet" name collision is latent, because the only code that returns that label (`themeConstants.getNoiseLevel()`) is never called. The larger present-day problem found next to it is `data-2`. | `data-3`, `data-2` |
| 3 | Deploy `--only firestore:rules,firestore:indexes`, never `--only storage` | **Stands.** Only the app repo can deploy; the dashboard has no `firebase.json`. The app's `firebase.json` still declares a storage target, so a bare `firebase deploy` hits the nonexistent bucket. The dashboard's Storage code is dead. No dashboard query needs a new composite index, none uses `>=`, and no proposed fix adds an index. | `build-2`, `arch-2`, `priv-3` |

## Requires a production check

Claude Code's auto-mode classifier blocks an agent's own Admin-SDK reads as "production reads", even with chat approval, so the owner runs the probes. Both are kept in `audit/tools/`. Each loads `serviceAccountKey.json` from the dashboard root by path without printing it, performs zero writes, and prints aggregates only. Each takes an output folder for its JSON:

```
node audit/tools/probe.cjs  <out-dir>    # P1-P7: deployed ruleset, admin role, field types, soundClass values (ran 2026-10-16)
node audit/tools/probe2.cjs <out-dir>    # P8 value ranges + P10 back-dated uploads (written after probe.cjs read the wrong dB field)
```

`audit/tools/dryrun_playbook.py` replays every BEFORE→AFTER of `playbook/01..12` in order against an in-memory copy of both repos. It never writes. On 2026-10-16 every anchor matched under both D1 branches, with 0 misses and 0 ambiguous matches, after five anchors were corrected: 06.3c, 06.3d, 10.4e, 10.4g (now three single-line edits) and the second 10.4o block. Each had been anchored on HEAD text that an earlier cluster rewrites. Re-run it after any spec edit: `python -I audit/tools/dryrun_playbook.py audit/playbook . ../noise_pollution_mapper` with `BRANCH=A` or `BRANCH=B`.

The owner already ran it once, on 2026-10-16 at about 00:20. That run **answered the deployed-ruleset and admin-role questions** (P1, P2) and P3-P7. The remaining rows are open. `03_CROSS_REPO_CONTRACT_AUDIT.md` section 5 has the exact read-only command for each.

| ID | Question | Status / answer | Settles |
|----|----------|-----------------|---------|
| P1 | Does the deployed Firestore ruleset equal the checked-in file? | **ANSWERED: equal.** Ruleset `ebff82af-152c-4626-a996-3e4e9f026a2c`, created 2026-09-09 16:38:07 GMT, matches both repos. Re-run before and after every rules deploy. | Known item 1, every rules finding |
| P2 | Is any admin provisioned (`users/{uid}.role == 'admin'`)? Any custom claims? | **ANSWERED: exactly 1 of 5** `users` docs; 0 custom claims; 7 Auth users, 2 of them with no `users` doc. | 1a, `priv-2`, `sec-4` |
| P3 | Which `soundClass` values exist; are `Quiet`, `Uncertain` or `soundCategory` present? | **ANSWERED:** 14 values. No `Quiet`, no `Uncertain`, no `soundCategory` field. | 2, `data-2`, `data-3` |
| P4 | Field presence and types | **ANSWERED:** `timestamp` is a Timestamp on all 3,374 docs. `createdAt` is on 602, and `soundClass`/`soundType`/`confidence` on 691. `userEmail`: 3,372 masked, 2 missing, 0 raw-looking. | `bug-8`, `data-2` |
| P5 | Any `deleted_user_*` docs? | **ANSWERED: 0.** | 1b, `sec-3`, `priv-1` |
| P6 | Does a Storage bucket exist? | **ANSWERED: no.** | 3, `priv-3`, `arch-2` |
| P7 | Which collections exist? | **ANSWERED:** `noise_readings` (3,374), `users` (5), `app_config` (1). There is no `cache` collection. | `arch-2` |
| P8 | Value ranges (dB, lat/lng, confidence, string lengths, future timestamps), needed before deploying `validReading()` | **OPEN.** The probe's `decibelRange` output (`nonFinite: 3374`) is a **probe bug**, not bad data: `probe.js:77` reads `decibel`, `decibels`, `dB`, `db` and `noiseLevel`, never `decibelLevel`. An extended probe is needed. | `sec-1`, `sec-3`, D3 |
| P9 | Are the `exportCacheDaily`/`exportCacheWeekly` functions deployed (and failing)? | **OPEN** (playbook step M2): `firebase functions:list --project noise-pollution-mapper-9ad3d`. | `priv-3`, `arch-2`, `build-5` |
| P10 | How many readings were uploaded back-dated? | **OPEN.** Count docs whose server `createTime` is more than 5 minutes after their `timestamp`. | `data-1` |
| P11 | Which dashboard browsers hold stale caches (deleted rows, pre-2026-09-09 raw emails)? | **OPEN.** This is browser-local and cannot be probed server-side. Inspect the `noise-pollution-db` IndexedDB database in each browser profile that has opened the dashboard. | `priv-1`, `priv-4` |
| P12 | What does the live Vercel deployment serve (security headers, `VITE_FIREBASE_*` set, API-key referrer restriction)? | **OPEN.** | `sec-5`, `build-3` |
| perf-1 | Is the project on Spark or Blaze? This sets the real cost and failure mode of `perf-1`. | **OPEN.** Check Console, then Usage and billing, or run `gcloud billing projects describe noise-pollution-mapper-9ad3d` (read-only; look at `billingEnabled`). If any function is listed in P9, the project is on Blaze. | `perf-1` |

## Document index

| Document | Scope |
|----------|-------|
| `00_MASTER_AUDIT_REPORT.md` | This report: statistics, verification results, top risks, handoff resolutions, production checks |
| `01_*` | Bugs and correctness |
| `02_*` | UI/UX |
| `03_CROSS_REPO_CONTRACT_AUDIT.md` | Cross-repo contract: the handoff items in full, the schema field by field, the query inventory, the Quiet/category inventory, production checks P1-P12 |
| `04_*` | Performance: Firestore read cost, rendering, bundle |
| `05_SECURITY_AUDIT.md` | Security and privacy: rules, access control, browser cache, exports, checked-and-refuted list |
| `06_*` | Architecture, code quality, build and deploy |
| `07_*` | Accessibility |
| `08_FIX_IMPLEMENTATION_PLAYBOOK.md` | Ordered fix playbook: 12 clusters, 48 commits, manual owner-gated steps M1-M3, owner decisions D1-D5, definition of done |
| `playbook/` | 12 per-cluster specs (`01_test_harness_ci.md` to `12_type_safety.md`) with exact BEFORE/AFTER blocks |

## Coverage

| Dimension | Raw findings | Files read |
|-----------|--------------|------------|
| security | 14 | 68 |
| data | 14 | 55 |
| correctness | 20 | 34 |
| ux | 37 | 50 |
| react | 27 | 61 |
| performance | 16 | 44 |
| build | 14 | 49 |
| **Total** | **142** | **361** (overlapping) |

- **Consolidation.** The dimensions overlapped by design. The 142 raw findings were merged into 65; for example, `sec-1` was reported by four dimensions and `data-1` by six agents across five dimensions.
- **Static baseline** (precomputed, not re-run; `CHECKS_DONE` present):
  - `tsc -b`: 0 errors.
  - eslint: 0 errors, 1 warning (an unused disable directive at `CacheStatus.tsx:57`).
  - `vite build`: OK in 7m25s. It produced one JS chunk of 1,422.67 kB (419.78 kB gzip) and 92.05 kB of CSS, with the ">500 kB" warning (`perf-5`).
  - No server-only markers were found in the built JS.
  - There are no tests and no CI (`test-1`).
- **Not covered.**
  - No live browser session was run. The UX, layout and contrast findings come from reading source and theme tokens, and every accessibility finding is unverified.
  - The rules were not exercised in the emulator.
  - The live Vercel deployment was not inspected (P12).
- **Not verified.** Medium and Low findings were not adversarially re-checked. Treat `unverified` as "re-read the cited lines before fixing".
- **Not re-audited.** The Flutter app's audit is closed. Issues it already covers are not re-reported unless the dashboard is independently affected.

## Appendix: Checked and refuted (do not re-report)

| Claim checked | Result | Basis |
|---------------|--------|-------|
| `/analytics` is silently dead (handoff item 1a) | **Refuted** | The page renders for every account; only its user column degrades (`priv-2`). See `03` section 1.2. |
| Stored XSS from Firestore fields | **Refuted** | No reading field reaches an HTML sink. Popups are react-leaflet `<Popup>` JSX (`NoiseMarkers.tsx:312-370`). The only `dangerouslySetInnerHTML` (`components/ui/chart.tsx:81`) is imported nowhere and takes static config. Hostile fields cause a crash (`sec-1`) or CSV injection (`sec-2`) instead. |
| The dashboard displays or exports raw `userEmail` | **Refuted** | `userEmail` appears nowhere in `src` and is not declared in `types/NoiseReading.ts`. Raw values exist only at rest in IndexedDB (`priv-1`). |
| A pending `serverTimestamp()` shows up as a null `timestamp` on the dashboard | **Refuted** | The dashboard never writes, and server snapshots never surface another client's pending writes. |
| Duplicate readings in the cache | **Refuted** | The store is keyed on doc id and `put()` upserts (`db.ts:27`). |
| A dashboard query needs a new composite index or uses `>=` | **Clean** | Every query is single-field (`timestamp >` or `orderBy('timestamp','desc')`, plus the `users` list). `fieldOverrides` is empty. |
| `SECURITY_ROTATION.md` key restriction breaks the dashboard | **Clean** | The dashboard uses the app's web key; the rotation restricts only the Android/iOS keys. |
| Secrets committed or bundled | **Clean** | `serviceAccountKey.json`, `.env` and `cache/` were never committed (`git log --all`), and the bundle has no server-only markers. |
| Deployed rules drift from source | **Clean** | The owner probe's ruleset matches both checked-in copies (P1). |
