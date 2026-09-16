// UI_STANDARD_GAP_ANALYSIS.md STA-06/07: an unexpected render error
// anywhere in the tree must show a recovery screen, never a blank page.
import { test, expect } from '@playwright/test';

test('an unexpected render error shows a recovery screen with a reload button, not a blank page', async ({ page }) => {
  // window.__testCrash is a test-only hook (see src/ErrorBoundary.jsx's
  // CrashTestHook) - nothing in the real app ever sets it. Setting it
  // before the app boots makes the crash deterministic instead of relying
  // on organically corrupting data to trigger some component to throw.
  await page.addInitScript(() => { window.__testCrash = true; });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('text=קרתה תקלה בלתי צפויה')).toBeVisible();
  await expect(page.locator('text=הנתונים שלך בטוחים')).toBeVisible();
  const reloadBtn = page.locator('button:has-text("רענון הדף")');
  await expect(reloadBtn).toBeVisible();

  // The page must not be blank/empty behind the fallback.
  const bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length).toBeGreaterThan(0);
});
