# Deployment Guide

How to build, test and deploy the Urban Noise Pollution Mapper web dashboard.

The dashboard is a static Vite + React single-page app. It is **read-only**: it
signs users in with Firebase Auth and reads `noise_readings` (and the signed-in
user's own `users/{uid}` profile) from Firestore. It never writes readings. It
has no backend, no Cloud Functions and no Storage.

It shares the Firebase project `noise-pollution-mapper-9ad3d` with the Flutter
app in the sibling repo `noise_pollution_mapper`.

## Deploying to Vercel

Vercel is connected to this GitHub repo.

- **A push to `master` is a production deploy.** Other branches and pull
  requests get preview deploys.
- Build settings come from `vercel.json`, so there is nothing to configure in
  the dashboard apart from environment variables:
  - build command: `npm run build` (which runs `tsc -b && vite build`)
  - output directory: `dist`
  - framework: Vite
- Routing: every path except `/assets/...` is rewritten to `/index.html`, so
  client-side routes work on refresh. Excluding `/assets/` matters: a missing
  hashed chunk must return a 404, not `index.html`, so the app can detect a
  stale tab and reload (see `dad3004`).
- `vercel.json` also sets the response headers: `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, an
  immutable one-year cache for `/assets/*`, and an **enforced**
  `Content-Security-Policy`.
- The CSP allows scripts from `'self'` only, OpenStreetMap tile images, and
  connections to `firestore.googleapis.com`, `identitytoolkit.googleapis.com`
  and `securetoken.googleapis.com`. If you add a new third-party origin (a tile
  provider, an analytics script, another Google API), add it to the CSP in
  `vercel.json` or the browser will block it. Check the browser console for
  `Content-Security-Policy` violations after any such change.

Run the checks below before pushing to `master`. CI (`.github/workflows/ci.yml`)
repeats them on every push and pull request: lint, type-check, unit tests and
build, plus the rules suite on the emulator.

## Environment variables

Set these in Vercel under Project Settings, Environment Variables (Production
and Preview). They are public web config, not secrets, but keep the values out
of the repo. Copy `.env.example` to `.env.local` for local work; `.env*` files
are git-ignored.

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Find the values in Firebase Console, Project settings, Your apps, Web app.

Vite inlines `VITE_*` variables **at build time**, so changing one in Vercel
only takes effect after a redeploy. If any of the six is missing or blank, the
build still succeeds, but the app shows a readable "configuration error" page
that lists the missing variable names (never values) instead of a blank screen.
That page after a deploy means a variable is unset for that environment.

`VITE_FIREBASE_STORAGE_BUCKET` is required by the config check even though the
project has no Storage bucket in use; any non-blank value satisfies it.

## Local development

Requires Node.js 22 (what CI uses).

```bash
npm ci               # install exactly what package-lock.json says
npm run dev          # Vite dev server with HMR
npm run lint         # eslint
npx tsc -b           # type-check (strict mode, no unused locals or parameters)
npm test             # vitest unit tests
npm run build        # tsc -b && vite build, output in dist/
npm run preview      # serve dist/ locally
```

## Firestore rules tests

```bash
npm run test:rules
```

This runs `tests/rules/firestore.rules.test.ts` against the local Firestore
emulator under the `demo-noise-rules` project, so it needs no credentials and
touches no real project. It needs `firebase-tools` installed and Java:

- firebase-tools 14 (what CI pins, 14.27.0) works with Java 20 or newer but
  prints a warning below Java 21.
- Future firebase-tools versions require **Java 21**. Use Java 21.

## Firestore rules and indexes

The rules are owned by the **app repo**.

- The canonical file is `noise_pollution_mapper/firestore.rules`. The
  `firestore.rules` in this repo is a mirror and must stay identical modulo line
  endings.
- Edit the app copy first, then mirror it:
  `tr -d '\r' < ../noise_pollution_mapper/firestore.rules > firestore.rules`.
- `npm run check:rules` compares the two copies (it expects the app repo at
  `../noise_pollution_mapper`, or run
  `node scripts/check-rules-drift.mjs <path-to-app-repo>`) and exits non-zero on
  any difference.
- **Deploy only from the app repo**, and only after the owner has seen the
  rules diff:

  ```bash
  firebase deploy --only firestore:rules,firestore:indexes
  ```

  This repo has no `firebase.json` of its own on purpose. Never run a bare
  `firebase deploy`; always name the targets.
- **Never** deploy `--only storage`. The project has no Storage bucket and
  neither repo declares a storage target or `storage.rules`.
- The only composite index is `noise_readings (userId ASC, timestamp DESC)`,
  declared in the app repo's `firestore.indexes.json` and used by the app. The
  dashboard's queries (`orderBy('timestamp')` and a `timestamp >` delta) are
  single-field and need no composite index. Keep it that way: do not add a
  second composite index without checking with the owner.

The dashboard is read-only, so deploying a rules change never needs a dashboard
redeploy, but rules that tighten reads can break it. Run `npm run test:rules`
and open the dashboard once after any rules deploy.

## After a deploy

1. Open the production URL and check the build in Vercel, Deployments.
2. Sign in, and confirm the dashboard, map, analytics and data table load.
3. Open the browser console: there should be no Content-Security-Policy
   violations and no Firestore `permission-denied` errors.
4. If a tab opened before the deploy shows a "failed to load" error, it is a
   stale chunk; a reload fixes it and the app does this automatically once.

## Troubleshooting

- **Configuration error page:** an environment variable is missing; see above.
- **Blank map tiles:** the CSP blocks tile hosts other than
  `*.tile.openstreetmap.org`.
- **`permission-denied` on readings:** the signed-in account lacks access under
  the deployed rules, or the deployed rules differ from the repo copy. Compare
  with `npm run check:rules` and the Firebase Console rules tab.
- **Build fails on Vercel but not locally:** run `npm ci` (not `npm install`)
  and `npm run build` locally; the type-check (`tsc -b`) is part of the build.
