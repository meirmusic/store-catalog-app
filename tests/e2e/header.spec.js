// The header's sign-out (🔐) - SPEC.md section 15.
import { test, expect } from '@playwright/test';
import {
  pickIdentity,
  clearAllData,
  reloadAndWait,
  startSignOut,
} from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await reloadAndWait(page);
});

test('TC-HDR-001: sign-out asks in the app\'s own dialog (not the browser\'s), and cancel / Esc keep you signed in', async ({ page }) => {
  let browserDialog = false;
  page.on('dialog', (d) => { browserDialog = true; d.dismiss(); });
  await startSignOut(page);

  const dialog = page.locator('.signout-confirm');
  await expect(dialog.locator('h2')).toHaveText('להתנתק מהאפליקציה במכשיר הזה?');
  await expect(dialog).toContainText('מכשירים אחרים לא מושפעים');
  await expect(dialog.locator('button:has-text("ביטול")')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await startSignOut(page);
  await dialog.locator('button:has-text("ביטול")').click();
  await expect(page.locator('.chip.user')).toBeVisible(); // still in the app
  expect(browserDialog).toBe(false);
});

test('TC-HDR-002: confirming sign-out returns to the sign-in screen', async ({ page }) => {
  await startSignOut(page);
  await page.click('.signout-confirm button:has-text("התנתקות")');
  await expect(page.locator('input[type=password]')).toBeVisible();
  await expect(page.locator('.chip.user')).toHaveCount(0);
});
