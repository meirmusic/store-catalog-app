// TC-I18N-* from TEST_PLAN.md.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, switchLanguage, reloadApp } from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, [
    { row_id: 'L1', name: 'פריט לבדיקת שפה', location: 'גלריה', availability_status: 'available', price: 3500 },
  ]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
});

test('TC-I18N-001/002/003: switching language updates UI strings, keeps content untranslated', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('קטלוג הגלריה');

  await switchLanguage(page, 'English');
  await expect(page.locator('h1')).toHaveText('Gallery Catalog');
  // TC-I18N-004: Config-driven content (location value) is never translated.
  await expect(page.locator('.card')).toContainText('גלריה');
  await expect(page.locator('.card')).toContainText('פריט לבדיקת שפה');

  await switchLanguage(page, 'Nederlands');
  await expect(page.locator('h1')).toHaveText('Galerijcatalogus');

  await switchLanguage(page, 'עברית');
  await expect(page.locator('h1')).toHaveText('קטלוג הגלריה');
});

test('TC-I18N-005: layout direction stays RTL regardless of language', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await switchLanguage(page, 'English');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await switchLanguage(page, 'Nederlands');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('TC-I18N-006: price is always shown in ₪, in every language', async ({ page }) => {
  await expect(page.locator('.card .price')).toContainText('₪');
  await switchLanguage(page, 'English');
  await expect(page.locator('.card .price')).toContainText('₪');
});

test('TC-I18N-007: language choice persists across a reload', async ({ page }) => {
  await switchLanguage(page, 'English');
  await reloadApp(page);
  await expect(page.locator('h1')).toHaveText('Gallery Catalog');
});

test('TC-I18N-008: the identity picker name list always stays in Hebrew (the picker\'s own heading still translates - only the names are exempt)', async ({ page }) => {
  await switchLanguage(page, 'English');
  await page.click('.chip.user');
  await expect(page.locator('text=Who are you?')).toBeVisible(); // UI chrome - translated like any label
  await expect(page.locator('button:has-text("שרה")')).toBeVisible(); // team name - never translated
});
