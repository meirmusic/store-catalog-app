// Comprehensive coverage of the photo upload/update lifecycle, added after
// a real user report ("uploaded photos don't appear") surfaced REG-011 (an
// upsert response could stomp a real Drive URL) and REG-012 (Apps Script
// could silently "succeed" uploading a photo for a row that was never
// actually created). See TEST_PLAN.md REG-011/REG-012.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pickIdentity,
  clearAllData,
  seedItems,
  openNewItemForm,
  fillItemForm,
  saveItemForm,
  getItems,
  getPendingChanges,
  reloadApp,
} from '../helpers/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_IMAGE = path.join(__dirname, '..', 'fixtures', 'sample-image.jpg');
const MOCK_URL = 'https://mock-apps-script.test/exec';

async function readAction(route) {
  return JSON.parse(route.request().postData());
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
});

test('a brand-new item with a photo ends up with the real Drive URL after sync', async ({ page }) => {
  const REAL_URL = 'https://drive.google.com/thumbnail?id=NEW1&sz=w1000';
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'upsert') return route.fulfill({ json: { ...body.payload, image_url: '' } });
    if (body.action === 'uploadImage') return route.fulfill({ json: { image_url: REAL_URL } });
    return route.fulfill({ json: { ok: true } });
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'פריט עם תמונה', imagePath: SAMPLE_IMAGE });
  await saveItemForm(page);

  await page.click('.icon-btn[title]');
  await page.waitForTimeout(500);

  const items = await getItems(page);
  expect(items[0].image_url).toBe(REAL_URL);
  expect(await getPendingChanges(page)).toHaveLength(0);
});

test('replacing an existing photo ends up with the new URL, not the old one', async ({ page }) => {
  const OLD_URL = 'https://drive.google.com/thumbnail?id=OLD&sz=w1000';
  const NEW_URL = 'https://drive.google.com/thumbnail?id=NEW2&sz=w1000';
  await seedItems(page, [{ row_id: 'REPL1', name: 'להחלפת תמונה', image_url: OLD_URL }]);

  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'upsert') return route.fulfill({ json: { ...body.payload } });
    if (body.action === 'uploadImage') return route.fulfill({ json: { image_url: NEW_URL } });
    return route.fulfill({ json: { ok: true } });
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await fillItemForm(page, { imagePath: SAMPLE_IMAGE });
  await saveItemForm(page);

  await page.click('.icon-btn[title]');
  await page.waitForTimeout(500);

  const items = await getItems(page);
  expect(items[0].image_url).toBe(NEW_URL);
});

// REG-012: the client queues an item's 'upsert' (row creation) and its
// 'uploadImage' as two independent changes - if 'upsert' is still failing
// when 'uploadImage' is attempted, the fixed Apps Script now refuses the
// upload (see Code.gs handleUploadImage) instead of silently uploading an
// orphan Drive file with nothing pointing to it. The client must leave the
// change queued (not lose it) so it retries once the row actually exists.
test('REG-012: uploadImage is retried, not lost, if the row was not created yet', async ({ page }) => {
  let upsertShouldFail = true;
  const REAL_URL = 'https://drive.google.com/thumbnail?id=NEW3&sz=w1000';

  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'upsert') {
      if (upsertShouldFail) return route.fulfill({ json: { error: 'simulated upsert failure' } });
      return route.fulfill({ json: { ...body.payload } });
    }
    if (body.action === 'uploadImage') {
      // Mirrors Code.gs's real fix: refuses until the row exists.
      if (upsertShouldFail) return route.fulfill({ json: { error: 'row not found - upsert has not been saved yet' } });
      return route.fulfill({ json: { image_url: REAL_URL } });
    }
    return route.fulfill({ json: { ok: true } });
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'עם תמונה שממתינה', imagePath: SAMPLE_IMAGE });
  await saveItemForm(page);

  // First sync cycle: both upsert and uploadImage fail (row not created
  // yet) - both changes must stay queued, not be silently dropped.
  await page.click('.icon-btn[title]');
  await page.waitForTimeout(500);
  let pending = await getPendingChanges(page);
  expect(new Set(pending.map((c) => c.op))).toEqual(new Set(['upsert', 'uploadImage']));
  let items = await getItems(page);
  expect(items[0].image_url == null).toBe(true); // no orphan URL adopted

  // The row now saves successfully - a later sync cycle must retry both
  // and end up with the real photo, none of it lost.
  upsertShouldFail = false;
  await page.click('.icon-btn[title]');
  await page.waitForTimeout(500);

  pending = await getPendingChanges(page);
  expect(pending).toHaveLength(0);
  items = await getItems(page);
  expect(items[0].image_url).toBe(REAL_URL);
});

// SPEC.md "מדיניות כשלים": a change that keeps failing must stay visibly
// flagged, never fail silently forever - this must hold for uploadImage
// specifically, not just upsert (TC-SYNC-004 already covers upsert).
test('a photo upload that keeps failing trips the visible sync-problem indicator', async ({ page }) => {
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'upsert') return route.fulfill({ json: { ...body.payload } });
    if (body.action === 'uploadImage') return route.fulfill({ json: { error: 'simulated upload failure' } });
    return route.fulfill({ json: { ok: true } });
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'תמונה שתמיד נכשלת', imagePath: SAMPLE_IMAGE });
  await saveItemForm(page);

  for (let i = 0; i < 5; i++) {
    await page.click('.icon-btn[title]');
    await page.waitForTimeout(300);
  }

  const pendingChip = page.locator('.chip', { hasText: 'ממתינים' });
  const style = await pendingChip.getAttribute('style');
  expect(style).toContain('border-color');

  // Crucially: the item must never look like it has a broken/blank photo
  // silently - image_url stays null (no partial/garbage state), and the
  // pending change (not the photo) is what's visibly flagged.
  const items = await getItems(page);
  expect(items[0].image_url == null).toBe(true);
});

test('adding a photo while offline queues it, then syncs once back online', async ({ page, context }) => {
  const REAL_URL = 'https://drive.google.com/thumbnail?id=OFFLINE1&sz=w1000';
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'upsert') return route.fulfill({ json: { ...body.payload } });
    if (body.action === 'uploadImage') return route.fulfill({ json: { image_url: REAL_URL } });
    return route.fulfill({ json: { ok: true } });
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'תמונה אופליין', imagePath: SAMPLE_IMAGE });
  await saveItemForm(page);

  expect(await getPendingChanges(page)).toHaveLength(2);
  let items = await getItems(page);
  expect(items[0].image_url == null).toBe(true);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(500);

  expect(await getPendingChanges(page)).toHaveLength(0);
  items = await getItems(page);
  expect(items[0].image_url).toBe(REAL_URL);
});
