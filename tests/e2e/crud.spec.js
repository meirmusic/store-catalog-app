// TC-CRUD-*, TC-DM-* from TEST_PLAN.md.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pickIdentity,
  clearAllData,
  getItems,
  getPendingChanges,
  openNewItemForm,
  fillItemForm,
  saveItemForm,
  cancelItemForm,
  reloadApp,
} from '../helpers/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_IMAGE = path.join(__dirname, '..', 'fixtures', 'sample-image.jpg');

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
});

test('TC-CRUD-001: add item with only a name - saves and appears in the list', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'יצירת בדיקה' });
  await saveItemForm(page);

  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('יצירת בדיקה');

  const items = await getItems(page);
  expect(items).toHaveLength(1);
  expect(items[0].serial_number).toBeNull();
  expect(items[0].price).toBeNull();
});

test('TC-CRUD-003: adding with an empty name is rejected', async ({ page }) => {
  await openNewItemForm(page);
  // Click directly (not via saveItemForm) - the form is expected to stay
  // open, so waiting for it to detach would just burn the test timeout.
  await page.click('#item-overlay button:has-text("שמירה")');
  await expect(page.locator('#item-overlay')).toBeVisible();
  await expect(page.locator('text=יש להזין שם ליצירה')).toBeVisible();

  const items = await getItems(page);
  expect(items).toHaveLength(0);
});

test('TC-CRUD-002: editing an existing item fills in previously-missing fields', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'פריט לעריכה' });
  await saveItemForm(page);

  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await fillItemForm(page, { price: 4200 });
  await saveItemForm(page);

  const items = await getItems(page);
  expect(items).toHaveLength(1);
  expect(String(items[0].price)).toBe('4200');
});

test('TC-CRUD-004: marking sold requires no confirmation dialog and shows the ribbon', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'פריט למכירה', sold: true });
  await saveItemForm(page); // must close immediately, no confirm dialog in between

  await expect(page.locator('#item-overlay')).toHaveCount(0);
  await expect(page.locator('.card .ribbon')).toBeVisible();

  const items = await getItems(page);
  expect(items[0].availability_status).toBe('sold');
});

test('TC-CRUD-005: item with no price shows no price line on the card', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'בלי מחיר' });
  await saveItemForm(page);

  await expect(page.locator('.card .price')).toHaveCount(0);
});

test('TC-CRUD-006: delete requires confirmation, then hides the item for good', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'למחיקה' });
  await saveItemForm(page);

  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await page.click('button:has-text("מחיקת פריט")');
  await page.waitForSelector('.confirm-modal');
  await page.click('.confirm-modal button.danger');

  await expect(page.locator('.card')).toHaveCount(0);
  const items = await getItems(page);
  expect(items[0].is_deleted).toBe(true);
});

test('TC-CRUD-007: canceling the delete confirmation keeps the item', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'לא נמחק' });
  await saveItemForm(page);

  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await page.click('button:has-text("מחיקת פריט")');
  await page.waitForSelector('.confirm-modal');
  await page.click('.confirm-modal button:not(.danger)');

  // Canceling the delete confirmation dismisses only that dialog - the
  // item form underneath (also #item-overlay) is expected to stay open.
  await expect(page.locator('.confirm-modal')).toHaveCount(0);
  await expect(page.locator('#item-overlay')).toBeVisible();
  await cancelItemForm(page);

  await expect(page.locator('.card')).toHaveCount(1);
  const items = await getItems(page);
  expect(items[0].is_deleted).toBe(false);
});

test('TC-CRUD-008: canceling add/edit without saving writes nothing', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'לא יישמר' });
  await cancelItemForm(page);

  expect(await getItems(page)).toHaveLength(0);
  expect(await getPendingChanges(page)).toHaveLength(0);
});

test('TC-SYNC-003 / TC-DM: a fresh photo queues its own uploadImage change, not a raw upsert payload', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'עם תמונה', imagePath: SAMPLE_IMAGE });
  await saveItemForm(page);

  const pending = await getPendingChanges(page);
  const ops = pending.map((c) => c.op).sort();
  expect(ops).toEqual(['upsert', 'uploadImage']);

  const uploadChange = pending.find((c) => c.op === 'uploadImage');
  expect(uploadChange.payload.image).toMatch(/^data:image\/jpeg;base64,/);

  // the item row itself must NOT carry the raw base64 - see REG-006.
  const items = await getItems(page);
  expect(items[0].image_url == null || !items[0].image_url.startsWith('data:')).toBe(true);
});
