# Playbook 02 — Firestore Rules Hardening (cross-repo APP+DASH)

Implementation spec for the defect cluster covering the unvalidated `noise_readings` write path (any registrant can poison every dashboard), the unpinned `deleted_user_*` rewrite, the admin-only `users` list that joins raw registration emails to GPS, and the missing guard against the two `firestore.rules` copies drifting apart.

**Execute steps in order. Each step is exactly one commit. Exception (master §1.2): a step tagged [APP+DASH] (Steps 2–4) makes exactly ONE commit in EACH repo with the identical title: `APP:firestore.rules` first, then its byte-mirror in DASH. Gate every DASH commit on `npx tsc -b` (0 errors) and `npx eslint <the JS/TS files the step changed>` (0 errors, no new warnings). Run `npm test` and `npm run build` ONCE, at the end of Step 4 (master §1.3). The rules deploy is MANUAL action M1, after Step 4, and is never a commit.**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (DASH HEAD `353bbdd`, APP HEAD `9b08e68`; re-checked unchanged on 2026-10-16). If a BEFORE block does not match, STOP and re-read the file, then check master §4 — do not guess. Match on exact text, never on line numbers. Every `firestore.rules` BEFORE block is quoted from `APP:firestore.rules` (the edit target). It matches `APP:firestore.rules` modulo CR, and `firestore.rules` (DASH) exactly. The line numbers are the same in both files.

Environment facts (verified):
- DASH `package.json`: `"type": "module"`, `react ^19.2.0`, `vite ^7.3.1`, `typescript ~5.9.3`, `eslint ^9.39.1`, `firebase ^12.10.0`. The `scripts` block at HEAD is `dev`/`build`/`lint`/`preview` (`package.json:6-11`). Cluster 01 step 01.1 appends `"test": "vitest run"` after `preview` before this cluster runs.
- Node `v20.20.0` locally (`node --version`), npm `10.8.2`. The drift script uses only `node:fs`, `node:path` and `node:url` built-ins, with no dependency. `package-lock.json` does not change in this cluster.
- `eslint.config.js` lints only `**/*.{ts,tsx}`. A `.mjs` file falls under ESLint 9's default file patterns but gets no rules, so `npx eslint scripts/check-rules-drift.mjs` reports 0 problems. `tsconfig.node.json` includes only `vite.config.ts`, so `tsc -b` never sees the script.
- Line endings (`git ls-files -s --eol`): `APP:firestore.rules` is `i/lf w/crlf`. `firestore.rules` (DASH) is `i/lf w/lf`. Both repos commit the SAME blob, `04bd418ecae9b13618b521c3e87e6f33fb0a64ba`. `storage.rules` is `d771f5c15585d6426ccab56ebc21aea3f9e94246` in both repos. `core.autocrlf=true` in both repos. Comparing `tr -d '\r'` of each pair gives identical text today.
- The deployed ruleset is `ebff82af-152c-4626-a996-3e4e9f026a2c` (created 2026-09-09 16:38 GMT). It equals `APP:firestore.rules` at `9b08e68` (owner probe, 2026-10-16). Only `APP:firebase.json` wires rules to a deploy (`"firestore": {"rules": "firestore.rules", "indexes": "firestore.indexes.json"}`), and it ALSO declares a `storage` target. The project has no Storage bucket, so deploy ONLY with `--only firestore:rules,firestore:indexes`. DASH has no `firebase.json`.
- `APP:firestore.indexes.json` holds exactly one index, `noise_readings (userId ASC, timestamp DESC)`. This cluster does not touch it.
- firebase-tools `14.27.0` is installed globally (version read from its `package.json`), and `firebase deploy --dry-run` exists in it. Java `20.0.1` is installed. firebase-tools 14.27.0 declares `MIN_SUPPORTED_JAVA_MAJOR_VERSION = 21` (`lib/emulator/commandUtils.js:387`), so the emulator may warn or refuse. The permanent emulator suite is master §7; this cluster does not depend on it.
- Rules language features used, all valid under `rules_version = '2'`:
  - `Map.keys()` with `List.hasOnly()`;
  - `Map.get(key, default)`;
  - `MapDiff.affectedKeys()` with `Set.hasOnly()`;
  - `duration.value(1, 'd')`, and `timestamp + duration`;
  - the string range `request.auth.uid[0:8]` (Firebase uids are 28 characters);
  - `is number` / `is string` / `is timestamp`, and `x in [list]`.
  
  None of the new clauses calls `get()` or `exists()`, so they add no billed document reads.
- Production shape (owner probe, 2026-10-16):
  - `noise_readings` holds 3,374 docs. They use exactly the 12 keys `userId`, `userEmail`, `decibelLevel`, `latitude`, `longitude`, `locationName`, `timestamp`, `createdAt`, `deviceInfo`, `soundClass`, `soundType`, `confidence`.
  - `timestamp` is a Timestamp on all 3,374. `createdAt` (a Timestamp) is on 602.
  - `soundClass`/`soundType`/`confidence` are on 691, with `soundType` only `Ambient`/`Pollution`.
  - `userEmail` is a string on 3,372 and missing on 2.
  - There are 0 `deleted_user_*` docs.
  - `users`: 5 docs, exactly 1 with `role:"admin"`.
  - Value RANGES are not probed yet (P8 is open: `audit/03_CROSS_REPO_CONTRACT_AUDIT.md` §5). See the pre-M1 gate.
- Owner decisions used: D3 (validation strictness; defaults below) and D1 (02.4 applies under both A and B). Settle both before commit #1 (master §3.4).

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| sec-1 | CONFIRMED (High) — rules half only | `firestore.rules:106-108` create and `:130-134` update check only `userId`. No type, range, size or key validation exists, and signup is open. One doc with a map-typed `soundClass` makes `CategoryChart.tsx:220` throw, which blanks `/dashboard` and `/analytics` for every viewer (no error boundary). Step 2 adds `validReading()` on create and on same-userId updates. The render-side halves are cluster 04.3 (`normalizeReading`) and cluster 08.2 (error boundaries). |
| sec-3 | UNVERIFIED (Medium); rules text and app writer re-read for this spec | `firestore.rules:133-134` admits any `deleted_user_*` suffix, with no `affectedKeys()` limit. An owner can file a reading under another user's deleted-account bucket or mint arbitrary ids, and rewrite dB, time and position in the same write. The doc can then never be updated or deleted by a client. Step 3 pins the rewrite to exactly what `APP:lib/screens/settings_screen_enhanced.dart:970-973` writes. |
| priv-2 | PARTIAL (Medium) — rules half only | `firestore.rules:157` `allow read: if isOwner(userId) \|\| isAdmin();` lets the one admin list every `users` profile, i.e. raw registration emails. `/analytics` joins those to exact GPS in the table and CSV (`userService.ts:17-24`, `DataTable.tsx:282`, `exportHelpers.ts:77`). Step 4 makes profiles owner-read only and deletes `isAdmin()`. The dashboard half (show the masked label, delete `userService.ts`) is cluster 07.2. |
| test-1 | CONFIRMED (Medium) — drift-guard half only | The only thing keeping the two rules copies in sync is a header comment (`firestore.rules:13-16`), and a naive `cmp` would false-alarm forever on CRLF vs LF. Step 1 adds `scripts/check-rules-drift.mjs` (CR-insensitive), `npm run check:rules` and a README note. The test runner and CI half is cluster 01. |

Full finding text and verifier evidence: grep the IDs in `audit/00_MASTER_AUDIT_REPORT.md`, `audit/05_SECURITY_AUDIT.md`, `audit/03_CROSS_REPO_CONTRACT_AUDIT.md` and `audit/06_ARCHITECTURE_AND_CODE_QUALITY.md`.

---

## Pre-reading

Open these files before touching anything:

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md`:
   - §1.2 and §1.4: the [APP+DASH] commit rule and the APP gates;
   - §2.1–§2.3 and §2.6;
   - §3.4: D1 and D3;
   - **§4.1, the writer-compatibility matrix.** Every row must still pass;
   - §4.2: the mirror and deploy procedure;
   - §4.15: push timing;
   - §5: #3–#6 and M1;
   - §6.3 and §6.7.
2. `APP:firestore.rules` — the whole file (209 lines, CRLF). `firestore.rules` (DASH) is the same text with LF.
3. `APP:lib/services/firebase_service.dart`:
   - `authorLabel()` (lines 27-38): the displayName, or a masked email, never null;
   - online `_saveToFirebase` (149-182): `.add(data)` with `timestamp: FieldValue.serverTimestamp()`. `soundClass`/`soundType`/`confidence` are added only when non-null;
   - `_saveOffline` (185-219);
   - `deleteNoiseReading` / `restoreNoiseReading` (299-309).
4. `APP:lib/services/sync_service.dart` — `_saveToFirebase` (304-339):
   - `timestamp` is the CAPTURE time (`:319`);
   - `userEmail` may be **null** (`:308`);
   - the deterministic-id `set()` (`:338`) is a create the first time, and an UPDATE on a retry after a lost ack.
5. `APP:lib/services/profile_sync_service.dart`, lines 35-92:
   - the owner `get` (`:42-43`);
   - the profile `set(merge:true)` (`:55-59`);
   - the email-only `batch.update(ref, {'userEmail': authorDisplay})` (`:77-81`).
6. `APP:lib/screens/settings_screen_enhanced.dart`:
   - the anonymization batch (`:957-975`), which writes exactly `{'userEmail': 'Deleted User', 'userId': 'deleted_user_${uid.substring(0, 8)}'}`;
   - the clear-history batch delete (`:1100-1114`).
7. `APP:lib/screens/history_screen.dart`, `_deleteRecording` / `_undoDelete` (774-815). Undo re-writes the deleted doc's `data()` with `set()`, which lands as a create.
8. Value sources:
   - `APP:lib/screens/report_noise_screen.dart`:
     - the picker options (`:37-55`), whose `type` is only `'Pollution'`/`'Ambient'`;
     - the dB slider, 0–120 (`:333-336`);
     - `confidence: 1.0` (`:231`).
   - `APP:lib/screens/dashboard_screen.dart`:
     - live dB clamped to 0–120 (`:526`);
     - only above-threshold classification is written (`:651-669`).
9. Profile writers:
   - `APP:lib/screens/registration_screen.dart:56-74`;
   - `APP:lib/screens/edit_profile_screen.dart:85-95`.
   
   The name field has only a minimum-length validator (`registration_screen.dart:230`, `edit_profile_screen.dart:272`). See Risks.
10. DASH files:
    - `package.json` (56 lines);
    - `README.md` (73 lines; still the Vite template);
    - `src/services/userService.ts:13-33`, the only `users` list. It loses access at M1; see Risks.
11. `audit/03_CROSS_REPO_CONTRACT_AUDIT.md` §5, row P8 (the read-only value-range probe).

---

## Steps

### Step 1 — test-1: Rules drift check (DASH only)

**Goal:** One command proves that `firestore.rules` and `storage.rules` are identical in both repos modulo CR. It fails loudly, naming the file and the first differing line, on any real difference. `package.json` exposes it as `npm run check:rules`, and the README documents where the canonical rules live and how to deploy them. The check passes on the current trees.

**Files:**
- `scripts/check-rules-drift.mjs` (new)
- `package.json` (modified: `scripts`)
- `README.md` (modified: new section)

**Exact changes**

1a. New file `scripts/check-rules-drift.mjs`, with these full contents (LF line endings):
```js
// Rules drift check (dashboard audit test-1).
//
// APP:firestore.rules (the sibling noise_pollution_mapper repo) is the
// canonical, deployed ruleset; this repo keeps a byte-identical mirror of it
// and of storage.rules. The APP working tree is CRLF and this one is LF
// (core.autocrlf=true; both index blobs are LF), so each pair is compared
// after stripping every '\r'. A plain cmp would report drift forever.
//
// Usage:  node scripts/check-rules-drift.mjs <path-to-noise_pollution_mapper>
//         npm run check:rules
// Exit:   0 = every pair identical modulo CR
//         1 = a pair differs, or a file is missing or unreadable
//         2 = bad usage (no APP path given)

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES_FILES = ['firestore.rules', 'storage.rules'];

function readWithoutCr(path) {
  return readFileSync(path, 'utf8').replace(/\r/g, '');
}

function main(appArg) {
  if (!appArg) {
    console.error(
      'Usage: node scripts/check-rules-drift.mjs <path-to-noise_pollution_mapper>',
    );
    return 2;
  }

  const dashRoot = fileURLToPath(new URL('..', import.meta.url));
  const appRoot = resolve(appArg);
  let drift = false;

  for (const name of RULES_FILES) {
    const appPath = join(appRoot, name);
    const dashPath = join(dashRoot, name);

    let appText;
    let dashText;
    try {
      appText = readWithoutCr(appPath);
      dashText = readWithoutCr(dashPath);
    } catch (error) {
      console.error(`ERROR ${name}: ${error.message}`);
      drift = true;
      continue;
    }

    if (appText === dashText) {
      console.log(`OK    ${name} (identical modulo CR)`);
      continue;
    }

    drift = true;
    const appLines = appText.split('\n');
    const dashLines = dashText.split('\n');
    let i = 0;
    while (appLines[i] === dashLines[i]) i += 1;
    console.error(`DRIFT ${name}: first difference at line ${i + 1}`);
    console.error(`  APP : ${appLines[i] ?? '<end of file>'}`);
    console.error(`  DASH: ${dashLines[i] ?? '<end of file>'}`);
  }

  if (drift) {
    console.error(
      'Rules copies differ. Edit APP:firestore.rules first, then mirror it ' +
        "from this repo with: tr -d '\\r' < ../noise_pollution_mapper/firestore.rules > firestore.rules",
    );
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv[2]);
```

Placement note: `scripts/` already holds `export-cache.js`, `export-cache-to-firestore.js` and `upload-cache.sh`. Leave them alone; master §7 reviews them later. The script uses `process.exitCode` rather than `process.exit()` so that piped stderr is never cut off.

1b. `package.json` — add the `check:rules` script.

BEFORE (`package.json`, lines 8-9, verbatim):
```json
    "build": "tsc -b && vite build",
    "lint": "eslint .",
```

AFTER:
```json
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "check:rules": "node scripts/check-rules-drift.mjs ../noise_pollution_mapper",
```

Placement note: this anchor is deliberately the `build` and `lint` lines. Cluster 01 step 01.1 does not touch them: it only turns `"preview": "vite preview"` into `"preview": "vite preview",` and appends `"test": "vitest run"`. So the block matches verbatim whether or not 01.1 has run, and the comma bookkeeping of 01.1's last entry is never touched. The result is valid JSON either way, with `check:rules` between `lint` and `preview`. This supersedes the "add it after `test`" suggestion in `01_test_harness_ci.md` 1b (master §4.12 only requires that the script lands in the post-01 `scripts` block). Hand-edit the file; do NOT run `npm install` (no dependency changes, so `package-lock.json` must stay unchanged).

1c. `README.md` — add a rules section under the intro paragraph.

BEFORE (`README.md`, lines 1-3, verbatim):
```md
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.
```

AFTER:
```md
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Firestore security rules (shared with the mobile app)

This dashboard shares the Firebase project `noise-pollution-mapper-9ad3d` with
the Flutter app in the sibling repo `../noise_pollution_mapper`.

- The canonical rules are `noise_pollution_mapper/firestore.rules`. The
  `firestore.rules` and `storage.rules` in this repo are mirrors and must stay
  identical modulo line endings. Edit the app copy first, then mirror it from
  this repo with `tr -d '\r' < ../noise_pollution_mapper/firestore.rules > firestore.rules`.
- Check for drift with `npm run check:rules`. It expects the app repo at
  `../noise_pollution_mapper`; otherwise run
  `node scripts/check-rules-drift.mjs <path-to-app-repo>`. It exits non-zero
  on any difference.
- Deploy rules only from the app repo, and only after the project owner has
  seen and approved the full rules diff:
  `firebase deploy --only firestore:rules,firestore:indexes`.
- Never run `firebase deploy --only storage` (the project has no Storage
  bucket, so that target fails), and never a bare `firebase deploy`. This repo
  has no `firebase.json` on purpose: never deploy rules from here.
```

Placement note: the rest of the README (the Vite template text from line 5 on) stays byte-identical.

**Edge cases to preserve**
- CR-only differences must pass. A UTF-8 BOM, trailing whitespace or a missing final newline are real byte differences and must FAIL. The deploy uploads the bytes, and the blob ids would differ.
- The DASH root is resolved from the script's own location (`import.meta.url`), and the APP path from the current directory. `npm run check:rules` runs from the DASH root, so `../noise_pollution_mapper` resolves to the sibling repo.
- A missing APP path or missing file is reported as `ERROR <file>: ENOENT ...` with exit 1. It is never silently treated as a pass.
- The script prints rules lines only, which are not secret. It reads nothing else. It never touches `serviceAccountKey.json` or `.env`.

**Acceptance criteria**
- On the current trees, `npm run check:rules` prints `OK    firestore.rules (identical modulo CR)` and `OK    storage.rules (identical modulo CR)`, and exits 0.
- A CRLF copy of both files passes. A copy with one appended line fails with exit 1, naming `firestore.rules` and the line number. A nonexistent APP path exits 1. No argument exits 2.
- After `git add README.md package.json scripts/check-rules-drift.mjs`, `git diff --cached --name-only` lists exactly those three paths. `package-lock.json` is unchanged. Never stage the untracked `DEPLOYMENT_GUIDE.md`, `SESSION_39_SUMMARY.md` or `audit/`, and never stage `serviceAccountKey.json`.

**Verify**
```
npx tsc -b                                         # 0 errors (no TS touched; master §1.3 gate)
npx eslint scripts/check-rules-drift.mjs           # 0 problems
npm run check:rules                                # two OK lines, exit 0
```
Negative tests (Git Bash, from DASH; the temp dir is outside both repos):
```
T="$(mktemp -d)"
cp firestore.rules storage.rules "$T"/
sed -i 's/$/\r/' "$T"/firestore.rules "$T"/storage.rules
node scripts/check-rules-drift.mjs "$T"; echo "exit=$?"     # exit=0 (CRLF-only difference)
echo "// drift" >> "$T"/firestore.rules
node scripts/check-rules-drift.mjs "$T"; echo "exit=$?"     # DRIFT firestore.rules: first difference at line 210 ... exit=1
node scripts/check-rules-drift.mjs "$T/nope"; echo "exit=$?" # ERROR ... ENOENT, exit=1
node scripts/check-rules-drift.mjs; echo "exit=$?"           # Usage ..., exit=2
rm -rf "$T"
```

**Commit title:** `chore(rules): add a drift check that compares both firestore.rules copies modulo CRLF (test-1)`

---

### Step 2 — sec-1 [APP+DASH]: validReading on create and same-userId update

**Goal:** Every new `noise_readings` document, and every same-owner update that changes more than the author label, must pass `validReading()`:
- only the 12 production keys;
- `decibelLevel` a number in [0, 200]; `latitude` in [-90, 90]; `longitude` in [-180, 180];
- `timestamp` a Timestamp no later than `request.time` + 1 day;
- the optional fields type- and size-checked: `userEmail` a string of at most 120 characters, or null; `locationName` ≤ 200; `deviceInfo` ≤ 64; `soundClass` ≤ 64; `soundType` in `['Pollution','Ambient']`; `confidence` a number in [0, 1]; `createdAt` a Timestamp.

These are the D3 defaults. An email-only update (the profile email propagation) skips `validReading()`, so legacy docs stay updatable. The `matches('^deleted_user_.*')` alternative stays byte-identical; Step 3 replaces it. The comment that cited `src/pages/DashboardPage.tsx:33` now describes the dashboard's reads generically (master §4.1).

**Files:**
- `APP:firestore.rules` (edit target)
- `firestore.rules` (DASH; regenerated by mirroring, never hand-edited)

**Exact changes** (edit `APP:firestore.rules`; keep its CRLF endings. Do not touch any other APP file, and do not touch Dart.)

2a. Make the dashboard-read comment generic (master §4.1).

BEFORE (`APP:firestore.rules`, lines 86-93, verbatim):
```
      //   DASHBOARD (browser): full-collection onSnapshot
      //        (src/pages/DashboardPage.tsx:33) and the IndexedDB sync that
      //        fetches ALL readings with no userId filter
      //        (src/utils/syncManager.ts — MAX_INITIAL_READINGS = 0 — plus
      //        forceFullSync and the delta `timestamp >` query).
      // Because this single grant already covers every dashboard read here,
      // noise_readings needs NO isAdmin() clause — that is why the dashboard's
      // "admins can read all readings" clause is dropped rather than merged.
```

AFTER:
```
      //   DASHBOARD (browser): the IndexedDB sync in src/utils/syncManager.ts
      //        reads ALL readings with no userId filter — a full
      //        orderBy('timestamp') fetch plus a `timestamp >` delta query.
      // Because this single grant already covers every dashboard read here,
      // noise_readings needs NO admin clause.
```

2b. Add the validation helpers, and AND `validReading()` into create.

BEFORE (`APP:firestore.rules`, lines 97-108, verbatim):
```
      allow read: if isSignedIn();

      // CREATE: APP only (the dashboard browser performs zero writes — no
      // setDoc/addDoc/updateDoc/deleteDoc anywhere in its src/).
      // Covers the online capture path (firebase_service.dart:182 .add()) and
      // the FIRST write of an offline recording under its deterministic id
      // (sync_service.dart:338), plus the history undo/restore re-write
      // (firebase_service.dart:308 set() on a deleted id, which lands as a
      // create). Document must be stamped with the caller's own uid.
      allow create: if isSignedIn()
        && request.resource.data.userId is string
        && request.resource.data.userId == request.auth.uid;
```

AFTER:
```
      allow read: if isSignedIn();

      // WRITE VALIDATION (dashboard audit sec-1). Signup is open, so every
      // field of every reading is attacker-controlled, and the dashboard
      // renders these documents for every viewer. validReading(d) checks the
      // WHOLE document a write would leave behind:
      //   * only the 12 keys the app writes, nothing else;
      //   * decibelLevel a number in [0, 200]; latitude a number in
      //     [-90, 90]; longitude a number in [-180, 180];
      //   * timestamp a Timestamp no later than request.time + 1 day. The
      //     online path writes serverTimestamp() (equal to request.time); the
      //     offline path writes the capture time, which may be days old, or
      //     slightly ahead on a device whose clock runs fast;
      //   * optional fields typed and size-capped: userEmail (the masked
      //     author label, at most 120 chars, or null because the offline
      //     path can write null), locationName (200), deviceInfo (64),
      //     soundClass (any string up to 64, so a new app category such as
      //     Quiet needs no rules change), soundType ('Pollution' or
      //     'Ambient'), confidence (a number in [0, 1]), createdAt (a
      //     Timestamp).
      // Writing a NEW key (e.g. a future syncedAt) needs this list extended
      // first, mirrored to the dashboard copy and deployed.
      function validReading(d) {
        return d.keys().hasOnly(['userId', 'userEmail', 'decibelLevel',
              'latitude', 'longitude', 'locationName', 'timestamp',
              'createdAt', 'deviceInfo', 'soundClass', 'soundType',
              'confidence'])
          && d.decibelLevel is number
          && d.decibelLevel >= 0 && d.decibelLevel <= 200
          && d.latitude is number
          && d.latitude >= -90 && d.latitude <= 90
          && d.longitude is number
          && d.longitude >= -180 && d.longitude <= 180
          && d.timestamp is timestamp
          && d.timestamp <= request.time + duration.value(1, 'd')
          && (d.get('userEmail', null) == null
              || (d.userEmail is string && d.userEmail.size() <= 120))
          && (!('locationName' in d)
              || (d.locationName is string && d.locationName.size() <= 200))
          && (!('deviceInfo' in d)
              || (d.deviceInfo is string && d.deviceInfo.size() <= 64))
          && (!('soundClass' in d)
              || (d.soundClass is string && d.soundClass.size() <= 64))
          && (!('soundType' in d) || d.soundType in ['Pollution', 'Ambient'])
          && (!('confidence' in d)
              || (d.confidence is number
                  && d.confidence >= 0 && d.confidence <= 1))
          && (!('createdAt' in d) || d.createdAt is timestamp);
      }

      // Email propagation (profile_sync_service.dart) batch-updates ONLY the
      // author label on the owner's readings. It deliberately skips
      // validReading(), so documents written before validation existed stay
      // updatable.
      function isAuthorLabelOnlyUpdate() {
        return request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['userEmail'])
          && request.resource.data.get('userEmail', null) is string
          && request.resource.data.userEmail.size() <= 120;
      }

      // CREATE: APP only (the dashboard browser performs zero writes — no
      // setDoc/addDoc/updateDoc/deleteDoc anywhere in its src/).
      // Covers the online capture path (firebase_service.dart:182 .add()) and
      // the FIRST write of an offline recording under its deterministic id
      // (sync_service.dart:338), plus the history undo/restore re-write
      // (firebase_service.dart:308 set() on a deleted id, which lands as a
      // create). Document must be stamped with the caller's own uid.
      // The document must also pass validReading() (sec-1).
      allow create: if isSignedIn()
        && request.resource.data.userId is string
        && request.resource.data.userId == request.auth.uid
        && validReading(request.resource.data);
```

Placement note: the two functions are declared inside `match /noise_readings/{readingId}`, between `allow read` and the CREATE comment. They are scoped to that block and may read `request` and `resource`. `deviceInfo` is not in the D3 list. It is typed here because it is one of the 12 whitelisted keys: every writer sends `'Mobile Device'`, and all 3,374 production docs hold a string. Without a type check, a map-typed `deviceInfo` would sit unvalidated in every browser's cache. `d.get('userEmail', null) == null` accepts both the missing key (2 production docs) and an explicit null (`APP:sync_service.dart:308`).

2c. Restrict same-userId updates to email-only or `validReading()`. The last line (the `matches` alternative) stays byte-identical.

BEFORE (`APP:firestore.rules`, lines 124-134, verbatim):
```
      // FIX (adversarial review, 2026-09-09): the ownership test alone
      // constrains only the PRE-write document, so an owner could reassign
      // their own reading to an ARBITRARY uid — planting data attributed to
      // another user. The incoming userId must therefore either stay
      // unchanged, or become a 'deleted_user_*' value (the one legitimate
      // rewrite, performed by delete-account anonymization).
      allow update: if isSignedIn()
        && resource.data.userId == request.auth.uid
        && request.resource.data.userId is string
        && (request.resource.data.userId == resource.data.userId
            || request.resource.data.userId.matches('^deleted_user_.*'));
```

AFTER:
```
      // FIX (adversarial review, 2026-09-09): the ownership test alone
      // constrains only the PRE-write document, so an owner could reassign
      // their own reading to an ARBITRARY uid — planting data attributed to
      // another user. The incoming userId must therefore either stay
      // unchanged, or become a 'deleted_user_*' value (the one legitimate
      // rewrite, performed by delete-account anonymization).
      // VALIDATION (dashboard audit sec-1): a same-userId update must either
      // change nothing but the author label `userEmail` (email propagation),
      // or leave a document that passes validReading(). An identical-data
      // retry of an offline upload passes one of the two tests; the
      // email-only test skips validReading() on purpose, so documents
      // written before validation existed stay updatable.
      allow update: if isSignedIn()
        && resource.data.userId == request.auth.uid
        && request.resource.data.userId is string
        && ((request.resource.data.userId == resource.data.userId
             && (isAuthorLabelOnlyUpdate()
                 || validReading(request.resource.data)))
            || request.resource.data.userId.matches('^deleted_user_.*'));
```

Placement note: everything between 2b and 2c (`:110-123`, the UPDATE/DELETE header comment) and after 2c (`allow delete`, the `users`, `app_config` and catch-all blocks) stays byte-identical. Step 3 anchors on this 2c AFTER text.

2d. Mirror, check, commit (Git Bash, from DASH):
```
tr -d '\r' < ../noise_pollution_mapper/firestore.rules > firestore.rules
npm run check:rules                                            # both OK, exit 0
git -C ../noise_pollution_mapper add firestore.rules
git -C ../noise_pollution_mapper diff --cached --name-only     # prints ONLY: firestore.rules
git -C ../noise_pollution_mapper commit -m "fix(rules): validate noise_readings field types, ranges and keys on create and update (sec-1)"
git add firestore.rules
git diff --cached --name-only                                  # prints ONLY: firestore.rules
git commit -m "fix(rules): validate noise_readings field types, ranges and keys on create and update (sec-1)"
git ls-files -s firestore.rules; git -C ../noise_pollution_mapper ls-files -s firestore.rules   # SAME blob id
```
No `Co-Authored-By` trailer and no "Generated with" line in either commit (master §2.6; the APP repo is public).

**Edge cases to preserve** (master §4.1 matrix; each must still be ALLOWED)
- **Online capture** (`firebase_service.dart:182`): exactly the 12 keys; `timestamp == request.time`; dB clamped 0–120 (`dashboard_screen.dart:526`) or the slider 0–120 (`report_noise_screen.dart:333-336`); `confidence` is a YAMNet score in [0, 1], or `1.0` for a manual report; `soundType` is `Pollution`/`Ambient`. Allowed by create.
- **Offline upload, first write** (`sync_service.dart:338`): `timestamp` hours or days in the past; `userEmail` may be null. Allowed by create (null passes, past timestamps pass).
- **Offline retry after a lost ack**: the same `set()` on the existing id is an UPDATE with identical data. `affectedKeys()` is empty. If `userEmail` is a string, `isAuthorLabelOnlyUpdate()` passes; if it is null, `validReading()` passes.
- **Retry after the label was propagated**: the `set()` rewrites `userEmail` back to the queued value, which may be null. Then `affectedKeys()` is `{userEmail}`. A string passes the email-only test; null passes `validReading()`.
- **History undo** (`firebase_service.dart:308`): a create carrying the deleted doc's own fields. It passes `validReading()` for every doc inside the D3 ranges. Accepted residual: a legacy doc outside them cannot be restored. P8 sizes this.
- **Email propagation** (`profile_sync_service.dart:80`): an email-only update. It passes `isAuthorLabelOnlyUpdate()` on ANY legacy doc, because `validReading()` is not consulted. This is why a range clause cannot make the batch fail atomically (P8 note in `03_CROSS_REPO_CONTRACT_AUDIT.md` §5).
- **Account-deletion anonymization**: still passes through the unchanged `matches('^deleted_user_.*')` alternative. Step 3 tightens it.
- **Deletes** and **profile writes**: unchanged.
- No new `get()`/`exists()` calls, so no billed reads are added. `request.time + duration.value(1, 'd')` keeps fast device clocks (up to 24 h ahead) working.

**Acceptance criteria**
- `grep -c "validReading(request.resource.data)" firestore.rules` prints `2` (create and update).
- `grep -c "matches('^deleted_user_.\*')" firestore.rules` prints `1`: the alternative is still present.
- `grep -n "DashboardPage" firestore.rules` prints nothing.
- `npm run check:rules` passes, and both repos show the same `firestore.rules` blob id.
- The rules compile (Verify).

**Verify**
```
npx tsc -b                                         # 0 errors (DASH gate; no TS touched)
npm run check:rules                                # exit 0
# from APP (noise_pollution_mapper/): a compile-only check; it does NOT deploy
firebase deploy --only firestore:rules,firestore:indexes --dry-run
```
`npx eslint`: n/a, because no JS/TS changed. The dry run must report that `firestore.rules` compiled successfully, with no `Error:` lines. If it offers to delete an index, answer **No** and STOP. If this CLI version prints no compile result on a dry run, record that in the commit body; the pre-M1 gate and the post-deploy smoke then carry the check. NEVER `--only storage`, and never a bare deploy.

**Commit title:** `fix(rules): validate noise_readings field types, ranges and keys on create and update (sec-1)`

---

### Step 3 — sec-3 [APP+DASH]: Pin the deleted_user rewrite

**Goal:** The only userId-changing update an owner can make is the exact anonymization write that `APP:lib/screens/settings_screen_enhanced.dart:970-973` performs:
- `userId` becomes `'deleted_user_' + request.auth.uid[0:8]`, the CALLER's own prefix;
- `userEmail` becomes `'Deleted User'`;
- no other field changes.

The branch deliberately does NOT AND in `validReading()`, so every legacy doc stays anonymizable.

**Files:**
- `APP:firestore.rules` (edit target)
- `firestore.rules` (DASH; mirrored)

**Exact changes**

3a. Replace the `matches` alternative with the pinned branch, and update the FIX comment. This BEFORE block **anchors on the Step 2 (2c) AFTER text**; it is not the HEAD text.

BEFORE (`APP:firestore.rules`, lines 182-200 after Step 2, verbatim from the 2c AFTER):
```
      // FIX (adversarial review, 2026-09-09): the ownership test alone
      // constrains only the PRE-write document, so an owner could reassign
      // their own reading to an ARBITRARY uid — planting data attributed to
      // another user. The incoming userId must therefore either stay
      // unchanged, or become a 'deleted_user_*' value (the one legitimate
      // rewrite, performed by delete-account anonymization).
      // VALIDATION (dashboard audit sec-1): a same-userId update must either
      // change nothing but the author label `userEmail` (email propagation),
      // or leave a document that passes validReading(). An identical-data
      // retry of an offline upload passes one of the two tests; the
      // email-only test skips validReading() on purpose, so documents
      // written before validation existed stay updatable.
      allow update: if isSignedIn()
        && resource.data.userId == request.auth.uid
        && request.resource.data.userId is string
        && ((request.resource.data.userId == resource.data.userId
             && (isAuthorLabelOnlyUpdate()
                 || validReading(request.resource.data)))
            || request.resource.data.userId.matches('^deleted_user_.*'));
```

AFTER:
```
      // FIX (adversarial review, 2026-09-09; pinned by dashboard audit
      // sec-3): the ownership test alone constrains only the PRE-write
      // document, so an owner could reassign their own reading to an
      // ARBITRARY uid — planting data attributed to another user. The
      // incoming userId must therefore either stay unchanged, or take the
      // EXACT value delete-account anonymization writes:
      // 'deleted_user_' + the first 8 characters of the CALLER's own uid,
      // with userEmail 'Deleted User' and no other field changed. The old
      // 'deleted_user_*' pattern let an owner file a reading under ANOTHER
      // user's deleted-account bucket or mint arbitrary ids, and rewrite
      // dB, time and position in the same write. The anonymization branch
      // skips validReading() on purpose, so every legacy document stays
      // anonymizable.
      // VALIDATION (dashboard audit sec-1): a same-userId update must either
      // change nothing but the author label `userEmail` (email propagation),
      // or leave a document that passes validReading(). An identical-data
      // retry of an offline upload passes one of the two tests; the
      // email-only test skips validReading() on purpose, so documents
      // written before validation existed stay updatable.
      allow update: if isSignedIn()
        && resource.data.userId == request.auth.uid
        && request.resource.data.userId is string
        && ((request.resource.data.userId == resource.data.userId
             && (isAuthorLabelOnlyUpdate()
                 || validReading(request.resource.data)))
            || (request.resource.data.userId
                  == ('deleted_user_' + request.auth.uid[0:8])
                && request.resource.data.get('userEmail', null) == 'Deleted User'
                && request.resource.data.diff(resource.data).affectedKeys()
                     .hasOnly(['userId', 'userEmail'])));
```

Placement note: the VALIDATION paragraph and the same-userId branch are byte-identical to the 2c AFTER. The UPDATE/DELETE header comment above (item 1 there still describes the anonymization rewrite and is still true) and `allow delete` below stay byte-identical. `request.resource.data.get('userEmail', null) == 'Deleted User'` is the error-free form of `request.resource.data.userEmail == 'Deleted User'`, with the same result.

3b. Mirror, check, commit: the same command sequence as 2d, with this step's title.

**Edge cases to preserve**
- **The app's exact write** (`settings_screen_enhanced.dart:970-973`): `batch.update(ref, {'userEmail': 'Deleted User', 'userId': 'deleted_user_${uid.substring(0, 8)}'})`. `uid.substring(0, 8)` equals `request.auth.uid[0:8]`. The resulting doc changes only `userId`, plus `userEmail` when it was not already `'Deleted User'`. ALLOWED.
- **A legacy doc outside the D3 ranges, or a doc missing `userEmail`** (2 in production): adding `userEmail` is an affected key inside `['userId','userEmail']`, and `validReading()` is not consulted. ALLOWED.
- **Batches**: each document in a `WriteBatch` is evaluated on its own, and the chunking in `FirestoreBatchUtils.applyInChunks` is unchanged. The request is still authenticated: the app anonymizes BEFORE `user.delete()` (`settings_screen_enhanced.dart:977-978`).
- **Same-userId writes** (online, offline, retry, email propagation, undo): unchanged from Step 2.
- **Now DENIED**:
  - `deleted_user_<another user's prefix>`;
  - `deleted_user_<anything else>`;
  - a correct id with a `userEmail` other than `'Deleted User'`;
  - a correct id together with any other field change (dB, timestamp, position, class);
  - reassigning to any other uid (already denied before this step).

**Acceptance criteria**
- `grep -c "matches(" firestore.rules` prints `0`.
- `grep -c "request.auth.uid\[0:8\]" firestore.rules` prints `1`.
- `grep -c "hasOnly(\['userId', 'userEmail'\])" firestore.rules` prints `1`.
- `npm run check:rules` passes, the blob ids are equal in both repos, and the dry run compiles.

**Verify**
```
npx tsc -b                                         # 0 errors (DASH gate)
npm run check:rules                                # exit 0
# from APP:
firebase deploy --only firestore:rules,firestore:indexes --dry-run
```

**Commit title:** `fix(rules): pin the deleted_user rewrite to the caller's own uid prefix and two fields (sec-3)`

---

### Step 4 — priv-2 [APP+DASH]: users owner-read only

**Goal:**
- `users/{userId}` becomes owner-read only (`allow read: if isOwner(userId);`). No client, admin included, can list profiles or read another user's raw registration email.
- `isAdmin()` and its comment are deleted. A short note records the role convention instead: `role` stays manually provisioned and is read only by the owner's own dashboard session, as the cluster 08 gate.
- The `role` guards on users create (`!('role' in request.resource.data)`) and update (role unchanged) stay EXACTLY as they are. They are load-bearing for the cluster 08 gate.
- The header comment stops naming the Admin-SDK files that cluster 03 deletes. Master §4.1 forbids a later comment-only rules edit, so this is the last chance.

**Files:**
- `APP:firestore.rules` (edit target)
- `firestore.rules` (DASH; mirrored)

**Exact changes**

4a. Make the Admin-SDK header comment generic. This text is unchanged by Steps 2-3.

BEFORE (`APP:firestore.rules`, lines 23-26, verbatim):
```
// Anything reached through the Admin SDK — the dashboard's Cloud Functions
// (functions/src/cache-export.ts) and its service-account scripts
// (scripts/export-cache.js, scripts/export-cache-to-firestore.js) — BYPASSES
// these rules entirely and therefore gets NO grant here.
```

AFTER:
```
// Anything reached through the Admin SDK — Cloud Functions, the dashboard's
// service-account scripts under scripts/, the Firebase console — BYPASSES
// these rules entirely and therefore gets NO grant here.
```

4b. Delete `isAdmin()`, and replace its comment with the role note. This text is unchanged by Steps 2-3.

BEFORE (`APP:firestore.rules`, lines 44-72, verbatim):
```
    // DASHBOARD-only admin definition. Kept as a users/{uid}.role document
    // lookup because that is the admin concept the dashboard already ships
    // (its firestore.rules), and because nothing in either codebase sets a
    // custom auth claim, so a claim-based check would grant admin to nobody.
    //
    // COST: each evaluation costs document accesses against
    // users/{caller uid}. It is deliberately called ONLY on the cross-user
    // users read below — never on noise_readings — so ordinary app traffic
    // and every owner-scoped read pay nothing for it (the `||` short-circuits
    // on isOwner first).
    //
    // `.get('role', '')` is used instead of `.data.role` so a profile document
    // with no role field (every document the app creates) evaluates to false
    // rather than erroring. exists() guards the case where an admin account was
    // created straight in the Firebase console and has no users document.
    // OPERATIONAL REQUIREMENT (adversarial review, 2026-09-09): no code in
    // EITHER repo ever writes a `role` field, so before 2026-09-09 this
    // predicate was unsatisfiable for every account in existence and the
    // dashboard's /analytics page (which calls fetchAllUsers() unconditionally)
    // was silently dead. Admin is therefore provisioned MANUALLY: set
    // users/{uid}.role = 'admin' on the accounts that need it. Done for the
    // project owner's own uid. If you add an admin, set that field or their
    // dashboard analytics will fail with permission-denied and no other symptom.
    function isAdmin() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid))
             .data.get('role', '') == 'admin';
    }
```

AFTER:
```
    // NO admin helper, by design (dashboard audit priv-2). The dashboard's
    // admin concept is users/{uid}.role == 'admin', provisioned MANUALLY in
    // the Firebase console or with the Admin SDK (no code in either repo
    // writes `role`). The dashboard's access gate reads it with an owner get
    // of the signed-in user's OWN profile, which the users read rule below
    // already allows. No rule grants anything on the strength of the role:
    // the one grant it used to unlock, listing every users profile (raw
    // registration emails), is gone. The users create/update guards that
    // forbid self-assigning `role` are what keep that dashboard gate honest.
    // Never loosen them.
```

Placement note: the blank line before (after `isOwner`'s closing `}`) and after (before the `noise_readings` section rule) stay as they are.

4c. Make users read owner-only. The BEFORE block is untouched by Steps 2-3; only its line numbers moved.

BEFORE (`APP:firestore.rules`, lines 222-234 after Step 3, i.e. lines 145-157 at HEAD, verbatim):
```
      // READ: owner, or an admin.
      //   APP (owner get): profile_sync_service.dart:43.
      //   DASHBOARD (admin cross-user LIST): src/services/userService.ts
      //      fetchAllUsers() does getDocs(collection(db,'users')) with no
      //      filter, called from src/pages/AnalyticsPage.tsx:27 to label rows
      //      with author emails. THIS is the dashboard admin feature that the
      //      app-only ruleset broke (it has no admin clause), so the clause is
      //      merged in here — and nowhere else.
      // List semantics: an unfiltered list is allowed only when the condition
      // holds without inspecting resource, i.e. only for admins. A non-admin
      // still gets their own document by id via isOwner and cannot list the
      // collection. Ordinary owner reads never trigger the isAdmin() lookup.
      allow read: if isOwner(userId) || isAdmin();
```

AFTER:
```
      // READ: owner only.
      //   APP (owner get): profile_sync_service.dart, email reconciliation.
      //   DASHBOARD (owner get): the signed-in user's OWN profile, read for
      //      its manually provisioned `role` by the dashboard access gate.
      // Profiles hold the RAW registration email, so no client may list the
      // collection or read another user's profile, an admin included
      // (dashboard audit priv-2: the old admin list joined raw emails to
      // exact GPS in the analytics table and CSV export). Admin-side needs
      // go through the console or the Admin SDK; the dashboard labels
      // readings with the masked `userEmail` each reading already carries.
      allow read: if isOwner(userId);
```

4d. Update the users-create comment. The guard lines stay byte-identical.

BEFORE (`APP:firestore.rules`, lines 236-241 after Step 3, i.e. lines 159-164 at HEAD, verbatim):
```
      // CREATE: owner only — APP registration (registration_screen.dart:58).
      // `role` may never be self-assigned: without this guard, any user could
      // write role:'admin' into their own profile and unlock the cross-user
      // read above. Admin must be granted out-of-band (console / Admin SDK).
      allow create: if isOwner(userId)
        && !('role' in request.resource.data);
```

AFTER:
```
      // CREATE: owner only — APP registration (registration_screen.dart:58).
      // `role` may never be self-assigned: without this guard, any user could
      // write role:'admin' into their own profile and pass the dashboard's
      // admin gate, which reads the signed-in user's own role. Admin must be
      // granted out-of-band (console / Admin SDK).
      allow create: if isOwner(userId)
        && !('role' in request.resource.data);
```

Placement note: the users UPDATE comment and rule are NOT edited (`allow update: if isOwner(userId)` / `&& request.resource.data.get('role', '') == resource.data.get('role', '');` stay byte-identical; "Same escalation guard as create." is still true). Nor are `allow delete`, `app_config` and the catch-all.

4e. Mirror, check, commit: the same sequence as 2d, with this step's title.

**Edge cases to preserve**
- **APP owner reads and writes are unchanged**: the owner `get` (`profile_sync_service.dart:42-43`), registration `set` (`registration_screen.dart:57-74`, no `role`), and the `set(merge:true)` writes (`edit_profile_screen.dart:90-95`, `profile_sync_service.dart:55-59`). The update guard compares `get('role','')` before and after, so an untouched role passes.
- **The dashboard's future role read** (cluster 08.1) is `getDoc(doc(db,'users',uid))` on the caller's own uid. It is allowed by `isOwner`. The 2 Auth users with no `users` doc get a not-found result, which is not an error.
- **The dashboard's current `fetchAllUsers()`** (`src/services/userService.ts:17-18`) becomes permission-denied for EVERY account, the admin included, once M1 deploys. It is already caught at `userService.ts:28-30` and returns an empty `Map`, so `/analytics` keeps rendering. Its 'User Email' column and CSV fall back to `reading.userId` until cluster 07.2 replaces them with the masked label. Tell the owner this before M1 (see Risks).
- After this step the ruleset contains no `get()` and no `exists()` at all.

**Acceptance criteria**
- `grep -c "isAdmin" firestore.rules` prints `0`.
- `grep -cE "get\(/databases|exists\(/databases" firestore.rules` prints `0`.
- `grep -c "allow read: if isOwner(userId);" firestore.rules` prints `1`.
- `grep -c "functions/src/cache-export.ts" firestore.rules` prints `0`.
- `grep -c "!('role' in request.resource.data);" firestore.rules` prints `1`.
- `grep -c "request.resource.data.get('role', '') == resource.data.get('role', '');" firestore.rules` prints `1`.
- `git -C ../noise_pollution_mapper diff 9b08e68 --name-only` lists ONLY `firestore.rules`.
- `npm run check:rules` passes, the blob ids are equal, and the dry run compiles.

**Verify** (the end of the cluster; never run the build alongside tsc or a dev server)
```
npx tsc -b                                         # 0 errors (DASH gate)
npm run check:rules                                # exit 0
npm test                                           # cluster-end gate (vitest from cluster 01; no test changed here)
npm run build                                      # cluster-end gate, ~7.5 min
# from APP (noise_pollution_mapper/):
firebase deploy --only firestore:rules,firestore:indexes --dry-run
flutter analyze                                    # must be clean
flutter test                                       # 205 must pass
```

**Commit title:** `fix(rules): make users profiles owner-read only and remove the isAdmin list grant (priv-2)`

---

### After Step 4 — MANUAL M1: deploy the rules (NOT a commit; owner-gated)

No later cluster depends on M1. If the owner postpones it, continue with cluster 03, and record "M1 postponed by owner" for master §6.4.

1. **Pre-M1 gate.** Complete every item before asking for the yes:
   - Walk master §4.1's writer-compatibility matrix row by row against the FINAL rules text. The Step 2–4 "Edge cases" lists are the per-row evidence.
   - **P8 (value ranges, `03_CROSS_REPO_CONTRACT_AUDIT.md` §5).** Ask the owner to run the read-only, aggregates-only probe. The agent never opens `serviceAccountKey.json`. The probe must report:
     - the max `userEmail` length across `noise_readings`;
     - the max `displayName` length in `users`;
     - the min/max of `decibelLevel`, `latitude`, `longitude` and `confidence`;
     - the max `locationName` length;
     - the count of readings with `timestamp` more than 1 day in the future.
     
     If any current author label (displayName, or masked email) exceeds 120 characters, STOP and raise D3 with the owner: every save from that account would be denied. Out-of-range legacy docs only block History undo (an accepted residual), so they need no stop. If the owner declines the probe, they accept that risk explicitly as part of the yes.
   - The dry run from APP compiles.
   - Optional, with the owner present: in the Firebase console, open Firestore → Rules, paste the APP file into the editor, and use the **Rules Playground** (it simulates the unpublished editor text). **Never press Publish; discard the edit afterwards.** Simulate, with an authenticated uid U:
     - create `noise_readings/x` with the 12 keys valid → allow;
     - the same create with `userEmail: null` and `timestamp` 3 days ago → allow;
     - `soundClass` as a map → deny;
     - `decibelLevel: 1e300` → deny;
     - an extra key `foo` → deny;
     - `timestamp` 2 days ahead → deny;
     - `get users/<another uid>` → deny;
     - `list users` → deny.
2. **Show the owner the full diff against the deployed source:** `git -C ../noise_pollution_mapper diff 9b08e68 -- firestore.rules`. Probe P1 says ruleset `ebff82af-…` equals `9b08e68`. Also say plainly:
   - after the deploy, `/analytics`' 'User Email' column and CSV show raw uids until cluster 07.2;
   - new writes now need the D3 shape.
   
   Get an explicit **"yes"**. Silence, or approval of something else, is not a yes.
3. **Deploy from the APP root only:** `firebase deploy --only firestore:rules,firestore:indexes`.
   - `firestore.indexes.json` is unchanged, so the index part is a no-op. **If the CLI offers to delete any index, answer No and STOP.**
   - NEVER `--only storage`, and never a bare `firebase deploy`.
4. **Post-deploy smoke, within minutes, in the app on a device or emulator:**
   - one online save (the History row appears);
   - one offline save, then reconnect and confirm the upload (the queue empties; nothing dead-lettered);
   - History delete, then Undo (the row comes back).
   
   Optionally, with a throwaway account only: delete the account (anonymization must succeed, and the readings must show `Deleted User`). On the dashboard, sign in as the admin and confirm that `/dashboard` and `/analytics` load (the analytics author column shows uids — expected until 07.2).
5. **If anything fails:** roll back (below) and STOP.
6. **Push the APP rules commits** with or before M1, with the owner's go-ahead, so that the public source matches what is deployed (master §4.15). Record the M1 outcome in the PR description, or in the next commit body.

---

## Risks & rollback

- **A tightened rule can reject a real app write; that is the main risk.** It surfaces only at runtime, as `permission-denied`:
  - online saves show the red "could not save" path (fb-1 `SaveOutcome.failed`);
  - offline uploads accumulate attempts and dead-letter;
  - Undo shows its failure snackbar;
  - email propagation logs and retries on the next app start;
  - account deletion fails BEFORE `user.delete()`, so the account survives intact.
  
  Mitigations: the §4.1 matrix, the per-step dry run, the P8 gate and the post-deploy smoke. **Rollback:** Firebase console → Firestore → Rules → history → roll back to ruleset `ebff82af-…` (created 2026-09-09). Alternatively, deploy `git -C ../noise_pollution_mapper show 9b08e68:firestore.rules` the same way, after owner approval. No app release is needed. Then revert the [APP+DASH] commits in BOTH repos, newest first (4 → 3 → 2), and re-run `npm run check:rules`.
- **Author labels longer than 120 characters.** The app's name fields have only a minimum-length validator (`registration_screen.dart:230`, `edit_profile_screen.dart:272`), and `authorLabel()` returns the displayName verbatim. A user whose display name exceeds 120 characters would have every save denied. This is why P8 is a pre-M1 gate. If such a user exists, the owner raises the D3 cap: change the `120` in BOTH `validReading()` and `isAuthorLabelOnlyUpdate()`, then mirror.
- **Fast device clocks.** An offline reading captured on a device more than 24 h fast is denied and dead-lettered. This is accepted under D3.
- **Legacy docs.** A doc outside the D3 ranges cannot be restored via History undo. It can still be email-propagated, anonymized and deleted. Existing docs are never re-validated (master §6.7).
- **Interim dashboard behaviour between M1 and cluster 07.2.** The admin's `/analytics` loses the raw-email join. The 'User Email' column and CSV show uids, because the failure is caught at `userService.ts:28-30` and the page does not break. This is the intended privacy outcome; 07.2 relabels the column.
- **Index prompt.** `firestore:indexes` deploys compare the manifest with the live indexes. The manifest lists the one live index, so nothing should be offered for deletion. If anything is offered, answer No and stop.
- **Public APP repo.** The APP rules commits reveal the validation rules. This is acceptable: rules are enforced server-side and are not secret. They must carry no AI attribution.
- **Step 1 is independent of the rules.** Reverting it removes only the drift check. Reverting any rules step needs the drift check to pass afterwards, plus a redeploy if that step was already deployed (master §1.7).

## Out of scope

- **sec-1, render side:** `normalizeReading()` at the IndexedDB boundary (cluster 04.3) and the root and per-card error boundaries (cluster 08.2). The rules here only stop NEW poison docs.
- **priv-2, dashboard side:** the 'Contributor' column with the masked label, removing `fetchAllUsers`/`userService.ts`, and the `userMap` props (cluster 07.2).
- **test-1, runner and CI half:** vitest and the GitHub Actions workflow (cluster 01). CI cannot check out the sibling APP repo, so `check:rules` is a local, pre-commit and pre-deploy gate only, never a CI step.
- **A permanent rules test suite** (`@firebase/rules-unit-testing` on the emulator, needing Java 21+, covering every §4.1 row plus the attack cases): master §7.
- **Restricting `noise_readings` reads** below `isSignedIn()`. The app's community feed needs the broad read; this is an accepted residual (master §6.7).
- **`createdAt` bounds and a `timestamp` lower bound.** These are not in D3.
- **App Check, and restricting self-signup.** These are not in this playbook.
- **`.gitattributes` (`*.rules text eol=lf`) in APP.** It would change a second APP file, and the playbook allows only `APP:firestore.rules`. The CR-insensitive drift check makes it unnecessary.
- **Removing the `storage` target from `APP:firebase.json`, and both `storage.rules` copies** (build-2, master §7). If that lands, drop `'storage.rules'` from `RULES_FILES` in `scripts/check-rules-drift.mjs` in the same change. `storage.rules` still names `functions/src/cache-export.ts` in comments; it is not edited here.
- **The obsolete ruleset embedded in the untracked `DEPLOYMENT_GUIDE.md`** (build-1).
- **The app's raw-email fallback at `APP:sync_service.dart:308`** (priv-6, master §7). The rules allow any string of up to 120 characters there, because they cannot tell masked from raw.
- **Stale line citations in the rules comments this cluster does not otherwise touch** (e.g. `settings_screen_enhanced.dart:930` in the UPDATE/DELETE header, which is really `:970`). They are left alone: a comment-only rules edit would need another mirror and redeploy.
