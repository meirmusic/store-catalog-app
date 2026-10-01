// TC-SRCH-* from TEST_PLAN.md.
import { test, expect } from '@playwright/test';
import {
  pickIdentity,
  clearAllData,
  seedItems,
  reloadApp,
  openFilters,
} from '../helpers/app.js';

const SEED = [
  { row_id: 'A1', name: 'אור בין החומות', sku: '3022', serial_number: '111', location: 'גלריה', type: 'מקורי', physical_status: 'מתוח', availability_status: 'available', price: 4200 },
  { row_id: 'A2', name: 'שביל תפילה', sku: '3021', serial_number: '112345', location: 'אביגדור', type: 'מיקס מדיה', physical_status: 'מגולגל', availability_status: 'sold', price: null },
  { row_id: 'A3', name: 'נשמת הכותל', sku: '3020', serial_number: null, location: 'חיים', type: 'מיקס מדיה', physical_status: 'ממוסגר', availability_status: 'available', price: null },
  { row_id: 'A4', name: 'עלייה לרגל', sku: null, serial_number: '999', location: 'גלריה', type: 'מקורי', physical_status: 'מתוח', availability_status: 'available', price: 1500 },
];

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, SEED);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
});

test('TC-SRCH-001: sku search is partial/textual and can return multiple items', async ({ page }) => {
  await page.fill('input[placeholder*="מק"]', '302');
  await expect(page.locator('.card')).toHaveCount(3); // 3022, 3021, 3020 all contain "302"
});

// Fixed per task #15 (was SRCH-02): serial-number search is spec'd as EXACT
// match only, unlike the partial/textual name/sku match.
test('TC-SRCH-002: serial number search should be exact-match only', async ({ page }) => {
  await page.fill('input[placeholder*="מק"]', '112'); // substring of A2's "112345", not an exact match
  await expect(page.locator('.card')).toHaveCount(0); // exact-match spec says this should NOT match

  await page.fill('input[placeholder*="מק"]', '112345'); // the full, exact serial number
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('שביל תפילה');
});

test('TC-SRCH-003: "missing price" filter shows only items without a price', async ({ page }) => {
  await openFilters(page);
  await page.click('label:has-text("חסר מחיר")');
  await expect(page.locator('.card')).toHaveCount(2); // A2, A3
});

test('TC-SRCH-004: "missing sku" filter shows only items without a sku', async ({ page }) => {
  await openFilters(page);
  await page.click('label:has-text("חסר מק")');
  await expect(page.locator('.card')).toHaveCount(1); // A4
});

test('TC-SRCH-005: availability filter narrows to sold/available correctly', async ({ page }) => {
  await openFilters(page);
  await page.selectOption('.filter-group:has-text("זמינות") select', { label: 'נמכר' });
  await expect(page.locator('.card')).toHaveCount(1); // A2
  await expect(page.locator('.card')).toContainText('שביל תפילה');
});

test('TC-SRCH-006: combining location + type filters intersects (AND), not union', async ({ page }) => {
  await openFilters(page);
  await page.selectOption('.filter-group:has-text("מיקום") select', { label: 'גלריה' }); // A1, A4
  await openFilters(page);
  await page.selectOption('.filter-group:has-text("סוג") select', { label: 'מקורי' }); // A1, A4 (both already 'מקורי')
  await expect(page.locator('.card')).toHaveCount(2);

  await openFilters(page);
  await page.selectOption('.filter-group:has-text("סוג") select', { label: 'מיקס מדיה' }); // now: גלריה AND מיקס מדיה = none
  await expect(page.locator('.card')).toHaveCount(0);
});

test('TC-SRCH-007 (documents existing UX gap): a new item outside the active filter saves but silently disappears', async ({ page }) => {
  await openFilters(page);
  await page.selectOption('.filter-group:has-text("מיקום") select', { label: 'חיים' }); // only A3 visible
  await expect(page.locator('.card')).toHaveCount(1);

  await page.click('button:has-text("פריט חדש")');
  await page.waitForSelector('#item-overlay');
  await page.fill('#item-overlay input[type=text] >> nth=0', 'פריט מחוץ לפילטר');
  const selects = await page.$$('#item-overlay select');
  await selects[1].selectOption({ label: 'גלריה' }); // location != active filter ("חיים")
  await page.click('#item-overlay button:has-text("שמירה")');
  await page.waitForSelector('#item-overlay', { state: 'detached' });

  // Saved successfully but not visible under the current filter, and with
  // no message explaining why - see TEST_PLAN.md SRCH-07 note.
  await expect(page.locator('.card')).toHaveCount(1);
  await openFilters(page);
  await page.selectOption('.filter-group:has-text("מיקום") select', { label: 'הכל' });
  await expect(page.locator('.card')).toHaveCount(5);
});

// REG-025 (SPEC.md section 12): spaces at the start or end of a search -
// common when pasting, or from a phone keyboard - found nothing at all.
test('REG-025: spaces around the search text are ignored', async ({ page }) => {
  await page.fill('.search-box input', '  112345 ');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('שביל תפילה');

  await page.fill('.search-box input', ' שביל ');
  await expect(page.locator('.card')).toHaveCount(1);
});

test('TC-SRCH-006: the search also finds words in the notes', async ({ page }) => {
  await seedItems(page, [{ row_id: 'N1', name: 'בלי מילה בשם', notes: 'פגם קטן בפינה השמאלית' }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.fill('.search-box input', 'פגם');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('בלי מילה בשם');
});

test('TC-SRCH-007: with a search or filter on, "מוצגים X מתוך Y" shows; none when nothing is filtered', async ({ page }) => {
  await expect(page.locator('.results-line')).toHaveCount(0);
  await openFilters(page);
  await page.locator('.filter-group:has-text("מיקום") select').selectOption({ label: 'גלריה' });
  await expect(page.locator('.results-line')).toContainText('מוצגים 2 מתוך 4');
});

test('TC-SRCH-008: "ניקוי סינון" resets every search and filter at once, from the results line and from "no results"', async ({ page }) => {
  await page.fill('.search-box input', 'אין כזה פריט');
  await openFilters(page);
  await page.locator('.filter-group:has-text("זמינות") select').selectOption('sold');
  await openFilters(page);
  await page.click('label:has-text("חסר מחיר")');
  await expect(page.locator('.card')).toHaveCount(0);

  await page.click('.empty-state button:has-text("ניקוי סינון")');
  await expect(page.locator('.card')).toHaveCount(4);
  await expect(page.locator('.search-box input')).toHaveValue('');
  await expect(page.locator('.filter-group:has-text("זמינות") select')).toHaveValue('all');
  await expect(page.locator('.results-line')).toHaveCount(0);

  await openFilters(page);
  await page.locator('.filter-group:has-text("סוג") select').selectOption({ label: 'מקורי' });
  await page.click('.results-line button:has-text("ניקוי סינון")');
  await expect(page.locator('.card')).toHaveCount(4);
});
