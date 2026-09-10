// TC-SRCH-* from TEST_PLAN.md.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems } from '../helpers/app.js';

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
  await page.reload();
  await page.waitForSelector('text=קטלוג הגלריה');
});

test('TC-SRCH-001: sku search is partial/textual and can return multiple items', async ({ page }) => {
  await page.fill('input[placeholder*="מק"]', '302');
  await expect(page.locator('.card')).toHaveCount(3); // 3022, 3021, 3020 all contain "302"
});

// Known gap per TEST_PLAN.md (SRCH-02): serial-number search is spec'd as
// EXACT match only, but the current implementation does a partial/substring
// match same as name/sku. This test documents the intended, correct
// behavior and is expected to fail until that's fixed (see task #15).
test('TC-SRCH-002: serial number search should be exact-match only', async ({ page }) => {
  test.fail(true, 'Known gap SRCH-02 (TEST_PLAN.md) - matchesSearch() uses .includes() for serial_number too');
  await page.fill('input[placeholder*="מק"]', '112'); // substring of A2's "112345", not an exact match
  await expect(page.locator('.card')).toHaveCount(0); // exact-match spec says this should NOT match
});

test('TC-SRCH-003: "missing price" filter shows only items without a price', async ({ page }) => {
  await page.click('label:has-text("חסר מחיר")');
  await expect(page.locator('.card')).toHaveCount(2); // A2, A3
});

test('TC-SRCH-004: "missing sku" filter shows only items without a sku', async ({ page }) => {
  await page.click('label:has-text("חסר מק")');
  await expect(page.locator('.card')).toHaveCount(1); // A4
});

test('TC-SRCH-005: availability filter narrows to sold/available correctly', async ({ page }) => {
  await page.selectOption('.filter-group:has-text("זמינות") select', { label: 'נמכר' });
  await expect(page.locator('.card')).toHaveCount(1); // A2
  await expect(page.locator('.card')).toContainText('שביל תפילה');
});

test('TC-SRCH-006: combining location + type filters intersects (AND), not union', async ({ page }) => {
  await page.selectOption('.filter-group:has-text("מיקום") select', { label: 'גלריה' }); // A1, A4
  await page.selectOption('.filter-group:has-text("סוג") select', { label: 'מקורי' }); // A1, A4 (both already 'מקורי')
  await expect(page.locator('.card')).toHaveCount(2);

  await page.selectOption('.filter-group:has-text("סוג") select', { label: 'מיקס מדיה' }); // now: גלריה AND מיקס מדיה = none
  await expect(page.locator('.card')).toHaveCount(0);
});

test('TC-SRCH-007 (documents existing UX gap): a new item outside the active filter saves but silently disappears', async ({ page }) => {
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
  await page.selectOption('.filter-group:has-text("מיקום") select', { label: 'הכל' });
  await expect(page.locator('.card')).toHaveCount(5);
});
