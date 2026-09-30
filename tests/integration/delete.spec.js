// Deleting an item - SPEC.md section 11, TEST_PLAN.md TC-DEL-*.
// The Apps Script boundary is mocked with page.route().
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pickIdentity,
  clearAllData,
  getItems,
  getPendingChanges,
  seedItems,
  reloadAndWait,
  clickRefresh,
  openNewItemForm,
  fillItemForm,
  saveItemForm,
} from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const SAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'sample-image.jpg');

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
});

async function deleteFirstCard(page, name) {
  await page.locator('.card', { hasText: name }).click();
  await page.waitForSelector('#item-overlay');
  await page.click('#item-overlay .danger-btn');
  await page.click('.confirm-modal button.danger');
}

// REG-023: the server stops returning an item once it's deleted anywhere,
// but the app never removed items the server stopped returning - so an
// item deleted on one device stayed on every other device forever.
test('REG-023: an item deleted on another device disappears here on the next sync', async ({ page }) => {
  const keep = { row_id: 'KEEP', name: 'נשאר', is_deleted: false };
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [keep], config: {} } });
    return route.fulfill({ json: { ok: true } });
  });
  await seedItems(page, [keep, { row_id: 'GONE', name: 'נמחק במכשיר אחר' }]);
  await reloadAndWait(page);
  await clickRefresh(page);

  await expect(page.locator('.card', { hasText: 'נמחק במכשיר אחר' })).toHaveCount(0);
  await expect(page.locator('.card', { hasText: 'נשאר' })).toHaveCount(1);
  expect((await getItems(page)).map((it) => it.row_id)).toEqual(['KEEP']);
});

test('TC-DEL-001: an item with a change not sent yet is never removed by a sync', async ({ page }) => {
  const keep = { row_id: 'KEEP', name: 'נשאר', is_deleted: false };
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [keep], config: {} } });
    return route.fulfill({ json: { error: 'push failed' } }); // the new item can't be sent yet
  });
  await seedItems(page, [keep]);
  await reloadAndWait(page);
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'חדש שעוד לא נשלח' });
  await saveItemForm(page);
  await clickRefresh(page);
  await expect.poll(async () => (await getPendingChanges(page))[0]?.attempts || 0).toBeGreaterThanOrEqual(1);

  await expect(page.locator('.card', { hasText: 'חדש שעוד לא נשלח' })).toHaveCount(1);
});

test('TC-DEL-002: an entirely empty server answer removes nothing (treated as a server problem)', async ({ page }) => {
  await page.route(MOCK_URL, async (route) => route.fulfill({ json: { items: [], config: {} } }));
  await seedItems(page, [{ row_id: 'A', name: 'פריט א' }, { row_id: 'B', name: 'פריט ב' }]);
  await reloadAndWait(page);
  await clickRefresh(page);
  await page.waitForTimeout(800);
  expect(await getItems(page)).toHaveLength(2);
});

// REG-024: the delete was sent with the row id only, so the Sheet's
// "last modified by" was blanked instead of recording who deleted.
test('REG-024: a delete records who deleted it', async ({ page }) => {
  const bodies = [];
  const item = { row_id: 'DEL', name: 'למחיקה', is_deleted: false };
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    bodies.push(body);
    if (body.action === 'getAll') return route.fulfill({ json: { items: [item], config: {} } });
    return route.fulfill({ json: { ok: true } });
  });
  await seedItems(page, [item]);
  await reloadAndWait(page);
  await deleteFirstCard(page, 'למחיקה');

  await expect.poll(() => bodies.find((b) => b.action === 'softDelete')?.payload).toEqual({ row_id: 'DEL', last_modified_by: 'שרה' });
});

test('TC-DEL-003: "ביטול" in the "deleted" message brings the item back, even after the delete reached the server', async ({ page }) => {
  const actions = [];
  let serverItems = [{ row_id: 'UNDO', name: 'יחזור', is_deleted: false }];
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    actions.push(body);
    if (body.action === 'getAll') return route.fulfill({ json: { items: serverItems, config: {} } });
    if (body.action === 'softDelete') serverItems = [];
    if (body.action === 'upsert') serverItems = [{ ...body.payload }];
    return route.fulfill({ json: { ...body.payload } });
  });
  await seedItems(page, serverItems);
  await reloadAndWait(page);
  await deleteFirstCard(page, 'יחזור');

  const toast = page.locator('.toast');
  await expect(toast).toContainText('הפריט נמחק');
  await expect.poll(() => actions.some((a) => a.action === 'softDelete')).toBe(true); // already sent
  await expect(page.locator('.card', { hasText: 'יחזור' })).toHaveCount(0);

  await toast.locator('.toast-action').click();
  await expect(page.locator('.toast')).toContainText('הפריט הוחזר');
  await expect(page.locator('.card', { hasText: 'יחזור' })).toHaveCount(1);
  await expect.poll(() => actions.find((a) => a.action === 'upsert')?.payload?.is_deleted).toBe(false);
  await expect.poll(async () => (await getPendingChanges(page)).length).toBe(0);
  await clickRefresh(page);
  await page.waitForTimeout(500);
  await expect(page.locator('.card', { hasText: 'יחזור' })).toHaveCount(1);
});

test('TC-DEL-004: the "synced" message doesn\'t replace the "deleted - undo" message', async ({ page }) => {
  const item = { row_id: 'STAY', name: 'הודעה נשארת', is_deleted: false };
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [item], config: {} } });
    return route.fulfill({ json: { ok: true } });
  });
  await seedItems(page, [item]);
  await reloadAndWait(page);
  await deleteFirstCard(page, 'הודעה נשארת');
  await expect.poll(async () => (await getPendingChanges(page)).length).toBe(0); // the delete synced
  await expect(page.locator('.toast')).toContainText('הפריט נמחק');
  await expect(page.locator('.toast .toast-action')).toHaveText('ביטול');
});

test('TC-DEL-005: deleting an item cancels its photo upload that was still waiting', async ({ page }) => {
  let uploads = 0;
  let serverUp = false;
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (!serverUp) return route.abort();
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'uploadImage') uploads++;
    return route.fulfill({ json: { ok: true, image_url: 'https://drive.google.com/thumbnail?id=X&sz=w1000' } });
  });
  await reloadAndWait(page);
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'תמונה ואז מחיקה', imagePath: SAMPLE });
  await saveItemForm(page);
  await deleteFirstCard(page, 'תמונה ואז מחיקה');

  expect((await getPendingChanges(page)).map((c) => c.op)).not.toContain('uploadImage');
  serverUp = true;
  await clickRefresh(page);
  await expect.poll(async () => (await getPendingChanges(page)).length, { timeout: 5000 }).toBe(0);
  expect(uploads).toBe(0);
});

test('TC-DEL-006: the confirm dialog asks "למחוק את הפריט?", starts on "ביטול", and Esc cancels', async ({ page }) => {
  await seedItems(page, [{ row_id: 'ESC', name: 'לא יימחק' }]);
  await reloadAndWait(page);
  await page.locator('.card', { hasText: 'לא יימחק' }).click();
  await page.waitForSelector('#item-overlay');
  await page.click('#item-overlay .danger-btn');

  const dialog = page.locator('.confirm-modal');
  await expect(dialog.locator('h2')).toHaveText('למחוק את הפריט?');
  await expect(dialog.locator('button:has-text("ביטול")')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#item-overlay')).toBeVisible();
  expect((await getItems(page))[0].is_deleted).toBeFalsy();
});
