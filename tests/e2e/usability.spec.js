// SPEC.md section 19 - sort, filter panel, list view, duplicate, share and
// the screen clean-up. TEST_PLAN.md TC-UX-*.
import { test, expect } from '@playwright/test';
import {
  pickIdentity,
  clearAllData,
  seedItems,
  reloadAndWait,
  getItems,
  openFilters,
  saveItemForm,
} from '../helpers/app.js';

// Seconds apart, not hours: the test must not depend on the time of day
// (an hour ago is "yesterday" just after midnight).
const HOUR = 1000;
const ITEMS = [
  { row_id: 'U1', name: 'אלף', price: 900, serial_number: '000200', sku: 'S-1', size: '50X70', type: 'מקורי', location: 'גלריה', physical_status: 'ממוסגר', notes: 'הערה', availability_status: 'available', image_url: 'https://drive.google.com/thumbnail?id=X1&sz=w1000', last_modified_by: 'שרה', last_modified_at: new Date(Date.now() - 3 * HOUR).toISOString() },
  { row_id: 'U2', name: 'בית', price: 2500, serial_number: '000100', availability_status: 'sold', last_modified_by: 'דב', last_modified_at: new Date(Date.now() - 1 * HOUR).toISOString() },
  { row_id: 'U3', name: 'גימל', availability_status: 'available', last_modified_by: 'שפרה', last_modified_at: new Date(Date.now() - 2 * HOUR).toISOString() },
];

const names = (page, selector = '.card .name') => page.locator(selector).allTextContents();

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, ITEMS);
  await reloadAndWait(page);
});

test('TC-UX-001: sort by price both ways - items without a price last - and the choice is remembered', async ({ page }) => {
  expect(await names(page)).toEqual(['אלף', 'בית', 'גימל']); // default: name
  await page.selectOption('.sort-select select', 'priceHigh');
  expect(await names(page)).toEqual(['בית', 'אלף', 'גימל']);
  await page.selectOption('.sort-select select', 'priceLow');
  expect(await names(page)).toEqual(['אלף', 'בית', 'גימל']);
  await page.selectOption('.sort-select select', 'serial');
  expect(await names(page)).toEqual(['בית', 'אלף', 'גימל']);
  await reloadAndWait(page);
  expect(await names(page)).toEqual(['בית', 'אלף', 'גימל']);
});

test('TC-UX-002: "recently updated" puts the latest change first and shows who and when', async ({ page }) => {
  await expect(page.locator('.modified-line')).toHaveCount(0); // only in this sort
  await page.selectOption('.sort-select select', 'recent');
  expect(await names(page)).toEqual(['בית', 'גימל', 'אלף']);
  await expect(page.locator('.card').first().locator('.modified-line')).toContainText('דב · היום');
});

test('TC-UX-003: duplicate opens a new item with the details - never name, SKU, serial or photo', async ({ page }) => {
  await page.click('.card:has-text("אלף")');
  await page.click('#item-overlay button:has-text("שכפול")');
  await expect(page.locator('#item-overlay h2')).toHaveText('פריט חדש (שכפול של אלף)');
  const form = page.locator('#item-overlay');
  await expect(form.locator('input[type=text]').first()).toHaveValue(''); // name
  await expect(form.locator('.row2 input[type=text]').nth(0)).toHaveValue('50X70'); // size
  await expect(form.locator('.row2 input[type=text]').nth(1)).toHaveValue(''); // sku
  await expect(form.locator('input[type=number]')).toHaveValue('900');
  await expect(form.locator('.field:has-text("מספר סידורי") input')).toHaveValue('');
  await expect(form.locator('textarea')).toHaveValue('הערה');
  await expect(form.locator('.image-preview img')).toHaveCount(0);

  await form.locator('input[type=text]').first().fill('אלף 2');
  await saveItemForm(page);
  const copy = (await getItems(page)).find((it) => it.name === 'אלף 2');
  expect(copy).toMatchObject({ size: '50X70', type: 'מקורי', location: 'גלריה', physical_status: 'ממוסגר', price: 900, sku: null, serial_number: null, availability_status: 'available' });
  expect(copy.row_id).not.toBe('U1');
  expect(await getItems(page)).toHaveLength(4); // the original is untouched
});

test('TC-UX-003b: duplicating with unsaved changes asks to save first, and opens nothing', async ({ page }) => {
  await page.click('.card:has-text("אלף")');
  await page.locator('#item-overlay textarea').fill('שינוי שלא נשמר');
  await page.click('#item-overlay button:has-text("שכפול")');
  await expect(page.locator('#item-overlay')).toContainText('שמרו קודם את השינויים, ואז שכפלו');
  await expect(page.locator('#item-overlay h2')).toHaveText('אלף');
  await expect(page.locator('#item-overlay textarea')).toHaveValue('שינוי שלא נשמר');
});

test('TC-UX-004: filters sit behind one "סינון" button that shows how many are on', async ({ page }) => {
  await expect(page.locator('.filter-group')).toHaveCount(0);
  await openFilters(page);
  await page.selectOption('.filter-group:has-text("זמינות") select', 'sold');
  await page.click('label:has-text("חסר מק")');
  await expect(page.locator('.filters-toggle')).toContainText('סינון · 2');
  await page.click('.filters-toggle'); // close - the filters stay on
  await expect(page.locator('.filter-group')).toHaveCount(0);
  expect(await names(page)).toEqual(['בית']);
  await expect(page.locator('.results-line')).toContainText('מוצגים 1 מתוך 3');
});


test('TC-UX-006: list view - one row per artwork, opens the form, remembered', async ({ page }) => {
  await page.click('button[aria-label="תצוגת רשימה"]');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('.item-row')).toHaveCount(3);
  await expect(page.locator('.item-row:has-text("בית") .row-sold')).toHaveText('נמכר');
  await expect(page.locator('.item-row:has-text("אלף")')).toContainText('$900');
  await reloadAndWait(page);
  await expect(page.locator('.item-row')).toHaveCount(3);
  await page.click('.item-row:has-text("גימל")');
  await expect(page.locator('#item-overlay h2')).toHaveText('גימל');
});

test('TC-UX-007: cards - no "missing" or "available" labels; "sold" only once, on the photo', async ({ page }) => {
  const cards = page.locator('.card');
  await expect(cards.filter({ hasText: 'חסר' })).toHaveCount(0);
  await expect(page.locator('.badge', { hasText: 'זמין' })).toHaveCount(0);
  const sold = page.locator('.card:has-text("בית")');
  await expect(sold.locator('.ribbon')).toHaveText('נמכר');
  await expect(sold.getByText('נמכר')).toHaveCount(1);
});

test('TC-UX-008: ⚙ is a menu with "manage lists" and "sign out"; no separate 🔐 button; Esc closes it', async ({ page }) => {
  await expect(page.locator('header button', { hasText: '🔐' })).toHaveCount(0);
  await page.click('button[title="תפריט"]');
  const menu = page.locator('.header-menu-list');
  await expect(menu.locator('> button', { hasText: 'ניהול רשימות' })).toHaveCount(1);
  await expect(menu.locator('> button', { hasText: 'התנתקות' })).toHaveCount(1); // full order: TC-SET-001
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await page.click('button[title="תפריט"]');
  await page.click('h1 >> xpath=..'); // a click outside
  await expect(menu).toHaveCount(0);
});

test('TC-UX-009: the summary shows only the total until opened, and stays as chosen', async ({ page }) => {
  await expect(page.locator('.stats-toggle')).toContainText('סה"כ פריטים: 3');
  await expect(page.locator('.stats')).toHaveCount(0);
  await page.click('.stats-toggle');
  await expect(page.locator('.stats')).toBeVisible();
  await reloadAndWait(page);
  await expect(page.locator('.stats')).toBeVisible();
});
