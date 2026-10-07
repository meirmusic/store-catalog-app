// SPEC.md sections 20 and 27 - the unique serial number and inventory value.
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

const serialError = (page) => page.locator('#item-serial-error');

test('TC-DUP-001: a serial number already in use is blocked - the message is under the field, the cursor in it, nothing saved', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'חדשה', serial: ' 112345 ' });
  await page.click(SAVE);
  await expect(serialError(page)).toHaveText('המספר הסידורי 112345 כבר קיים ביצירה "שביל תפילה" - מספר סידורי הוא מזהה ייחודי, יש להזין מספר אחר');
  await expect(page.locator('.field:has-text("מספר סידורי") input')).toBeFocused();
  await expect(page.locator('#item-overlay')).toBeVisible();
  await expect(page.locator('[role=alertdialog]')).toHaveCount(0); // no "save anyway"
  expect(await getItems(page)).toHaveLength(4);
  // another number - saves
  await page.locator('.field:has-text("מספר סידורי") input').fill('112346');
  await expect(serialError(page)).toHaveCount(0);
  await page.click(SAVE);
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  expect(await getItems(page)).toHaveLength(5);
});

test('TC-DUP-002: a SKU may repeat - saved with no message at all', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'הדפס', sku: 'SKU-7' });
  await page.click(SAVE);
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  expect((await getItems(page)).filter((it) => it.sku === 'SKU-7')).toHaveLength(2);
});

test('TC-DUP-003: an unchanged serial number is not checked - an old artwork that already shares one still saves other changes', async ({ page }) => {
  await seedItems(page, [{ row_id: 'V5', name: 'תאומה', serial_number: '112345' }]);
  await reloadAndWait(page);
  await page.click('.card:has-text("תאומה")');
  await page.locator('#item-overlay textarea').fill('רק הערה');
  await page.click(SAVE);
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  expect((await getItems(page)).find((it) => it.row_id === 'V5').notes).toBe('רק הערה');
});

test('TC-DUP-004: an artwork\'s own number, a deleted artwork\'s number, and an empty one are fine', async ({ page }) => {
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
  expect(await serialError(page).count()).toBe(0);
});

test('TC-VAL-001: the summary line at the top shows the count only - no money total (SPEC.md 27.2)', async ({ page }) => {
  await expect(page.locator('.stats-toggle')).toHaveText(/סה"כ פריטים: 4\s*$/);
  await expect(page.locator('.stats-toggle')).not.toContainText('$');
});

test('TC-VAL-002: the breakdown shows value by type and by location, and says what wasn\'t counted', async ({ page }) => {
  await page.click('.stats-toggle');
  const byType = page.locator('.value-group', { hasText: 'שווי לפי סוג' });
  await expect(byType.locator('.value-row')).toHaveText(['מקורי (2)$3,500']);
  const byLocation = page.locator('.value-group', { hasText: 'שווי לפי מיקום' });
  await expect(byLocation.locator('.value-row')).toHaveText(['מחסן (1)$2,500', 'גלריה (1)$1,000']);
  await expect(page.locator('.value-note')).toHaveText('1 יצירות זמינות בלי מחיר לא נספרו');
});

test('TC-VAL-003: with a filter on, the results line shows the count only; the value inside the breakdown updates with changes', async ({ page }) => {
  await openFilters(page);
  await page.selectOption('.filter-group:has-text("מיקום") select', { label: 'גלריה' });
  await expect(page.locator('.results-line')).toContainText('מוצגים 3 מתוך 4');
  await expect(page.locator('.results-line')).not.toContainText('$');

  await page.click('.card:has-text("שביל תפילה")');
  await page.fill('#item-overlay input[type=number]', '1500');
  await page.click(SAVE);
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  await page.click('.stats-toggle');
  await expect(page.locator('.value-group', { hasText: 'שווי לפי סוג' }).locator('.value-row')).toHaveText(['מקורי (2)$4,000']);
});
