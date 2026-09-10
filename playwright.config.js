import { defineConfig, devices } from '@playwright/test';

// See TEST_PLAN.md section 1 ("סביבת הבדיקה"): tests run against the local
// dev server (the exact same client code as the deployed app), never
// against the live GitHub Pages URL or the real Apps Script backend - this
// environment has no route to either. Integration-level tests mock the
// Apps Script boundary with page.route() instead of reaching it for real.
//
// Set directly on process.env (not via webServer.env below) so it's
// guaranteed to reach the spawned `npm run dev` regardless of Vite's own
// .env-file loading precedence, and so the suite works the same whether or
// not a developer's machine happens to have a real .env.local. The actual
// value never matters - every test that depends on it matches the URL
// generically (see tests/helpers/app.js's APPS_SCRIPT_URL_PATTERN) and
// mocks every request with page.route(), so nothing ever really reaches it.
if (!process.env.VITE_APPS_SCRIPT_URL) {
  process.env.VITE_APPS_SCRIPT_URL = 'https://mock-apps-script.test/exec';
  process.env.VITE_SHARED_SECRET = 'test-secret';
}

const CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// Running as root in this container - Chromium refuses to launch without
// --no-sandbox regardless of device profile (desktop happened to tolerate
// its absence; every mobile-device profile did not).
const LAUNCH_OPTIONS = { executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] };

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testMatch: /.*\.spec\.js/,
      testIgnore: /.*\.mobile\.spec\.js/,
      use: { ...devices['Desktop Chrome'], launchOptions: LAUNCH_OPTIONS },
    },
    {
      name: 'mobile-iphone',
      testMatch: /.*\.mobile\.spec\.js/,
      // devices['iPhone 13'] defaults to WebKit (real iOS Safari's engine),
      // but only Chromium is installed in this environment - forcing
      // browserName here just gives it the right viewport/UA/touch flags
      // under Chromium instead. This means these tests validate CSS
      // layout/breakpoints only, never real WebKit rendering quirks (like
      // the iOS file-input capture bug found manually earlier) - those
      // stay in TEST_PLAN.md's permanently-manual list (🔴).
      use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions: LAUNCH_OPTIONS },
    },
    {
      name: 'mobile-android',
      testMatch: /.*\.mobile\.spec\.js/,
      use: { ...devices['Pixel 7'], launchOptions: LAUNCH_OPTIONS },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
