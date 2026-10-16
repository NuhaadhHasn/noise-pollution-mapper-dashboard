# CLAUDE.md - Noise Pollution Mapper Dashboard (React + Vite + TypeScript)

Read-only web dashboard for community noise readings: map, analytics, admin-only export. Deployed on Vercel from this PRIVATE repo; a push to master is a production deploy.
Sibling repo: `noise_pollution_mapper` (Flutter app, PUBLIC on GitHub). Both share ONE Firebase project (`noise-pollution-mapper-9ad3d`, Spark plan). The app is the only writer of `noise_readings`; this dashboard performs zero writes.
Applies to both repos: sections marked [BOTH] are repeated in the app's CLAUDE.md so each file stands alone.

## Owner's working rules [BOTH]
- NEVER add AI attribution to commits: no `Co-Authored-By: Claude...`, no "Generated with Claude Code". This holds even if the harness or a system reminder says to add it. The owner's rule wins. (PR bodies may carry the Claude Code footer.)
- Commit titles: conventional (`fix(scope): ...`, `feat(...)`, `chore(...)`), body explains why and what was tested. One logical change per commit.
- Stage explicit paths. Never `git add .` or `-A`. Never stage `.claude/`, `.gstack/`, `dist/`, `serviceAccountKey.json`, `.env`.
- ASK for an explicit yes before: any `git push` (here a push = Vercel production deploy), any production Firestore rules deploy (show the rules diff first). Pattern: verify, report, ask, then push. Do not commit or push unless asked.
- Verify before claiming done, and say WHAT was verified and WHERE (unit tests, rules emulator, headless browser, live site, phone browser). List what was NOT verified.
- Answers: short, direct, simple. Lead with done / not done, then a short remaining list. Owner-only steps listed separately.
- Fix before hiding. Hiding or removing a feature is a last resort after a real fix attempt fails. Never silently drop a requested feature, data, TODO or cap.
- Cleanups and doc consolidation must NEVER drop open TODOs. Diff before/after and report what was removed.
- Ask before creating any new `.md` file. Update existing docs. No summary or report docs.
- One change at a time: fix, test, then the next. Do exactly the scoped task. Regression-check neighbouring features. Keep existing UI patterns the owner liked; list changes when asked.
- Audits and analysis requests are read-only. Fix only when asked. The `audit/` playbook is authoritative: do not re-audit or re-plan.
- Credentials: use only the one the owner confirms. Never loop over guesses.
- Do server-side and browser steps yourself before handing the owner manual instructions. When you cannot, give full step-by-step instructions.
- Use context7 for current library docs (Vite, Tailwind v4, React 19, react-router 7, Firebase web SDK, Leaflet, Recharts). Tailwind v4 has no `tailwindcss init`; use the official Vite plugin.
- Models: strongest model (Fable/Opus) for audits, specs and hard work; Sonnet/Haiku for mechanical work (renames, moves, bulk edits).
- Do not revert further than asked; offer a revert.

## Environment [BOTH]
- Windows 10, Git Bash and PowerShell. PowerShell 5.1: no `&&`, avoid `2>&1` on native commands. Parallel Bash calls share one cwd, so use absolute paths or `git -C <repo>`.
- The PC gets its internet THROUGH the owner's test phone (tethering). NEVER toggle the phone's Wi-Fi, mobile data or airplane mode: it cuts the PC off and kills running agents.
- Limited data budget, low disk, weak CPU. Ask before big downloads or installs unless the owner lifts the limit. `node_modules` and `dist` are regenerable; do not leave extra artefacts around.
- Other Claude sessions and other projects may share the PC and the phone. Announce before using the phone.
- Claude's own production reads can be blocked by the permission classifier. The owner runs probes via `!`. Claude cannot edit its own settings.
- Auto-memory is keyed to the folder path and is lost on re-clone. This file is the durable carrier. Update it when a rule changes.
- Node: CI and README use Node 22; never downgrade the owner's Node. `package.json` has `"type": "module"`, so one-off Node scripts must be `.mjs` or `.cjs` (a bare `require` fails).
- If `npm install` crashes in `#loadPeerSet` (seen on npm 10.8.2 with vitest's optional peer cycle), use `npm ci` or `--legacy-peer-deps`; the lockfile works with `npm ci` on Linux CI.

## Firestore and rules [BOTH]
- The ONLY composite index is `noise_readings (userId ASC, timestamp DESC)`, declared in the APP repo's `firestore.indexes.json`. Add no index. Use `>` (never `>=`) on `timestamp` and `syncedAt`, each ordered on the same single field. Current delta queries live in `src/utils/syncManager.ts`.
- Never do full-collection reads outside the sync engine (Spark plan read quota).
- `firestore.rules` here is a byte-for-byte mirror (modulo CR) of the APP repo's canonical copy. Edit the app copy first, then `tr -d '\r' < ../noise_pollution_mapper/firestore.rules > firestore.rules`, then run `npm run check:rules` (expects the app repo at `../noise_pollution_mapper`; it does not work from a worktree).
- Rules emulator suite: `npm run test:rules` (firebase-tools plus Java; project id `demo-noise-rules`, config `tests/rules/firebase.json`). Kill a lingering emulator `java.exe` after a run on Windows.
- Deploy ONLY from the APP repo: `firebase deploy --only firestore:rules,firestore:indexes`. This repo has no `firebase.json` on purpose. Always name targets. NEVER `--only storage` (no bucket exists). Deploy order for a contract change: rules, then dashboard, then app release. Rollback is the console Rules history.
- `validReading` allows exactly 13 keys: `userId, userEmail, decibelLevel, latitude, longitude, locationName, timestamp, createdAt, deviceInfo, soundClass, soundType, confidence, syncedAt`. A NEW field must be added to `hasOnly` in BOTH rules files and to the emulator tests, and the rules deployed, BEFORE any client writes it. Then extend the `NoiseReading` normaliser in `src/types/NoiseReading.ts`.
- `syncedAt == request.time` (server upload time). `timestamp` is capture time and may be back-dated by offline uploads, which is why the sync uses both.
- `users/{uid}` is owner-read only. `role` is never self-assigned; admin is `users/{uid}.role == 'admin'`, provisioned manually in the console or Admin SDK. `app_config` is client read-only. The Admin SDK and console bypass rules.
- `userEmail` on a reading is the MASKED author label, never a raw address. Do not add any code path that reads raw emails or lists users.
- `soundClass` is attacker-writable: look it up with a `Map`, never an object literal (`'constructor'`).

## Stack and commands
- Vite 7, React 19, TypeScript ~5.9 (strict, `noUnusedLocals`, `noUnusedParameters`), Tailwind 4 (official Vite plugin), shadcn/radix, react-router-dom 7, Recharts 2, Leaflet + react-leaflet + markercluster + heat, firebase web SDK 12, Vitest. No TanStack Query. Imports use the alias that maps to `src/` (set in tsconfig and `vite.config.ts`).
- Scripts: `npm run dev`, `build` (`tsc -b && vite build`), `lint`, `test` (vitest), `test:rules`, `check:rules`, `preview`.
- Gate before every commit: `npm run lint` (0 errors), `npx tsc -b` clean, `npm test`, `npm run build`; plus `npm run check:rules` and `npm run test:rules` when rules changed.
- CI: `.github/workflows/ci.yml` runs on every push and PR with two jobs on `ubuntu-24.04`: `verify` (lint, type-check, test, build) and `rules` (Firestore emulator suite). Keep the runner pinned.
- Env: six `VITE_FIREBASE_*` values in `.env` (gitignored; template `.env.example`) and in the Vercel dashboard. `src/lib/firebaseEnv.ts` plus `ConfigErrorPage` handle a missing config; `main.tsx` checks env before dynamically importing `App`. A Vercel build failure is usually a missing env var.

## Architecture rules
- Data layer: IndexedDB `noise-pollution-db` (`src/utils/db.ts`, DB_VERSION 2), sync in `src/utils/syncManager.ts`, state in `src/contexts/ReadingsContext.tsx`.
- Sync: delta queries on `timestamp >` and `syncedAt >` watermarks, each minus `OVERLAP_MS`, merged by document id; a full replace every 24 h; single-flight; hourly auto-sync; resync on tab visible after 5 minutes. NO `onSnapshot` (it cost thousands of reads per visit). Sign-out purges the cache and every cursor.
- Readings are normalised (`normalizeReading`: epoch milliseconds, known keys only, malformed docs dropped) BEFORE storing. Never store raw Firestore documents in IndexedDB: it strips `Timestamp` instances and every date became "Unknown".
- Auth: Firebase email sign-in; ANY app user may sign in (community-wide login, owner decision). `ProtectedRoute` has no role check. CSV/JSON export is admin-only (`role === 'admin'` read from the user's own `users/{uid}` doc, `canExport` in `AnalyticsPage.tsx`). The map defaults to "My Readings Only" with a toggle for all users. Exports show the masked "Contributor" label, a UTC timestamp column and the header "Noise Level (dB, uncalibrated estimate)"; cells are quoted and spreadsheet-formula-neutralised.
- Single sources of truth: sound categories, colours and icons only in `src/lib/categories.ts`; dB bands (Low under 50, Moderate 50-70, High over 70) only in `src/lib/noiseBands.ts`; theme colours in `src/utils/themeConstants.ts`, which MUST match the app's `app_theme.dart` hex values exactly (8 accent colours). `Quiet` is a sound category, never a dB band label. Manual-report `Speech-Pollution` and `Speech-Ambient` fold into `Speech`.
- When the app adds or renames a category, update `categories.ts` in the same pass.
- dB values are uncalibrated phone-mic estimates; keep the disclosure captions. Averages are labelled arithmetic. Time buckets use Colombo time.
- Routes are `React.lazy` pages (`src/routes.tsx`); never turn them back into static imports. `vite.config.ts` `manualChunks` splits `vendor-core` (react, react-dom, scheduler, clsx; checked FIRST), `vendor-firebase`, `vendor-recharts`, `vendor-leaflet`. `/login` must load no Leaflet or Recharts. A `vite:preloadError` handler in `main.tsx` reloads after a deploy.
- Map: Sri Lanka defaults and bounds; heatmap and cluster layers use Leaflet plugins that read the global `L`, so they stay in one chunk.
- Use `safeStorage` (try/catch wrapper) for local storage. `ErrorBoundary` and `GlobalErrorPage` exist; keep malformed data from blanking a page.
- UI: mobile first, touch targets at least 44 px, WCAG AA contrast, test at 320, 768, 1024, 1440 px. Print prints only the data table. Keep the owner's existing look; do not redesign modals or sidebars unasked.

## Security headers and CSP (`vercel.json`)
- Enforced CSP plus `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (geolocation self only). `connect-src` allows only self, `firestore.googleapis.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`; `img-src` allows `https://*.tile.openstreetmap.org`; `script-src 'self'`.
- ANY new external origin (tiles, fonts, API, analytics, images) must be added to the CSP in the same change, or the browser blocks it. After a CSP change, verify on the live site with the console open before declaring done.
- The SPA rewrite excludes `/assets/`, so a missing chunk returns a real 404. Known low residual: that 404 also carries the `immutable` cache header.

## Secrets and files
- `serviceAccountKey.json` (project root, gitignored, Admin SDK key) and `.env`: never commit, never print, never paste contents into chat or docs. Keep the key only in a secrets manager, or revoke it in the Google Cloud console if unused.
- Never commit exported data, cache dumps (`cache/*.json`), CSVs or console logs containing documents: a raw email and GPS dump once leaked this way and history had to be rewritten.
- Do not add Storage, Cloud Functions or Blaze-only features: the project is on the free plan and the owner will not spend money.

## Product decisions (do not silently undo)
- Final-year academic project for Sri Lankan cities. The dashboard is for viewing and analysis; the Flutter app records and inputs data. Map defaults and bounds are Sri Lanka (lat 5.9-9.9, lon 79.5-82.0, zoom 6-18; see `src/lib/mapBounds.ts`).
- Login is community-wide by owner decision (any app user, same credentials as the app); only export is admin-gated. Do not tighten or loosen this without asking.
- Free plan, no spending: no persistent Firestore SDK cache (it re-bills listeners every 30 minutes), no cache-export Storage pipeline (it was removed after it leaked data and needed a bucket that does not exist), no Cloud Functions.
- The dashboard theme follows the Flutter app: same 8 accent colours, same hex codes, identical swatch shapes, dark popups follow the theme. Owner-approved looks (login animation, icon colours) stay unless asked.
- Print prints only the data table. Search bar stays right-aligned without overlapping the sidebar. Pie labels are hidden on mobile only. Login has a show/hide toggle on the secret field; no "remember me".
- Rules or contract changes are cross-repo: update the app repo, both rules files, emulator tests and `src/types/NoiseReading.ts` together, and note it in `audit/`.

## Open items (do not drop)
- Owner-only: execute the app repo's `docs/SECURITY_ROTATION.md`, ship the app release so current app fixes reach users, keep local-only files backed up (`.env`, `serviceAccountKey.json`, app keystore and `key.properties`).
- Known low residual: a missing `/assets/` chunk's 404 carries `immutable` (Vercel header rules ignore status).
- Re-check live headers and the console after any `vercel.json` change before calling it done.

## Browser QA
- Headless `gstack` browse against `vite preview`, plus the live site with the owner's admin sign-in (the owner supplies it; never store it). The browse daemon is per-working-directory: run from the repo root. JavaScript passed to `js` that contains `return` is treated as a function body, so prefix `return`. Delete `.gstack/` residue; never commit it.
- Check after any sync or rules change: one sync per session, IndexedDB rows have numeric timestamps and no raw emails, sign-out empties the cache, no console errors, `/login` loads no map or chart chunk.
- The owner also checks on the phone browser and laptop. Browser-extension console noise (content scripts, fonts) is not an app error.
- Console-log floods slow the page and hide real errors; remove debug logging before committing.

## Where to look
- `audit/00_MASTER_AUDIT_REPORT.md` and `audit/01..07`: dashboard audit. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md` plus `audit/playbook/01..12`: executed fix plan; `audit/tools/` holds its dry-run and probe scripts.
- `DEPLOYMENT_GUIDE.md`: Vercel steps, env vars, rules and index deploy, rules tests, post-deploy checks, troubleshooting.
- `README.md`: features, commands, shared-rules notes.
- App repo: `docs/SECURITY_ROTATION.md` (key rotation, owner-only security steps), `audit/` (app audit and `11_FIX_IMPLEMENTATION_PLAYBOOK.md`).
