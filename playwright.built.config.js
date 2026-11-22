import { defineConfig, devices } from '@playwright/test';
import { chromiumLaunchOptions } from './tests/helpers/chromium.js';

// SPEC.md 22.8: tests against the BUILT app, exactly as it goes live -
// service worker included, which the dev server used by the main suite
// never runs. Covers what only exists there: opening with no internet,
// and a real new version arriving and installing itself.
// Run: npm run test:built
if (!process.env.VITE_APPS_SCRIPT_URL) {
  process.env.VITE_APPS_SCRIPT_URL = 'https://mock-apps-script.test/exec';
}

export default defineConfig({
  testDir: './tests/built',
  testMatch: /.*\.built\.js/,
  fullyParallel: false,
  workers: 1, // tests rebuild the app - never in parallel
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
    launchOptions: chromiumLaunchOptions(), // REG-064
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'GITHUB_SHA=aaaaaaa0000 npm run build && node tests/built/serve.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
