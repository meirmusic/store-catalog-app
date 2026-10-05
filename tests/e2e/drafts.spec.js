// SPEC.md 26.2 - a form that was interrupted comes back as a draft.
// TEST_PLAN.md TC-DRAFT-*.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, getItems } from '../helpers/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTO = path.join(__dirname, '../fixtures/sample-image.jpg');
const ITEM = { row_id: 'D1', name: 'זריחה בגליל', size: '50X70', sku: 'SKU-1', serial_number: '123456', price: 900, notes: '', availability_status: 'available' };
const DRAFT_SAVED_MS = 900; // the draft is kept half a second after typing

async function clearDrafts(page) {
  await page.evaluate(async () => { const m = await import('/src/db/db.js'); await m.db.drafts.clear(); });
}
async function updateItem(page, rowId, fields) {
  await page.evaluate(async ({ rowId, fields }) => { const m = await import('/src/db/db.js'); await m.db.items.update(rowId, fields); }, { rowId, fields });
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await clearDrafts(page);
  await seedItems(page, [ITEM]);
  await reloadAndWait(page);
});

test('TC-DRAFT-001: edits interrupted by a reload come back - the banner offers them, "restore" reopens the form with them', async ({ page }) => {
  await page.click('.card .name');
  await page.locator('#item-overlay textarea').fill('להחליף מסגרת');
  await page.locator('#item-overlay input[type=number]').fill('1200');
  await page.waitForTimeout(DRAFT_SAVED_MS);
  await reloadAndWait(page); // the app closed mid-edit
  const banner = page.locator('.draft-banner');
  await expect(banner).toContainText('יש טיוטה שלא נשמרה: זריחה בגליל');
  await expect(banner).toContainText('היום');
  await banner.locator('button', { hasText: 'שחזור' }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator('#item-overlay h2')).toHaveText('זריחה בגליל');
  await expect(page.locator('#item-overlay textarea')).toHaveValue('להחליף מסגרת');
  await expect(page.locator('#item-overlay input[type=number]')).toHaveValue('1200');
  await page.click('#item-overlay button:has-text("ביטול")');
  await expect(page.locator('.discard-confirm')).toBeVisible(); // counts as unsaved changes
});

test('TC-DRAFT-002: "delete draft" removes it for good', async ({ page }) => {
  await page.click('.card .name');
  await page.locator('#item-overlay textarea').fill('טיוטה');
  await page.waitForTimeout(DRAFT_SAVED_MS);
  await reloadAndWait(page);
  await page.click('.draft-banner button:has-text("מחיקת הטיוטה")');
  await expect(page.locator('.draft-banner')).toHaveCount(0);
  await reloadAndWait(page);
  await expect(page.locator('.draft-banner')).toHaveCount(0);
});

test('TC-DRAFT-003: closing the form the normal way leaves no draft - save, "leave without saving", cancel without changes', async ({ page }) => {
  // save
  await page.click('.card .name');
  await page.locator('#item-overlay textarea').fill('נשמר');
  await page.waitForTimeout(DRAFT_SAVED_MS);
  await page.click('#item-overlay button:has-text("שמירה")');
  await expect(page.locator('#item-overlay')).toHaveCount(0);
  // leave without saving
  await page.click('.card .name');
  await page.locator('#item-overlay textarea').fill('לא נשמר');
  await page.waitForTimeout(DRAFT_SAVED_MS);
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.click('.discard-confirm button.danger');
  await expect(page.locator('#item-overlay')).toHaveCount(0);
  await reloadAndWait(page);
  await expect(page.locator('.draft-banner')).toHaveCount(0);
  expect((await getItems(page))[0].notes).toBe('נשמר');
});

test('TC-DRAFT-004: a new item with a photo - restored with its name and photo', async ({ page }) => {
  await page.click('button:has-text("פריט חדש")');
  await page.locator('#item-overlay input[type=text]').first().fill('יצירה חדשה');
  await page.locator('#item-overlay input[type=file]').first().setInputFiles(PHOTO);
  await page.waitForSelector('#item-overlay img[src^="data:"]');
  await page.waitForTimeout(DRAFT_SAVED_MS);
  await reloadAndWait(page);
  await expect(page.locator('.draft-banner')).toContainText('יצירה חדשה');
  await page.click('.draft-banner button:has-text("שחזור")');
  await expect(page.locator('#item-overlay h2')).toHaveText('פריט חדש');
  await expect(page.locator('#item-overlay input[type=text]').first()).toHaveValue('יצירה חדשה');
  await expect(page.locator('#item-overlay img[src^="data:"]')).toHaveCount(1);
});

test('TC-DRAFT-005: only the changed fields come back - a change made meanwhile in another field is kept', async ({ page }) => {
  await page.click('.card .name');
  await page.locator('#item-overlay textarea').fill('מהטיוטה');
  await page.waitForTimeout(DRAFT_SAVED_MS);
  await reloadAndWait(page);
  await updateItem(page, 'D1', { price: 3333, location: 'מחסן' }); // e.g. from another device
  await page.click('.draft-banner button:has-text("שחזור")');
  await expect(page.locator('#item-overlay textarea')).toHaveValue('מהטיוטה');
  await expect(page.locator('#item-overlay input[type=number]')).toHaveValue('3333');
});

test('TC-DRAFT-006: the artwork was deleted meanwhile - restore opens a new item with the details, without SKU and serial', async ({ page }) => {
  await page.click('.card .name');
  await page.locator('#item-overlay input[type=text]').first().fill('זריחה בגליל 2');
  await page.locator('#item-overlay textarea').fill('הערה');
  await page.locator('#item-overlay .row2 input[type=text]').nth(1).fill('SKU-NEW');
  await page.waitForTimeout(DRAFT_SAVED_MS);
  await reloadAndWait(page);
  await updateItem(page, 'D1', { is_deleted: true });
  await page.click('.draft-banner button:has-text("שחזור")');
  await expect(page.locator('#item-overlay h2')).toHaveText('פריט חדש');
  await expect(page.locator('#item-overlay input[type=text]').first()).toHaveValue('זריחה בגליל 2');
  await expect(page.locator('#item-overlay textarea')).toHaveValue('הערה');
  await expect(page.locator('#item-overlay .row2 input[type=text]').nth(1)).toHaveValue('');
});

test('TC-DRAFT-007: the draft stays on the device - nothing typed is sent anywhere before saving', async ({ page }) => {
  const sent = [];
  page.on('request', (req) => { if (req.method() === 'POST') sent.push(req.postData() || ''); });
  await page.click('.card .name');
  await page.locator('#item-overlay textarea').fill('סוד-של-טיוטה');
  await page.waitForTimeout(DRAFT_SAVED_MS);
  await reloadAndWait(page);
  await page.waitForTimeout(500);
  expect(sent.some((b) => b.includes('סוד-של-טיוטה'))).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('סוד-של-טיוטה'); // not in the error log either
});
