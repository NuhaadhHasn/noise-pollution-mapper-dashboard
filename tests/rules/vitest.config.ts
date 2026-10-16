import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Vitest config for the Firestore security-rules suite ONLY. It needs a
// running Firestore emulator, so `npm test` (root vitest.config.ts, which
// includes src/** only) never picks it up. Run it with `npm run test:rules`,
// which wraps this config in `firebase emulators:exec` against the
// test-only tests/rules/firebase.json and a `demo-` project id.
//
// That firebase.json names no rules file on purpose: firebase-tools treats
// the config's own directory as the project root and refuses any path that
// leaves it ("../../firestore.rules is outside of project directory"), and a
// root firebase.json would invite a deploy from this repo. The suite loads
// the repo's firestore.rules into the emulator itself, in beforeAll, so the
// emulator's "allowing all reads and writes" start-up warning is expected
// and is overridden before the first test runs.
//
// Windows: firebase-tools 14.x stops the emulator through a shell wrapper, so
// the emulator's java.exe can outlive the run and the next run fails with
// "port taken" on 8181. Stop it (PowerShell):
//   Stop-Process -Id (Get-NetTCPConnection -LocalPort 8181 -State Listen).OwningProcess
// The port stays fixed on purpose, so a leaked JVM fails loudly instead of
// piling up. Linux CI is unaffected.
//
// Standalone on purpose: the suite imports no app code, so it needs neither
// the React/Tailwind plugins nor the '@' alias from vite.config.ts.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // One emulator, one shared database: never run rules files in parallel.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
