# Playbook 01 — Test Harness & CI

Implementation spec for the defect cluster covering the missing test runner, the absence of any test, and the absence of any pre-merge check (lint, type-check, test, build) on the web dashboard.

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors) and `npx eslint <the files the step changed>` (0 errors, no new warnings); run `npm test` and `npm run build` ONCE, at the end of Step 2 (master playbook §1.3).**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`). If a BEFORE block does not match, STOP and re-read the file — do not guess. Match on exact text, never on line numbers.

Environment facts (verified):
- Dashboard `package.json`: `"type": "module"`, `vite ^7.3.1` (installed 7.3.1), `typescript ~5.9.3`, `eslint ^9.39.1`, `@types/node ^24.10.1` (installed 24.11.0), `react ^19.2.0`, `clsx ^2.1.1`, `tailwind-merge ^3.5.0` (installed 3.5.0), `@vitejs/plugin-react ^5.1.1` (installed 5.1.4). No `vitest`, no `jsdom`, no `test` script today.
- Test runner choice: **`vitest@4.1.11`**, exact-pinned (`npm install -D -E`). Published 2026-08-18, so it is older than the 2-week quiet period. Verified with `npm view vitest@4.1.11`: `peerDependencies.vite = "^6.0.0 || ^7.0.0 || ^8.0.0"` (includes the repo's `vite ^7`), `engines.node = "^20.0.0 || ^22.0.0 || >=24.0.0"`. The `@types/node` peer (`^20.0.0 || ^22.0.0 || >=24.0.0`, verified on 4.1.12, the same 4.1 line) is satisfied by 24.11.0.
- **Do NOT take `vitest@latest` (5.0.5).** It requires `node ^22.12.0 || ^24.0.0 || >=26.0.0`, and the owner's machine runs Node `v20.20.0` (npm 10.8.2). 4.1.11 runs on both the local Node 20 and CI's Node 22.
- The repo has no `jsdom` and this cluster adds none. The test environment is `node`. Tests import only pure modules (master §2.15).
- `tsconfig.app.json` has `"include": ["src"]`, so test files under `src/` ARE type-checked by `npx tsc -b` (`"strict": false`, `"types": ["vite/client"]`). They import `describe`/`it`/`expect` explicitly from `vitest`; no global types are needed. `tsconfig.node.json` currently includes only `vite.config.ts`.
- `eslint.config.js` lints `**/*.{ts,tsx}` with `globalIgnores(['dist'])`, so the new `.ts` files are linted by `npm run lint` (`eslint .`).
- Both `package.json` and `package-lock.json` are tracked with LF line endings (`git ls-files --eol`: `i/lf w/lf`). `core.autocrlf=true`. Write new files with LF.
- Baseline from the audit's precomputed checks: `tsc -b` 0 errors; eslint 0 errors + 1 warning (`src/components/map/CacheStatus.tsx:57`, deleted by cluster 03); `npm run build` OK in 7m25s locally. Lint does not use `--max-warnings`, so the baseline warning does not fail CI.
- `package-lock.json` already carries the linux-x64 optional natives (`@rollup/rollup-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, `lightningcss-linux-x64-gnu`, `@esbuild/linux-x64`), so `npm ci` on a Linux runner resolves.
- GitHub Actions majors verified to exist on 2026-10-15 via the GitHub API: `actions/checkout` latest `v7.0.1` (tag `v7`), `actions/setup-node` latest `v7.1.0` (tag `v7`).
- No Firebase access, no secrets and no network calls to Firebase are needed anywhere in this cluster.

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| test-1 | CONFIRMED (Medium) | No test runner, no tests and no CI (`package.json:6-11` scripts are only dev/build/lint/preview; no `.github/`). A type or lint regression reaches Vercel production on push to `main` with no pre-merge check. Step 1 adds the runner, a `test` script and a first pure-module test. Step 2 adds the GitHub Actions workflow. The `firestore.rules` drift guard that `test-1` also names is cluster 02 step 02.1 (`check:rules`), NOT this cluster, because CI cannot see the sibling APP repo. |

Full finding text and verifier evidence: grep `test-1` in `audit/00_MASTER_AUDIT_REPORT.md` and `audit/06_ARCHITECTURE_AND_CODE_QUALITY.md`.

---

## Pre-reading

Open these files before touching anything:

1. `package.json` — whole file (56 lines). Steps below edit the `scripts` block and the tail of `devDependencies`.
2. `vite.config.ts` — whole file (14 lines). It is **not edited**; `vitest.config.ts` merges it so the `@` alias and plugins are shared.
3. `src/lib/utils.ts` — whole file (6 lines). It exports `cn()`, the module under test.
4. `tsconfig.app.json` and `tsconfig.node.json` — to confirm which files `tsc -b` covers.
5. `eslint.config.js` — to confirm the new files are linted.
6. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md` §2.14 (dependencies), §2.15 (tests never touch Firebase), §4.12 (`package.json` sequence 01 → 02 → 03), §4.15 (do not push without owner approval).
7. `vercel.json` — to confirm Vercel builds with `npm run build` and is independent of the GitHub workflow.

---

## Steps

### Step 1 — test-1: add vitest with a test script and a first pure-module test

**Goal:** The dashboard has a working test runner. `npm test` runs `vitest run` in the `node` environment, resolves the `@` alias exactly like the app build, and has one passing smoke test of a pure module (`cn()` in `src/lib/utils.ts`). Every later cluster adds its unit tests on top of this harness.

**Files:**
- `package.json` (modified: `test` script, `vitest` devDependency)
- `package-lock.json` (modified by npm, never by hand)
- `vitest.config.ts` (new)
- `src/lib/__tests__/utils.test.ts` (new)
- `tsconfig.node.json` (modified: one-line `include` addition so `tsc -b` type-checks `vitest.config.ts`; this is the only file outside the cluster's nominal file list)

`vite.config.ts` is NOT edited.

**Exact changes**

1a. Install the runner. From the DASH root, run exactly:

```
npm install -D -E vitest@4.1.11
```

npm edits `package.json` `devDependencies` and regenerates `package-lock.json`. Never hand-edit the lockfile. Do not use `--legacy-peer-deps` or `--force`. Commit the lockfile in this same step. Confirm with `git diff package.json` that npm produced exactly the AFTER block below (the entry is exact, with no `^`); if npm wrote anything else (a caret, a different version), correct only that line by hand.

BEFORE (`package.json`, lines 52-55, verbatim):
```json
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.48.0",
    "vite": "^7.3.1"
  }
```

AFTER:
```json
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.48.0",
    "vite": "^7.3.1",
    "vitest": "4.1.11"
  }
```

1b. `package.json` — add the `test` script. This one is a hand edit.

BEFORE (`package.json`, lines 9-11, verbatim):
```json
    "lint": "eslint .",
    "preview": "vite preview"
  },
```

AFTER:
```json
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

Placement note: `test` goes last in `scripts`, after `preview`. Cluster 02 step 02.1 (`check:rules`) anchors on this AFTER text, so it must add its script after `"test": "vitest run"` (master §4.12). Cluster 03 step 03.3 later edits `dependencies` and `devDependencies`; it must anchor on the post-1a `devDependencies` text above.

1c. New file `vitest.config.ts` (repo root) — full contents:
```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Reuses vite.config.ts (React + Tailwind plugins and the '@' -> ./src alias)
// so tests resolve modules exactly like the app build. vite.config.ts itself
// is not edited.
//
// Environment is 'node' on purpose: tests import only pure modules, or mock
// '@/config/firebase' and 'firebase/firestore' (master playbook convention
// 2.15). Importing the real src/config/firebase.ts initialises the Firebase
// SDK with undefined env and may throw at import, so never do that in a test.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }),
)
```

Placement note: the file lives next to `vite.config.ts`. `vite.config.ts` default-exports a plain object (`defineConfig({...})` from `vite`), which is what `mergeConfig` needs. Do not import `vitest/config`'s `defineConfig` into `vite.config.ts`.

1d. `tsconfig.node.json` — make `tsc -b` type-check the new config.

BEFORE (`tsconfig.node.json`, line 25, verbatim):
```json
  "include": ["vite.config.ts"]
```

AFTER:
```json
  "include": ["vite.config.ts", "vitest.config.ts"]
```

If `npx tsc -b` reports an error in `vitest.config.ts` that cannot be fixed within the file (for example a `vite` type-identity mismatch between the repo's `vite` and the one `vitest` resolves), revert only this 1d edit, record the reason in the commit body, and continue. `npm test` is the real gate for the config.

1e. New file `src/lib/__tests__/utils.test.ts` — full contents:
```ts
import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

// Smoke test of a pure module. It proves the runner, the '@' alias and the
// node environment work, without touching Firebase.
describe('cn', () => {
  it('joins class names with a single space', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('returns an empty string when given nothing', () => {
    expect(cn()).toBe('')
  })

  it('skips falsy values', () => {
    expect(cn('a', undefined, null, false, '', 'b')).toBe('a b')
  })

  it('accepts arrays and conditional objects', () => {
    expect(cn(['a', { b: true, c: false }], 'd')).toBe('a b d')
  })

  it('lets the later conflicting Tailwind class win', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
  })

  it('keeps Tailwind classes that do not conflict', () => {
    expect(cn('p-2', 'px-4')).toBe('p-2 px-4')
    expect(cn('text-red-500', 'text-sm')).toBe('text-red-500 text-sm')
  })
})
```

Placement note: tests live in a `__tests__` folder beside the module under test (`src/lib/__tests__/`). Later clusters follow the same layout: `src/lib/__tests__/<module>.test.ts`, and `src/utils/__tests__/<module>.test.ts` for `src/utils`. The file is inside `src/`, so `tsc -b` and `eslint .` both cover it. It has no `React` import and no JSX.

**Edge cases to preserve**
- Exact pin, no caret: master §2.14 requires `npm install -E`. The `vitest` line must read `"vitest": "4.1.11"`.
- Do not install `jsdom`, `happy-dom`, `@vitest/ui`, `@vitest/coverage-*` or `@testing-library/*`. No spec in this playbook needs them.
- Do not enable vitest `globals: true`. Tests import `describe`/`it`/`expect` explicitly. With `"types": ["vite/client"]` in `tsconfig.app.json`, globals would not type-check.
- The vitest `include` glob is `src/**/*.test.{ts,tsx}`. It must NOT pick up `functions/` (its own package), `scripts/`, or `node_modules`.
- `vite.config.ts` stays byte-identical; `git diff --stat` must not list it.
- No Firebase import anywhere in the test or config (master §2.15). `src/lib/utils.ts` imports only `clsx` and `tailwind-merge`.
- The `build` script stays `tsc -b && vite build`. Do not add a `pretest` or `prebuild` hook.
- `package-lock.json` changes only by the `vitest` subtree: no existing dependency may change version. Check with `git diff package-lock.json | grep '^-' | grep '"version"'`. It must print nothing, or only lines belonging to packages that vitest legitimately re-resolves, which you must explain in the commit body.
- Only one `vite` copy may be installed. `npm ls vite` must show a single `vite@7.3.1` (deduped under `vitest`).

**Acceptance criteria**
- `package.json` has `"test": "vitest run"` in `scripts` and `"vitest": "4.1.11"` in `devDependencies`, and no other change. `package-lock.json` is changed and committed.
- `vitest.config.ts` and `src/lib/__tests__/utils.test.ts` exist with the contents above. `tsconfig.node.json` includes `vitest.config.ts` (or the commit body records why 1d was reverted).
- `npx vitest run src/lib/__tests__/utils.test.ts` reports 6 passing tests, 0 failing, in the node environment.
- `npm test` passes (it runs the same single file).
- No file other than the five listed (plus `package-lock.json`) is in the commit, and `vite.config.ts` is untouched.

**Verify**
```
npm install -D -E vitest@4.1.11
npx vitest run src/lib/__tests__/utils.test.ts
npx tsc -b
npx eslint vitest.config.ts src/lib/__tests__/utils.test.ts
npm ls vite
git status --short
git diff --stat
```
Manual:
- `git status --short` lists exactly: `package.json`, `package-lock.json`, `tsconfig.node.json` (modified) and `vitest.config.ts`, `src/lib/__tests__/utils.test.ts` (new). The two untracked pre-existing files (`DEPLOYMENT_GUIDE.md`, `SESSION_39_SUMMARY.md`) and `audit/` must NOT be staged. Stage by explicit path, never `git add -A`.
- Run `npm test` once and confirm exit code 0 (`echo $?`).
- Do NOT run `npm run build` in this step.

**Commit title:** `test(harness): add vitest with a test script and a first pure-module test (test-1)`

---

### Step 2 — test-1: add a CI workflow that runs lint, type-check, tests and build

**Goal:** Every push and every pull request runs `npm ci`, `npm run lint`, `npx tsc -b`, `npm test` and `npm run build` on GitHub Actions. A type, lint or test regression is caught before it reaches Vercel production. The workflow needs no secrets and never contacts Firebase.

**Files:**
- `.github/workflows/ci.yml` (new; the `.github/` directory does not exist today)

**Exact changes**

2a. New file `.github/workflows/ci.yml` — full contents:
```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Lint, type-check, test, build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Check out
        uses: actions/checkout@v7

      - name: Set up Node
        uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type-check
        run: npx tsc -b

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

Placement note: this is a new file, so there is no BEFORE block (the file and its directory do not exist). It is independent of Step 1's edit regions, but it runs `npm test`, so it depends on Step 1's `"test": "vitest run"` script. Do not reorder the steps.

Design notes (all intentional):
- **No secrets.** `npm run build` succeeds without `VITE_FIREBASE_*` because the values are only read at runtime (master §4.12). Tests never initialise Firebase (master §2.15). Do NOT add `env:` blocks, repository secrets or a `.env` file to this workflow.
- **Pinned majors.** `actions/checkout@v7` and `actions/setup-node@v7`, both verified to exist on 2026-10-15. Node 22 satisfies Vite 7 (`^20.19.0 || >=22.12.0`) and vitest 4.1.11. `cache: npm` keys on the root `package-lock.json`.
- **`permissions: contents: read`** is the least privilege the job needs.
- **`npx tsc -b` is deliberately repeated.** `npm run build` already starts with `tsc -b`, but a separate step gives a precise failure signal. It is incremental inside the same job, so the extra cost is small.
- **Every push and every PR.** `on: push:` with no branch filter, plus `pull_request:`. The `concurrency` block cancels a superseded run on the same ref.
- **No rules drift check.** The `firestore.rules` mirror check (`check:rules`, cluster 02 step 02.1) needs the sibling APP repo, which CI cannot see. It stays a local pre-commit and pre-deploy gate (master §2.2). Do not add it to this workflow.
- **No deploy step.** Deployment stays with Vercel's Git integration (`vercel.json`). This workflow only verifies.

**Edge cases to preserve**
- Lint baseline: eslint exits 0 with 1 known warning (`CacheStatus.tsx:57`). The `lint` script has no `--max-warnings`, so CI stays green. Do NOT add `--max-warnings 0` here (cluster 03 deletes that file; tightening it is out of scope).
- `npm ci` requires `package-lock.json` to be in sync with `package.json`. Step 1 committed both together. If `npm ci` fails with "package.json and package-lock.json are not in sync", the Step 1 commit is wrong. Fix Step 1, do not work around it with `npm install` in CI.
- Do not add a `functions/` install or build step. `functions/` is a separate package with its own `package.json` and tracked `functions/lib` output, and is out of scope.
- Keep the YAML at 2-space indentation, LF line endings, no tabs, and a trailing newline.
- Do not change `vercel.json` (its `installCommand` is `npm install`; unrelated to CI).
- Cluster 03 step 03.3 moves `firebase-admin` to `devDependencies`. `npm ci` installs devDependencies by default, so CI is unaffected.

**Acceptance criteria**
- `.github/workflows/ci.yml` exists with the contents above, parses as valid YAML, and is the only file in the commit.
- Locally, in order: `npm run lint` exits 0, `npx tsc -b` exits 0, `npm test` exits 0 and `npm run build` exits 0. These are the same commands the workflow runs.
- After the owner approves a push (master §4.15; never push on your own), the first GitHub Actions run of the `CI` workflow is green. If the owner has not approved a push yet, this check is deferred and recorded in the hand-off notes.

**Verify**
```
node -e "const y=require('js-yaml');const d=y.load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'));console.log(d.jobs.verify.steps.length+' steps OK')"
npx tsc -b
npx eslint vitest.config.ts src/lib/__tests__/utils.test.ts
npm run lint
npm test
npm run build
git status --short
```
Manual:
- The `node -e` line should print `7 steps OK`. It uses `js-yaml`, which is already in `node_modules` as an eslint dependency; it adds nothing to the repo. No YAML linter is installed and none may be installed.
- `npm run build` is the **cluster-end build**: run it exactly once here (~7.5 minutes on this machine). Do not run it alongside the dev server or another type-check. It must finish OK with the single ">500 kB" chunk warning that is the audited baseline.
- `git status --short` must show only `.github/workflows/ci.yml` as new. `dist/` is gitignored and must not appear. Stage by explicit path.
- Do not push. Tell the owner that a push to `main` triggers both this workflow and a Vercel production deploy.

**Commit title:** `ci: run lint, type-check, tests and build on every push and pull request (test-1)`

---

## Risks & rollback

- **Local vs CI Node versions.** Local Node is 20.20.0 and CI is 22. vitest 4.1.11 and Vite 7.3.1 support both. If CI-only breakage appears, check this first. Do not "fix" it by upgrading to vitest 5: that drops Node 20 support and breaks local runs.
- **`vitest.config.ts` pulls in the Tailwind and React Vite plugins** through `mergeConfig(viteConfig, …)`. The `node` environment never renders anything, so they are inert, but they do load. If this slows or breaks tests, the fallback is a standalone `defineConfig` with only `resolve.alias`. That duplicates the alias, so prefer fixing the cause.
- **`tsc -b` now includes `vitest.config.ts`** (step 1d). A `vite` type-identity mismatch between the repo's `vite` and the copy under `vitest` is the only plausible failure. The step says how to back out 1d alone.
- **Lockfile churn.** `npm install -D -E vitest@4.1.11` adds a sizeable subtree to `package-lock.json`. Review `git diff --stat package-lock.json`. Only additions are expected. Rollback of Step 1: `git revert` the commit, which removes the dependency, script, configs and lockfile entries together.
- **CI fails on its first run for an environmental reason** (for example a Linux-only optional native missing from the lockfile; the linux-x64 entries are present, so this is unlikely). Do not weaken the workflow. Regenerate the lockfile with `npm install --package-lock-only` in a corrected Step 1 amendment. Rollback of Step 2: `git revert` the commit or delete the file. Nothing else depends on it.
- **A red CI run does not block Vercel.** Vercel deploys on push independently. Making CI a required check is a GitHub branch-protection setting that the owner chooses; no commit does it (see Out of scope).
- **Resource limits.** This machine has 2 cores and ~2 GB free. The audit's `npm ci` took 18 minutes. Run Step 1's install with nothing else running, and run the one `npm run build` only at the end of Step 2.

## Out of scope

- **Rules drift check** (`check:rules` script, `scripts/check-rules-drift.mjs`, README note): cluster 02 step 02.1. CI cannot see the sibling APP repo, so it is never a CI step.
- **Real unit tests for `toDate`/`normalizeReading`, category taxonomy, week bucketing, `csvCell`, and the sync watermark:** those arrive in their own clusters (04, 05, 06, 07) on top of this harness. This cluster adds only the `cn()` smoke test.
- **Firestore rules unit tests** (`@firebase/rules-unit-testing`, needs the emulator and Java): master playbook §7.
- **jsdom or React component tests** (`@testing-library/*`), coverage reporting, and a `test:watch` script.
- **Branch protection or required status checks, Dependabot, and caching beyond `setup-node`'s `cache: npm`.** Owner-side GitHub settings.
- **Deploying from CI.** Vercel's Git integration stays the deploy path.
- **`functions/` build, lint or test in CI**, and tidying `functions/lib` (tracked build output).
- **Raising lint strictness** (`--max-warnings 0`), turning on TypeScript `strict`, and `noUnusedLocals`. Cluster 12 and master §7.
- **Pinning Node via `engines` or `.nvmrc`.**
