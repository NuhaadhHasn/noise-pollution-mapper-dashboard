# Noise Pollution Mapper - Web Dashboard

A read-only web dashboard for the community noise readings collected by the
Noise Mapper Flutter app (sibling repo `noise_pollution_mapper`). It shows
overview statistics, a map of readings with a heatmap, and analytics with
sound-category and trend charts, and lets administrators export the data.

React 19, TypeScript (strict), Vite, Tailwind, Leaflet, Recharts and the
Firebase web SDK. It has no backend of its own: it signs in with the app's
Firebase Auth accounts and reads Firestore directly.

## What it does

- **Overview, map and analytics.** Stats cards, an OpenStreetMap map with
  clustered markers, date and user filters and a heatmap, and charts by sound
  category, sound type and time (weeks bucketed in Asia/Colombo).
- **Local cache.** Readings are synced into IndexedDB with a delta sync (only
  new or changed documents after the first load), so a returning visit is cheap
  on the free Firestore quota.
- **Read-only.** The dashboard never writes readings. The app is the only
  writer.
- **Privacy.** Authors are shown by the masked label the app stores, never a raw
  email. CSV and JSON export is limited to accounts whose own `users/{uid}`
  profile has `role == 'admin'`, and the cache is cleared on sign-out.
- **Accessible and resilient.** Keyboard-sortable tables, text summaries for
  charts, error boundaries, and a readable error page if the Firebase config is
  missing.

Decibel values are uncalibrated phone-microphone estimates, as the dashboard
states next to the figures.

## Getting started

Requires Node.js 22.

```bash
npm ci
cp .env.example .env.local   # then fill in the six VITE_FIREBASE_* values
npm run dev
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server |
| `npm run lint` | ESLint |
| `npx tsc -b` | Type-check (strict) |
| `npm test` | Unit tests (vitest) |
| `npm run test:rules` | Firestore rules suite on the local emulator (needs firebase-tools and Java 21; firebase-tools 14 also works with Java 20) |
| `npm run check:rules` | Verify `firestore.rules` matches the app repo's copy |
| `npm run build` | Type-check and build to `dist/` |

CI (`.github/workflows/ci.yml`) runs lint, type-check, tests and build, plus the
rules suite, on every push and pull request.

## Environment and deployment

The app needs six build-time variables, set in Vercel and in `.env.local`:
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` and
`VITE_FIREBASE_APP_ID`. If any is missing the app shows a configuration error
page instead of a blank screen.

A push to `master` deploys to production on Vercel. See
[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for the full procedure, the response
headers and the enforced Content-Security-Policy.

## Firestore security rules (shared with the mobile app)

This dashboard shares the Firebase project `noise-pollution-mapper-9ad3d` with
the Flutter app in the sibling repo `../noise_pollution_mapper`.

- The canonical rules are `noise_pollution_mapper/firestore.rules`. The
  `firestore.rules` in this repo is a mirror and must stay identical modulo
  line endings. Edit the app copy first, then mirror it from this repo with
  `tr -d '\r' < ../noise_pollution_mapper/firestore.rules > firestore.rules`.
- Check for drift with `npm run check:rules`. It expects the app repo at
  `../noise_pollution_mapper`; otherwise run
  `node scripts/check-rules-drift.mjs <path-to-app-repo>`. It exits non-zero
  on any difference.
- `npm run test:rules` exercises the rules in the emulator: every app writer
  must be allowed and the attack cases denied.
- Deploy rules only from the app repo, and only after the project owner has
  seen and approved the full rules diff:
  `firebase deploy --only firestore:rules,firestore:indexes`.
- The project has no Storage bucket, so neither repo declares a Storage target
  or keeps a `storage.rules`. Never run a bare `firebase deploy`; always name
  the targets. This repo has no `firebase.json` on purpose: never deploy rules
  from here.

## Audit

The 2026-10-16 audit and the fix playbook, with the shipping record, are in
[`audit/`](audit/00_MASTER_AUDIT_REPORT.md).
