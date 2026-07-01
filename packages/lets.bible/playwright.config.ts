import { defineConfig, devices } from '@playwright/test';

// E2E tests run against the already-running dev server (the `letsbible`
// container, published on the host at :4001). They don't start their own
// server — `just up` / the dev stack must be running, with the Bible + lexicon
// seeded and the search index built. See docs/letsbible-e2e-testing.md.
//
// Each test gets a fresh browser context (isolated localStorage/IndexedDB), so
// the local-first state from one test never leaks into another.
const BASE_URL = process.env.LETS_BIBLE_E2E_URL ?? 'http://localhost:4001';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The suite hits a single dev Vite server (on-demand SSR compilation) + ES, so
  // limit parallelism and give assertions room: cold route compiles under heavy
  // parallel load are slow. One retry catches residual flake.
  workers: 2,
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
