import { defineConfig, devices } from '@playwright/test';

// See TEST_PLAN.md section 1 ("סביבת הבדיקה"): tests run against the local
// dev server (the exact same client code as the deployed app), never
// against the live GitHub Pages URL or the real Apps Script backend - this
// environment has no route to either. Integration-level tests mock the
// Apps Script boundary with page.route() instead of reaching it for real.
const CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

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
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: CHROMIUM_PATH } },
    },
    {
      name: 'mobile-iphone',
      testMatch: /.*\.mobile\.spec\.js/,
      use: { ...devices['iPhone 13'], launchOptions: { executablePath: CHROMIUM_PATH } },
    },
    {
      name: 'mobile-android',
      testMatch: /.*\.mobile\.spec\.js/,
      use: { ...devices['Pixel 7'], launchOptions: { executablePath: CHROMIUM_PATH } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // Fixed, obviously-fake endpoint for Integration/Contract tests (see
    // tests/integration/) - real process env here overrides any local
    // .env.local, so the suite is reproducible even without one. Every
    // request to it is intercepted with page.route(); nothing ever
    // actually reaches this URL.
    env: {
      VITE_APPS_SCRIPT_URL: 'https://mock-apps-script.test/exec',
      VITE_SHARED_SECRET: 'test-secret',
    },
  },
});
