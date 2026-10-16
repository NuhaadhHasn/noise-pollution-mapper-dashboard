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
