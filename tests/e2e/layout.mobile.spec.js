// TC-MOBILE-001/002/003 from TEST_PLAN.md. Runs under both the
// mobile-iphone and mobile-android Playwright projects (see
// playwright.config.js) - same assertions, two real device viewports.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadApp } from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, [{ row_id: 'M1', name: 'פריט למובייל' }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
});

test('TC-MOBILE-001 (REG-001 regression): the search box takes its own row, never squeezed alongside the filters', async ({ page }) => {
  const searchBox = await page.locator('.search-box').boundingBox();
  const controls = await page.locator('.toolbar-controls').boundingBox();
  expect(searchBox).toBeTruthy();
  expect(controls).toBeTruthy();
  // Stacked, not side-by-side: the controls row starts at or after the
  // search box ends vertically.
  expect(controls.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height - 2);
  // And the search box should span (close to) the full toolbar width, not
  // be squeezed down to a sliver.
  const toolbar = await page.locator('.toolbar').boundingBox();
  expect(searchBox.width).toBeGreaterThan(toolbar.width * 0.8);
});

test('TC-MOBILE-003: the add/edit item modal fills the screen (no rounded floating card on narrow viewports)', async ({ page }) => {
  await page.click('button:has-text("פריט חדש")');
  await page.waitForSelector('#item-overlay');
  const modal = await page.locator('#item-overlay .modal').boundingBox();
  const viewport = page.viewportSize();
  expect(modal.width).toBeGreaterThanOrEqual(viewport.width - 2);
});
