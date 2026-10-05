// SPEC.md 26.1 - the phone's "back" closes the window on top, not the app.
// TEST_PLAN.md TC-BACK-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait } from '../helpers/app.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const back = (page) => page.evaluate(() => history.back());

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank');
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, [{ row_id: 'K1', name: 'זריחה', price: 100, image_url: null, pending_image: PNG }]);
  await reloadAndWait(page);
});

test('TC-BACK-001: "back" closes the artwork form - the app stays', async ({ page }) => {
  await page.click('.card .name');
  await expect(page.locator('#item-overlay')).toBeVisible();
  await back(page);
  await expect(page.locator('#item-overlay')).toHaveCount(0);
  await expect(page.locator('.card')).toHaveCount(1); // still in the app
});

test('TC-BACK-002: a form with unsaved changes asks first; "back" on the question returns to editing', async ({ page }) => {
  await page.click('.card .name');
  await page.locator('#item-overlay textarea').fill('שינוי');
  await back(page);
  await expect(page.locator('.discard-confirm')).toBeVisible();
  await back(page);
  await expect(page.locator('.discard-confirm')).toHaveCount(0);
  await expect(page.locator('#item-overlay textarea')).toHaveValue('שינוי');
  // and "back" once more asks again - the form kept its step
  await back(page);
  await expect(page.locator('.discard-confirm')).toBeVisible();
});

test('TC-BACK-003: "back" closes the share window, the zoomed photo, the ⚙ menu and its windows', async ({ page }) => {
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-dialog')).toBeVisible();
  await back(page);
  await expect(page.locator('.share-dialog')).toHaveCount(0);

  await page.click('.card .thumb-zoom');
  await expect(page.locator('.lightbox-overlay')).toBeVisible();
  await back(page);
  await expect(page.locator('.lightbox-overlay')).toHaveCount(0);

  await page.click('.header-menu > button');
  await expect(page.locator('.header-menu-list')).toBeVisible();
  await back(page);
  await expect(page.locator('.header-menu-list')).toHaveCount(0);

  await page.click('.header-menu > button');
  await page.click('.header-menu-list button:has-text("מידע ותמיכה")');
  await expect(page.locator('.overlay h2')).toBeVisible();
  await back(page);
  await expect(page.locator('.overlay')).toHaveCount(0);
  await expect(page.locator('.card')).toHaveCount(1);
});

test('TC-BACK-004: windows on top of the form close one at a time - share from inside the form', async ({ page }) => {
  await page.click('.card .name');
  await page.click('#item-overlay button:has-text("שיתוף")');
  await expect(page.locator('.share-dialog')).toBeVisible();
  await back(page);
  await expect(page.locator('.share-dialog')).toHaveCount(0);
  await expect(page.locator('#item-overlay')).toBeVisible();
  await back(page);
  await expect(page.locator('#item-overlay')).toHaveCount(0);
});

test('TC-BACK-005: windows closed by their own buttons leave no empty steps - one "back" then leaves', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.click('.card .name');
    await page.click('#item-overlay button:has-text("ביטול")');
    await expect(page.locator('#item-overlay')).toHaveCount(0);
    await page.click('.card .share-icon-btn');
    await page.click('.share-dialog button:has-text("ביטול")');
    await expect(page.locator('.share-dialog')).toHaveCount(0);
  }
  // duplicate: one form closes and another opens in the same moment
  await page.click('.card .name');
  await page.click('#item-overlay button:has-text("שכפול")');
  await expect(page.locator('#item-overlay h2')).toContainText('שכפול');
  await page.click('#item-overlay button:has-text("ביטול")');
  await expect(page.locator('#item-overlay')).toHaveCount(0);
  await page.waitForTimeout(300);
  await back(page);
  await expect(page).toHaveURL('about:blank'); // left the app on the first "back"
});
