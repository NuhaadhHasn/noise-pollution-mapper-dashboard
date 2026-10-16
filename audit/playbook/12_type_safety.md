# Playbook 12 — Type Safety (strict mode)

Implementation spec for the last defect cluster: the app tsconfig has `"strict": false`, and the two Firebase handles every Firestore and Auth call goes through are typed `any`. Together these are why the Timestamp/`toDate` defect (bug-1) and the missing-field fall-throughs compiled cleanly. The work is type-level only: no query, rule, index, schema, dependency or behaviour change.

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors) and `npx eslint <the .ts/.tsx files the step changed>` (0 errors, no new warnings). Run `npm test` and `npm run build` ONCE, at the end of Step 3 (master playbook §1.3). Never run a build, a type check and a dev server at the same time.**

All BEFORE blocks below were copied verbatim from the working tree at dashboard HEAD `353bbdd` (the 2026-10-15 audit snapshot; re-read on 2026-10-16, unchanged). This cluster runs LAST (master §3.1, §4.16), so every anchor was chosen to match BOTH the HEAD file and the file as clusters 01–11 leave it. Each block says which: a line that no earlier cluster edits is quoted from HEAD; the two exceptions are marked "as left by NN.k" and quote that earlier step's AFTER text (05.5f for 1b, this spec's own 12.2 for 3a). Every anchor was checked to occur exactly once in a scratch copy of the tree with the specs 01–11 applied in order (3a: after 12.2), and every HEAD-quoted anchor also occurs exactly once in the HEAD file. If a BEFORE block does not match, STOP and re-read the file, then check master §4.13 and §4.16; do not guess. Match on exact text, never on line numbers.

Environment facts (verified):
- `package.json`: `typescript ~5.9.3` (installed 5.9.3), `firebase ^12.10.0` (installed 12.10.0), `react ^19.2.0` (installed 19.2.4), `@types/react ^19.2.7` (installed 19.2.14), `recharts ^2.15.4` (installed 2.15.4), `react-leaflet ^5.0.0`, `@react-leaflet/core ^3.0.0` (installed 3.0.0), `@types/leaflet ^1.9.21`, `eslint ^9.39.1` (installed 9.39.3), `typescript-eslint ^8.48.0` (installed 8.56.1). The build script is `tsc -b && vite build` (`package.json:8`). This cluster adds no dependency.
- `tsconfig.app.json` (34 lines, LF): `"strict": false` at `:26`, `"noUnusedLocals": false` / `"noUnusedParameters": false` at `:27-28`, `"verbatimModuleSyntax": true` (type-only imports need `type`), `"erasableSyntaxOnly": true`, `"types": ["vite/client"]`, `"include": ["src"]`. Test files under `src/**/__tests__/` (added by clusters 01 and 04–10) are therefore type-checked by `tsc -b` too. No earlier cluster edits this file (master §3.3).
- `tsconfig.node.json:18` is already `"strict": true` and covers `vite.config.ts` and (from 01.1) `vitest.config.ts`. Nothing here touches it.
- Firebase types: `getAuth(app?: FirebaseApp): Auth` (`node_modules/@firebase/auth/dist/auth-public.d.ts:1298`), `Auth` is an exported interface (`:293`). `getFirestore(app: FirebaseApp): Firestore` (`node_modules/@firebase/firestore/dist/index.d.ts:1415`), `Firestore` is an exported class (`:845`). Every call site already passes the handle to an SDK function whose parameter is `Auth` or `Firestore`, so typing the handles changes no inferred type.
- Importers of `@/config/firebase` once cluster 11 is done: `src/contexts/AuthContext.tsx` (`auth`, `db`; 08.1 adds `db`), `src/pages/LoginPage.tsx` (`auth`), `src/utils/syncManager.ts` (`db as firebaseDb`), and the mock `vi.mock('@/config/firebase', () => ({ db: {}, auth: {} }))` in `src/utils/__tests__/syncManager.test.ts` (05.1). The HEAD importers `DashboardPage.tsx:9` and `services/userService.ts:1` are gone (05.5 and 07.2).
- recharts 2.15.4: `activeBar?: ActiveShape<BarProps, SVGPathElement>` (`node_modules/recharts/types/cartesian/Bar.d.ts:56`), and `ActiveShape` is `ReactElement | function | SVGProps | boolean`, with no `null` (`types/util/types.d.ts:626`). The default is `activeBar: false` (`es6/cartesian/Bar.js:320`). `Shape()` (`es6/util/ActiveShapeUtils.js:66-96`) sends `null` and `false` down the same last branch, so the two render identically.
- @react-leaflet/core 3.0.0 exports `type LeafletContextInterface` (`lib/index.d.ts:4`). `createPathComponent<E, P>(createElement: (props: PropsWithoutRef<P>, context: LeafletContextInterface) => LeafletElement<E>, …)` (`lib/generic.d.ts:16`).
- ESLint 9 reports an unused `eslint-disable` directive as a warning by default (`node_modules/eslint/lib/config/default-config.js:62`, `reportUnusedDisableDirectives: 1`; the audit-time `eslint.log` warning on `CacheStatus.tsx:57` is exactly this). So a step that removes the last `any` a directive covers MUST remove that directive in the same commit, or the step adds a warning. The lint config is `tseslint.configs.recommended`, which is not type-aware, so `strict` does not change lint results.
- ESLint only matches `**/*.{ts,tsx}` (`eslint.config.js:11`). Passing `tsconfig.app.json` to `npx eslint` prints a "File ignored" warning, so the Verify commands below lint only `.ts`/`.tsx` files.

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| arch-1 | UNVERIFIED (Medium, confidence high); re-read in the working tree | `tsconfig.app.json:26` `"strict": false`, and `src/config/firebase.ts:28-30` types `auth`, `db` and `storage` as `any`, so `.toDate` on a plain object, a possibly-absent `decibelLevel` and unknown category strings were never flagged. 19 `no-explicit-any` suppressions and 21 `as any`/`: any` outside `components/ui` at HEAD. Steps 1–3. |

Where each part of arch-1 is fixed (so this cluster does not redo it):

| Part of arch-1 | Fixed by |
|---|---|
| `storage: any` and the `getStorage` import | 03.3 |
| Firestore docs cast unchecked (`syncManager.ts:90-93`, `db.ts:55`), `NoiseReading` not matching what the app writes (required `confidence`, missing `userEmail`), the recommended `parseReading(doc)` | 04.3 (`normalizeReading()` in `src/lib/readings.ts`, the `NoiseReading` DTO with optional `soundClass`/`confidence`/`userEmail` and epoch-ms `number \| null` dates), 06.3 (drops `soundCategory`) |
| 17 of the 19 suppressions and 18 of the 21 `any`s (`NoiseMarkers.tsx` ×10, `HeatmapLayer.tsx` ×2, `CategoryChart.tsx`, `DataTable.tsx`, `NoiseTrendChart.tsx`, `syncManager.ts`, `cacheDownloader.ts`, and `storage`, which had no suppression of its own) | 03.2 (file deleted), 03.3, 04.2, 05.1, 06.2/06.3, 09.1/09.4 |
| `auth: any`, `db: any` and the file-level suppression in `firebase.ts` | **12.1** |
| `strict` off | **12.2** (`strictNullChecks`), **12.3** (the rest of `strict`) |
| The last `context: any` and its suppression (`MarkerClusterGroup.tsx:12` at HEAD) | **12.3** |

Full finding text: grep `arch-1` in `audit/00_MASTER_AUDIT_REPORT.md` and `audit/06_ARCHITECTURE_AND_CODE_QUALITY.md` (lines 68-102).

**How the error list below was predicted.** The audit forbids type checks on this machine, so `tsc` was NOT run with `strict` on. Instead the specs 01–11 were applied in order to a scratch copy of the tree, and every file of the result was read for strict-mode hazards: nullable values reaching a non-null slot, untyped callback parameters without a contextual type, implicit-any `let`s and index accesses, class fields without initializers, `catch` variables used as `Error`, `this`, and `bind`/`call`/`apply`. The specs from 04 on narrow nulls explicitly in their new code (04, 05, 08, 09 and 10 say so in their environment facts), so almost everything that could fail is old code that no cluster rewrote. The prediction is **one** error under `strictNullChecks` (Step 2) and **none** added by the rest of `strict` (Step 3). `npx tsc -b` is the authority: anything it reports beyond the prediction is handled by the residual-error procedure in Step 2, in the step that surfaces it.

---

## Pre-reading

Open these files before touching anything:

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md` — §1.3 (gates), §2 (conventions 6, 8, 13, 14), §3.3 (rows for `src/config/firebase.ts` and `tsconfig.app.json`), §4.13 (`firebase.ts` hand-off from 03.3), §4.16 (strict mode last), §6.2 and §6.6 (done-gates and grep checks), §7 (`noUnusedLocals`/`noUnusedParameters` are follow-up work).
2. `audit/06_ARCHITECTURE_AND_CODE_QUALITY.md` lines 68-102 (arch-1).
3. `src/config/firebase.ts` — whole file (33 lines at HEAD, 31 once 03.3 has removed the two Storage lines; 05.5f removes the trailing comment of the `getFirestore` import).
4. `tsconfig.app.json` — whole file (34 lines). `tsconfig.json` and `tsconfig.node.json` — to confirm `tsc -b` builds both projects and that the node project is already strict.
5. `src/components/analytics/CategoryChart.tsx` — the `<Bar …>` element (line 192 at HEAD).
6. `src/components/map/MarkerClusterGroup.tsx` — whole file (27 lines at HEAD; 43 after 09.6 adds `DEFAULT_OPTIONS`).
7. The importers listed in the environment facts, to confirm that each passes `auth`/`db` straight into an SDK function.

Pre-flight (read-only):
- `git log --oneline 353bbdd..HEAD` lists 45 commits (44 if D5 skipped 09.6), the newest titled `perf(bundle): split firebase, recharts and leaflet vendor chunks and scope leaflet CSS (perf-5)`. If cluster 11 or any earlier cluster is missing, STOP: strict mode runs last (master §3.2).
- `git status --short` shows only the untracked `DEPLOYMENT_GUIDE.md`, `SESSION_39_SUMMARY.md` and `audit/`.
- `npx tsc -b` reports 0 errors (the cluster-11 end state, still `strict: false`).

---

## Steps

### Step 1 — arch-1: type the Firebase handles as `Auth` and `Firestore`

**Goal:** `auth` and `db` carry their real SDK types, so a wrong handle, a wrong argument order or a call to a method that does not exist is a compile error instead of `any`. The file-level `no-explicit-any` suppression goes with them. No call site changes.

**Files:**
- `src/config/firebase.ts` (modified)

**Exact changes**

1a. Drop the file-level suppression and import the `Auth` type.

BEFORE (`src/config/firebase.ts`, lines 8-10, verbatim; 03.3 and 05.5f do not touch these lines):
```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
```

AFTER:
```ts
import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
```

1b. Import the `Firestore` type.

BEFORE (`src/config/firebase.ts`, as left by 05.5f, verbatim; at HEAD this text is the start of line 11, which 05.5f shortens to exactly this):
```ts
import { getFirestore } from 'firebase/firestore';
```

AFTER:
```ts
import { getFirestore, type Firestore } from 'firebase/firestore';
```

1c. Type the two handles.

BEFORE (`src/config/firebase.ts`, lines 28-29, verbatim; 03.3 deletes the `storage` line that follows them, so these two lines match both HEAD and the post-03.3 file, per master §4.13):
```ts
export const auth: any = getAuth(app);
export const db: any = getFirestore(app);
```

AFTER:
```ts
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
```

Resulting file, for checking only (do not paste; the `firebaseConfig` body is abbreviated):
```ts
/**
 * Firebase Configuration
 * Project: Urban Noise Pollution Mapper Dashboard
 * Firebase Project ID: noise-pollution-mapper-9ad3d
 * Region: asia-south1 (Mumbai)
 */

import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Firebase configuration from environment variables
const firebaseConfig = {
  // … six import.meta.env.VITE_FIREBASE_* keys, unchanged (storageBucket included) …
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Export the app for use in other modules
export default app;
```

Placement notes:
- The style matches the repo: single quotes, semicolons, and the inline `type` modifier that `AuthContext.tsx` already uses (`import { type User, onAuthStateChanged, … } from 'firebase/auth'`). `verbatimModuleSyntax` requires the `type` modifier: `Auth` is an interface and `Firestore` is used only as a type here.
- The explicit annotations are deliberate. Inference would give the same types, but the annotation pins the exported contract if the initialiser ever changes (for example `initializeFirestore(app, …)` for persistent cache, master §7).
- No call site changes. `onAuthStateChanged`, `signOut`, `signInWithEmailAndPassword` and `sendPasswordResetEmail` take `Auth`; `doc(db, 'users', uid)` and `collection(firebaseDb, 'noise_readings')` resolve to the same first overload (`(firestore: Firestore, path: string, ...pathSegments: string[])`) they resolved to with `any`. The test mock's factory is not checked against the module's types, so `{ db: {}, auth: {} }` stays as it is.

**Edge cases to preserve**
- The `storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET` key stays (03.3 placement note). It is a config value, not a Storage init.
- `export default app;` stays.
- The import stays `firebase/firestore`, never `firebase/firestore/lite`: the full SDK is what `getDocs` and the query builders in `syncManager.ts` come from.
- `firebase.ts` still initialises at import time. Tests keep mocking `@/config/firebase` (master §2.15).

**Acceptance criteria**
- `grep -nE "\bany\b|eslint-disable" src/config/firebase.ts` prints nothing.
- `grep -n "storage" src/config/firebase.ts` prints only the `storageBucket:` line.
- `npx tsc -b` reports 0 errors with no change to any other file. If it reports an error at an importer, the importer was passing the handle somewhere that is not an `Auth`/`Firestore` parameter: fix that call site type-level in this commit and name it in the body. None is expected.
- `git diff --stat` lists only `src/config/firebase.ts`.

**Verify**
```
npx tsc -b
npx eslint src/config/firebase.ts
```
Manual: none needed. Types only, so the emitted JavaScript is unchanged.

**Commit title:** `refactor(types): type Firebase handles as Auth and Firestore instead of any (arch-1)`

Stage by explicit path (`git add src/config/firebase.ts`), never `git add -A`. No AI attribution in the message (master §2.6).

---

### Step 2 — arch-1: enable `strictNullChecks` and fix the surfaced null errors

**Goal:** `null` and `undefined` become their own types in the app project, so a nullable value can no longer reach a non-null slot unnoticed. This is the flag that would have caught bug-1. Every error it surfaces is fixed with guards, narrowing or explicit types. A null error that reveals a real behaviour bug no earlier cluster covered is fixed minimally and named in the commit body (master §4.16).

**Files:**
- `tsconfig.app.json` (modified)
- `src/components/analytics/CategoryChart.tsx` (modified; the one predicted error)
- any further file `npx tsc -b` names, handled by the residual-error procedure below (none predicted)

**Exact changes**

2a. Turn on `strictNullChecks` alone, keeping `strict: false` for one more step.

BEFORE (`tsconfig.app.json`, lines 25-27, verbatim):
```jsonc
    /* Linting */
    "strict": false,
    "noUnusedLocals": false,
```

AFTER:
```jsonc
    /* Linting */
    "strict": false,
    "strictNullChecks": true,
    "noUnusedLocals": false,
```

Placement note: everything else in the file stays byte-identical, including `"noUnusedLocals": false` and `"noUnusedParameters": false` (master §4.16, §7).

Predicted `npx tsc -b` output after 2a alone: exactly one error, in `src/components/analytics/CategoryChart.tsx` on the `<Bar …>` line, TS2322, approximately `Type 'null' is not assignable to type 'ActiveShape<BarProps, SVGPathElement> | undefined'`. With `strictNullChecks` off, `null` was assignable to every type.

2b. `CategoryChart.tsx`: pass recharts' own "no active-bar shape" value instead of `null`.

BEFORE (`src/components/analytics/CategoryChart.tsx`, line 192, verbatim; no cluster edits this line, so it matches HEAD and the post-10 file, where it sits near line 180):
```tsx
            <Bar dataKey="avgDb" name="Average dB" radius={[0, 4, 4, 0]} activeBar={null}>
```

AFTER:
```tsx
            <Bar dataKey="avgDb" name="Average dB" radius={[0, 4, 4, 0]} activeBar={false}>
```

Placement note: the children (`{categoryData.map(…<Cell …/>)}`) and the closing `</Bar>` stay byte-identical. Keep the prop rather than deleting it. `false` is also recharts' default, but writing it out records the intent that hovering a bar draws no highlight shape.

2c. Residual-error procedure, used only if `npx tsc -b` reports anything besides the 2b error. It is also used by Step 3.

1. Re-run `npx tsc -b` and list every error as `file(line,col): TSxxxx`. If there are more than 20, STOP. The prediction is 1, so a large count means an earlier cluster is missing or was applied differently. Check `git log` against master §5 before fixing anything.
2. Fix each error in the file `tsc` names, at the line it names, with the smallest type-level change from the table. Keep the rendered output and every earlier cluster's behaviour exactly as it is.
3. If the only correct fix changes behaviour (the value really can be null and the code would crash or show a wrong value), that is a real bug. Fix it minimally with a guard that shows the existing fallback text (for example `'—'`, `'Unknown'`, `'No timestamp'`), add a unit test if the code is in `src/lib` or `src/utils`, and name it under "Behaviour fixes" in the commit body. Do not redesign.

| `tsc` code | Typical cause | Type-level fix |
|---|---|---|
| TS2322 / TS2345: `null` (or `undefined`) is not assignable | a literal `null` passed where the library type has no `null` | pass the library's documented "off" value that renders the same (`false`, `undefined`), as in 2b |
| TS18047 / TS18048 / TS2531 / TS2532: possibly `null`/`undefined` | `.find()`, `Map.get`, `getElementById`, an optional `NoiseReading` field, a helper returning `T \| null` (`getReadingDate`, `getCoordinates`, `confidenceOf`, `presetRange`, `summarizeLevels`) | narrow with `if (!x) return …` or `x ? … : fallback`, or use `?.` with `??` and the same fallback the UI already shows. In tests, use `?.` inside `expect(…)` as the 04–09 tests already do |
| TS2345: argument of type `X \| null` | a nullable result passed on | guard before the call. A non-null assertion `!` only where the invariant is established in the same function, with a one-line comment naming it (like `main.tsx`'s `getElementById('root')!`) |
| TS2790: the operand of `delete` must be optional | `delete obj.key` on a required property (tests) | type the fixture as `Record<string, unknown>` (as `readings.test.ts` `rawDoc()` already does) |
| TS2769: no overload matches (recharts `formatter`) | the annotated parameter types do not fit `Formatter<TValue, TName>` | annotate the parameters with what recharts passes (`value: number`, `name: string`) or drop the annotation and narrow inside |

Never, in any step of this cluster:
- add `any`, `as any`, `as unknown as T`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` or an `eslint-disable` comment;
- widen a shared type to make an error disappear (no `| any`, no making a `NoiseReading` field looser than the 04.3 DTO, no `?` on a field `normalizeReading()` guarantees);
- turn a `strict` sub-flag back off, or edit `tsconfig.node.json`;
- change a Firestore query, `firestore.rules`, the indexes, `DB_VERSION`, the stored reading shape, a category or band mapping, or any copy;
- touch `src/components/ui/*` beyond a minimal type-level fix at the line `tsc` names (none is predicted: the shadcn files are written for strict projects and contain no `any`).

**Edge cases to preserve**
- The category chart looks and behaves exactly as before. With `activeBar` `null` or `false`, recharts' `Shape()` renders the plain bar inside the `recharts-active-bar` layer, and the transparent tooltip cursor (`cursor={{ fill: 'transparent' }}`) is unchanged.
- No other component changes. Every nullable the 04–11 code handles (`timestamp: number | null`, `confidence?`, `soundClass?`, the `getCoordinates`/`getReadingDate` results, `role: string | null`, `error: Error | null`, `lastSync: Date | null`) is already narrowed explicitly. That is why the prediction is a single error.
- Test files are type-checked too (`include: ["src"]`). Predicted: no errors there; the 04–09 tests read nullable helpers through `?.` and type mutable fixtures as `Record<string, unknown>`.

**Acceptance criteria**
- `npx tsc -b` reports 0 errors with `"strictNullChecks": true`.
- `grep -n '"strictNullChecks": true' tsconfig.app.json` prints one line; `grep -n '"strict": false' tsconfig.app.json` still prints one line.
- `grep -rn "activeBar={null}" src` prints nothing.
- Before committing, `git diff -U0 HEAD -- src | grep -E "^\+.*(\bas any\b|:\s*any\b|@ts-(ignore|expect-error|nocheck)|eslint-disable)"` prints nothing.
- Every non-null assertion `!` added in this commit (none expected) has a comment naming its invariant.
- The commit body lists every error fixed (`file: what`) and has a "Behaviour fixes:" line ("none" when every fix is type-only).

**Verify**
```
npx tsc -b
npx eslint src/components/analytics/CategoryChart.tsx
```
Add every further `.ts`/`.tsx` file the residual procedure changed to the `npx eslint` line, and run `npx vitest run <test file>` for any test file it changed, or for the test of any `src/lib`/`src/utils` module it changed.
Manual (optional, only if a residual fix touched rendering): `npm run dev`, sign in as the admin, open `/analytics`, hover a category bar. The tooltip shows "Average Noise" and the bar gets no extra highlight shape. Stop the dev server before the next type check.

**Commit title:** `build(ts): enable strictNullChecks and fix the surfaced null bugs (arch-1)`

Commit body (fill in; no AI attribution):
```
strictNullChecks surfaced 1 error:
- CategoryChart.tsx: activeBar={null} -> activeBar={false}. Type-only:
  recharts renders null and false identically and false is its default.
Behaviour fixes: none.
```

Stage by explicit path: `tsconfig.app.json`, `src/components/analytics/CategoryChart.tsx`, plus any file the residual procedure changed.

---

### Step 3 — arch-1: enable full `strict` and remove the last `any`

**Goal:** `strict: true` turns on the rest of the family: `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict` and `strictBuiltinIteratorReturn`. `strictNullChecks` stays on because `strict` implies it. The last explicit `any` outside `components/ui` (the cluster group's `context` parameter) gets its real type, and its suppression goes. `noUnusedLocals` and `noUnusedParameters` stay `false` (master §7).

**Files:**
- `tsconfig.app.json` (modified)
- `src/components/map/MarkerClusterGroup.tsx` (modified)
- any further file `npx tsc -b` names, handled by the Step 2 residual-error procedure (none predicted)

**Exact changes**

3a. Replace the two-flag form with `strict: true`.

BEFORE (`tsconfig.app.json`, as left by 12.2 (the 2a AFTER text), verbatim):
```jsonc
    /* Linting */
    "strict": false,
    "strictNullChecks": true,
    "noUnusedLocals": false,
```

AFTER:
```jsonc
    /* Linting */
    "strict": true,
    "noUnusedLocals": false,
```

Placement note: `"noUnusedLocals": false`, `"noUnusedParameters": false`, `"erasableSyntaxOnly": true`, `"noFallthroughCasesInSwitch": true` and `"noUncheckedSideEffectImports": true` below stay byte-identical. The resulting Linting block is:

```jsonc
    /* Linting */
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
```

Predicted `npx tsc -b` output after 3a: 0 errors. The reasons, per flag:
- `noImplicitAny`: every function parameter in `src` is annotated or contextually typed. The recharts `tickFormatter`/`labelFormatter`/`label` callbacks get `any` from recharts' own signatures, which is not an implicit any. `let` declarations all carry types (`let timer: ReturnType<typeof setTimeout> | undefined`). Dynamic index reads use a `keyof typeof` cast, a `Record<string, string>`, or a `Map`.
- `useUnknownInCatchVariables`: every `catch (error)`/`catch (err)` variable is only logged, rethrown, passed to `reject`, tested with `instanceof`, or passed to a helper that takes `unknown` (`toError`, `signInErrorMessage`, `passwordResetFailure`).
- `strictPropertyInitialization`: the only class fields are `ErrorBoundary.state` (initialised), and the test fakes' `Timestamp` fields (assigned in the constructor). `DbBlockedError` declares none.
- `strictFunctionTypes`: the recharts `formatter` callbacks annotate exactly the `TValue`/`TName` they infer. The React handler props get functions with matching or fewer parameters.
- `noImplicitThis`, `strictBindCallApply`, `strictBuiltinIteratorReturn`: `src` has no `this` outside class methods, no `bind`/`call`/`apply`, and no manual `.next()` on a built-in iterator.

3b. `MarkerClusterGroup.tsx`: import the context type.

BEFORE (`src/components/map/MarkerClusterGroup.tsx`, line 1, verbatim; identical at HEAD and after 09.6):
```tsx
import { createPathComponent, extendContext } from '@react-leaflet/core';
```

AFTER:
```tsx
import { createPathComponent, extendContext, type LeafletContextInterface } from '@react-leaflet/core';
```

3c. Same file: type `context`, and drop the line suppression that would otherwise become an "unused eslint-disable directive" warning.

BEFORE (`src/components/map/MarkerClusterGroup.tsx`, line 12 at HEAD, line 25 after 09.6, verbatim; 09.6 inserts `DEFAULT_OPTIONS` above it and edits the lines below it, but not this line):
```tsx
function createCluster(props: MarkerClusterGroupProps, context: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
```

AFTER:
```tsx
function createCluster(props: MarkerClusterGroupProps, context: LeafletContextInterface) {
```

Placement notes:
- The function body stays byte-identical in whichever form 09.6 left it: `{ ...DEFAULT_OPTIONS, ...options, chunkedLoading: false }` if 09.6 ran, the HEAD `L.markerClusterGroup(options)` if D5 skipped it. `extendContext(context, { layerContainer: cluster })` already takes and returns a `LeafletContextInterface` (`lib/context.d.ts:16`), and `createPathComponent` passes exactly that type as the second argument (`lib/generic.d.ts:16`). The return value `{ instance, context }` satisfies `LeafletElement<L.MarkerClusterGroup>` (`lib/element.d.ts:3-7`).
- `updateCluster()` keeps its empty parameter list: a function with fewer parameters is assignable to the `updateElement` callback type.
- `children?: React.ReactNode` keeps using the global `React` namespace type, as it compiles today.

3d. Residual errors: apply the Step 2 procedure (2c) to anything else `npx tsc -b` reports, in this commit. For `noImplicitAny` errors, annotate with the library's exported type (TS7006/TS7031: a parameter or binding without a contextual type). For TS7053 (index expression), use `key as keyof typeof obj` only when the key's source guarantees it, else a typed `Map`/`Record` lookup with the existing fallback. For TS18046 (`unknown` catch variable), use `err instanceof Error ? err.message : String(err)`. For TS2564 (field without initializer), initialise it or use `declare`. None is predicted.

**Edge cases to preserve**
- The marker clustering on `/map` and the Overview mini-map is unchanged: same options, same `chunkedLoading: false` (when 09.6 ran), same `layerContainer` handed to `NoiseMarkers` through `extendContext`.
- `noUnusedLocals`/`noUnusedParameters` stay off. Do not delete an unused import or parameter in this cluster, even if the editor flags it (master §7).
- The three `react-refresh/only-export-components` suppressions in `components/ui` (`badge.tsx:48`, `button.tsx:64`, `tabs.tsx:89`) and those in `AuthContext.tsx`, `ReadingsContext.tsx`, `ThemeContext.tsx` and `EmptyStateActions.tsx` are not about `any`. They stay.

**Acceptance criteria**
- `npx tsc -b` reports 0 errors with `"strict": true`, and `tsconfig.app.json` no longer contains `"strictNullChecks"` (implied by `strict`).
- `grep -rnE "\bas any\b|:\s*any\b|no-explicit-any" src` prints nothing. That holds for the whole `src`, including `components/ui`, which has none.
- `grep -rnE "@ts-(ignore|expect-error|nocheck)" src` prints nothing.
- `grep -nE '"noUnusedLocals": false|"noUnusedParameters": false' tsconfig.app.json` prints two lines.
- The commit body lists every residual error fixed, or says "no further errors".
- Cluster end (master §1.3, §6.2): `npx eslint .` reports 0 errors and 0 warnings; `npm test` is green; `npm run build` succeeds (it starts with `tsc -b`, now strict).

**Verify**
```
npx tsc -b
npx eslint src/components/map/MarkerClusterGroup.tsx
```
Add every further `.ts`/`.tsx` file a residual fix changed, and `npx vitest run` for every test file it changed. Then, once for the whole cluster, one at a time and with nothing else running:
```
npx eslint .
npm test
npm run build
```
Manual (types only, so this is a smoke check): `npm run preview` after the build, signed in as the admin.
- `/map`: pins cluster; clicking a cluster zooms in; a pin opens its React popup with a date.
- `/dashboard`: the mini-map clusters, and the category chart renders.
- `/analytics`: all three charts and the table render; hovering a category bar shows the tooltip.

Stop the preview server afterwards.

**Commit title:** `build(ts): enable full strict mode (arch-1)`

Stage by explicit path: `tsconfig.app.json`, `src/components/map/MarkerClusterGroup.tsx`, plus any file the residual procedure changed. No AI attribution in the message.

---

## Risks & rollback

- **The prediction can be incomplete.** It comes from reading a simulated post-cluster-11 tree, not from `tsc`. Where the executed clusters differ from their specs (the semantic merges the master playbook allows, for example 08.1's `LoginPage.tsx` copy and 10.4's `NoiseMarkers.tsx` and `MapPage.tsx` edits, whose anchors did not apply mechanically in the scratch run because earlier steps had already reshaped those lines), a few more errors can appear. The residual procedure covers them, and the 20-error stop rule catches a missing cluster. Each error found is fixed in the step that surfaces it, never deferred, so every commit keeps `tsc -b` at 0.
- **A residual fix that changes behaviour** is the one real risk: a hasty `?? 0` or `!` could hide a missing value. The procedure demands the UI's existing fallback text, a comment on every `!`, a unit test for `src/lib`/`src/utils` logic, and a "Behaviour fixes" line in the commit body. The owner can audit them from `git log`.
- **Build impact.** `npm run build` is `tsc -b && vite build`, so a strict error fails the CI build (01.2) and the Vercel build. Nothing reaches production unless every gate passed, and DASH is pushed only with the owner's approval (master §1.9, §4.15). The emitted JavaScript is unchanged except for `activeBar={false}` (identical rendering) and the dropped comments.
- **Rollback.** Each step reverts on its own. 12.3 anchors on 12.2's tsconfig text, so revert newest first: `git revert` 12.3, then 12.2, then 12.1 (master §1.7). Reverting 12.2 or 12.3 alone restores the looser compile and changes no runtime behaviour. No data, rules, index or deploy is involved, so no manual action (M1–M3) is affected.
- **Future clusters.** From here on every new `src` file compiles under `strict`. A follow-up that must touch these files writes strict-clean code; there is no per-file opt-out.

---

## Out of scope

- **`noUnusedLocals` / `noUnusedParameters`** and the dead-code sweep of unused `components/ui/*` files (`avatar`, `chart`, `progress`, `scroll-area`, `select`, `tabs`, `badge`): master §7.
- **Flags outside `strict`:** `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`. They are not part of arch-1, and each would touch many files the earlier clusters just settled.
- **Type-aware linting** (`tseslint.configs.recommendedTypeChecked` with `parserOptions.project`): a follow-up. On this 2-core machine it multiplies lint time.
- **Runtime validation of Firestore docs:** done in 04.3 (`normalizeReading()`), not repeated.
- **Typed collection references** (`withConverter`, or typed path constants so a collection-name typo fails at compile time): arch-1 mentions it as an impact. Typing `db` does not type path strings, and a converter would move `normalizeReading()` into the SDK read path. Follow-up, not needed for strict.
- **Narrowing `soundClass` to a union of category names:** it would reject legacy and manual-report strings that `src/lib/categories.ts` deliberately folds into 'Other' or an alias.
- **`scripts/*.js`** (plain JavaScript Admin SDK tools, not covered by any tsconfig) and **`functions/`** (deleted in 03.1).
- **bug-10** (`StatsCards` `Math.max(...spread)` and treating a missing dB as 0): master §7. Strict mode does not flag it, because `decibelLevel` is a required `number` after 04.3.
