// SPEC.md section 20 - duplicate serial/SKU warning and inventory value.
// TEST_PLAN.md TC-DUP-*, TC-VAL-*.
import { test, expect } from '@playwright/test';
import {
  pickIdentity,
  clearAllData,
  seedItems,
  reloadAndWait,
  getItems,
  openNewItemForm,
  fillItemForm,
  openFilters,
} from '../helpers/app.js';

const ITEMS = [
  { row_id: 'V1', name: 'שביל תפילה', serial_number: '112345', sku: 'SKU-7', type: 'מקורי', location: 'גלריה', price: 1000, availability_status: 'available' },
  { row_id: 'V2', name: 'זריחה', type: 'מקורי', location: 'מחסן', price: 2500, availability_status: 'available' },
  { row_id: 'V3', name: 'נמכרה', type: 'מיקס מדיה', location: 'גלריה', price: 9000, availability_status: 'sold' },
  { row_id: 'V4', name: 'בלי מחיר', type: 'מיקס מדיה', location: 'גלריה', availability_status: 'available' },
];

const SAVE = '#item-overlay button[type=submit]';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, ITEMS);
  await reloadAndWait(page);
});

test('TC-DUP-001: a serial number already in use warns - "back to editing" keeps the form, nothing saved', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'חדשה', serial: ' 112345 ' });
  await page.click(SAVE);
  const dialog = page.locator('.duplicate-confirm');
  await expect(dialog).toContainText('המספר הסידורי 112345 כבר קיים ביצירה "שביל תפילה". לשמור בכל זאת?');
  await expect(dialog.locator('button:has-text("חזרה לעריכה")')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#item-overlay')).toBeVisible();
  expect(await getItems(page)).toHaveLength(4);
});

test('TC-DUP-002: SKU in another case warns too; both lines when both repeat; "save anyway" saves', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'חדשה', sku: 'sku-7', serial: '112345' });
  await page.click(SAVE);
  const dialog = page.locator('.duplicate-confirm');
  await expect(dialog).toContainText('המספר הסידורי 112345');
  await expect(dialog).toContainText('המק"ט sku-7 כבר קיים ביצירה "שביל תפילה"');
  await dialog.locator('button:has-text("שמירה בכל זאת")').click();
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  expect(await getItems(page)).toHaveLength(5);
});

test('TC-DUP-003: an unchanged value does not warn - editing other fields of an item that already shares one', async ({ page }) => {
  await seedItems(page, [{ row_id: 'V5', name: 'תאומה', serial_number: '112345' }]);
  await reloadAndWait(page);
  await page.click('.card:has-text("תאומה")');
  await page.locator('#item-overlay textarea').fill('רק הערה');
  await page.click(SAVE);
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  await expect(page.locator('.duplicate-confirm')).toHaveCount(0);
});

test('TC-DUP-004: an item\'s own value, a deleted item\'s value, and an empty value never warn', async ({ page }) => {
  await page.click('.card:has-text("שביל תפילה")');
  await page.locator('.field:has-text("מספר סידורי") input').fill('112345 '); // its own, just retyped
  await page.click(SAVE);
  await page.waitForSelector('#item-overlay', { state: 'detached' });

  await seedItems(page, [{ row_id: 'GONE', name: 'נמחקה', serial_number: '999999', is_deleted: true }]);
  await reloadAndWait(page);
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'חדשה', serial: '999999' });
  await page.click(SAVE);
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  await expect(page.locator('.duplicate-confirm')).toHaveCount(0);
});

test('TC-VAL-001: the summary shows the value of available items with a price', async ({ page }) => {
  // 1000 + 2500 (available, priced); the sold 9000 and the unpriced one don't count
  await expect(page.locator('.stats-toggle')).toContainText('סה"כ פריטים: 4 · שווי הזמינים: $3,500');
});

test('TC-VAL-002: the breakdown shows value by type and by location, and says what wasn\'t counted', async ({ page }) => {
  await page.click('.stats-toggle');
  const byType = page.locator('.value-group', { hasText: 'שווי לפי סוג' });
  await expect(byType.locator('.value-row')).toHaveText(['מקורי (2)$3,500']);
  const byLocation = page.locator('.value-group', { hasText: 'שווי לפי מיקום' });
  await expect(byLocation.locator('.value-row')).toHaveText(['מחסן (1)$2,500', 'גלריה (1)$1,000']);
  await expect(page.locator('.value-note')).toHaveText('1 יצירות זמינות בלי מחיר לא נספרו');
});

test('TC-VAL-003: with a filter on, the results line shows the value of what is shown, and it updates with changes', async ({ page }) => {
  await openFilters(page);
  await page.selectOption('.filter-group:has-text("מיקום") select', { label: 'גלריה' });
  await expect(page.locator('.results-line')).toContainText('מוצגים 3 מתוך 4 · שווי הזמינים: $1,000');

  await page.click('.card:has-text("שביל תפילה")');
  await page.fill('#item-overlay input[type=number]', '1500');
  await page.click(SAVE);
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  await expect(page.locator('.results-line')).toContainText('שווי הזמינים: $1,500');
  await expect(page.locator('.stats-toggle')).toContainText('$4,000');
});
