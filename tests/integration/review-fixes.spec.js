// SPEC.md section 18 - fixes from the full code review and the "Load failed"
// report. TEST_PLAN.md REG-031..034, TC-ERR-011..014.
import { test, expect } from '@playwright/test';
import {
  pickIdentity,
  clearAllData,
  seedItems,
  reloadAndWait,
  clickRefresh,
  getItems,
  getPendingChanges,
} from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const PHOTO = 'data:image/jpeg;base64,/9j/PENDINGPHOTO';

async function errorQueue(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('gallery_error_log_queue') || '[]'));
}

async function deleteOpenItemThenUndo(page) {
  await page.click('#item-overlay .danger-btn');
  await page.click('.confirm-modal button.danger');
  await page.locator('.toast .toast-action').click();
  await expect(page.locator('.toast')).toContainText('הפריט הוחזר');
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.evaluate(() => localStorage.removeItem('gallery_error_log_queue'));
});

test('REG-032: undo brings the item back as it was when deleted - not as it was when the form opened', async ({ page }) => {
  await seedItems(page, [{ row_id: 'U1', name: 'פריט', image_url: '' }]);
  await reloadAndWait(page);
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  // While the form is open, the item's photo finishes uploading in the background.
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.js');
    await db.items.update('U1', { image_url: 'https://drive.google.com/thumbnail?id=NEW&sz=w1000' });
  });
  await deleteOpenItemThenUndo(page);
  const [item] = await getItems(page);
  expect(item).toMatchObject({ is_deleted: false, image_url: 'https://drive.google.com/thumbnail?id=NEW&sz=w1000' });
});

test('REG-033: undo brings back a photo that had not uploaded yet, still queued to upload', async ({ page }) => {
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    return route.fulfill({ json: { error: 'server busy - another save is in progress' } }); // nothing goes through
  });
  await seedItems(page, [{ row_id: 'U2', name: 'עם תמונה' }]);
  await page.evaluate(async (photo) => {
    const { db } = await import('/src/db/db.js');
    await db.items.update('U2', { pending_image: photo });
    await db.pendingChanges.add({ row_id: 'U2', op: 'uploadImage', payload: { image: photo }, createdAt: Date.now(), attempts: 0 });
  }, PHOTO);
  await reloadAndWait(page);
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await deleteOpenItemThenUndo(page);

  const [item] = await getItems(page);
  expect(item.pending_image).toBe(PHOTO);
  const uploads = (await getPendingChanges(page)).filter((c) => c.op === 'uploadImage');
  expect(uploads).toHaveLength(1);
  expect(uploads[0].payload.image).toBe(PHOTO);
  await expect(page.locator('.card .pending-badge')).toContainText('ממתינה להעלאה');
});

test('REG-034: a new item id never looks like a number', async ({ page }) => {
  await reloadAndWait(page);
  const bad = await page.evaluate(async () => {
    const { uid } = await import('/src/items/ItemsContext.jsx');
    const out = [];
    for (let i = 0; i < 20000; i++) {
      const id = uid();
      if (!/^[A-DF-Z][A-Z2-9]{5}$/.test(id) || !Number.isNaN(Number(id))) out.push(id);
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('REG-034b: an item whose id the Sheet returns as a number stays one item, not two', async ({ page }) => {
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [{ row_id: 234567, name: 'ישן' }], config: {} } });
    return route.fulfill({ json: { ok: true } });
  });
  await seedItems(page, [{ row_id: '234567', name: 'ישן' }]);
  await reloadAndWait(page);
  await clickRefresh(page);
  await page.waitForTimeout(800);
  const items = await getItems(page);
  expect(items).toHaveLength(1);
  expect(items[0].row_id).toBe('234567');
});

test('TC-ERR-011: no connection to the server - the explanation says what to do, in plain words', async ({ page }) => {
  await page.route(MOCK_URL, (route) => route.abort('internetdisconnected'));
  await reloadAndWait(page);
  await clickRefresh(page);
  await page.locator('.chip-problem', { hasText: 'לא עודכן מאז' }).click();
  const toast = page.locator('.toast.error');
  await expect(toast).toContainText('אין חיבור לשרת. בדקו שהאינטרנט עובד');
  await expect(toast).toContainText('עברו מ-Wi-Fi לסלולר');
  await expect(toast.locator('.error-tech')).toContainText('Failed to fetch');
});

test('TC-ERR-012: a failed error-log send is not retried every cycle', async ({ page }) => {
  const logCalls = [];
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'logErrors') { logCalls.push(1); return route.fulfill({ json: { error: 'unknown action: logErrors' } }); }
    return route.fulfill({ json: { ok: true } });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const now = new Date().toISOString();
    localStorage.setItem('gallery_error_log_queue', JSON.stringify([{ code: 'E-TEST', action: 'save', message: 'x', count: 1, first_at: Date.now(), occurred_at: now }]));
  });
  await reloadAndWait(page);
  await expect.poll(() => logCalls.length).toBe(1);
  await clickRefresh(page); await page.waitForTimeout(500);
  await clickRefresh(page); await page.waitForTimeout(500);
  expect(logCalls).toHaveLength(1);
  expect(await errorQueue(page)).toHaveLength(1); // still kept for later
});

test('TC-ERR-013: a failure repeating while the error log is being sent is still counted', async ({ page }) => {
  let release;
  const held = new Promise((r) => { release = r; });
  const logged = [];
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'logErrors') {
      await held;
      logged.push(...body.payload.entries);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('gallery_error_log_queue', JSON.stringify([{
      code: 'E-TEST', action: 'save', message: 'Error: again', count: 1, first_at: Date.now(), occurred_at: new Date().toISOString(),
    }]));
  });
  await reloadAndWait(page);
  await page.waitForTimeout(500); // the send is now in flight, held
  await page.evaluate(async () => {
    const { reportError } = await import('/src/errors/errorReporting.js');
    reportError('save', new Error('again'));
    reportError('save', new Error('again'));
  });
  release();
  await expect.poll(() => logged.length).toBe(1);
  expect(logged[0].count).toBe(1);
  await expect.poll(async () => (await errorQueue(page))[0]?.count).toBe(2); // the 2 repeats, for next time
});

test('TC-ERR-014: an unexpected failure inside syncing is logged once, without an error message every cycle', async ({ page }) => {
  await reloadAndWait(page);
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.js');
    db.pendingChanges.toArray = () => Promise.reject(new Error('storage broke'));
  });
  await clickRefresh(page); await page.waitForTimeout(400);
  await clickRefresh(page); await page.waitForTimeout(400);
  await expect(page.locator('.toast.error')).toHaveCount(0);
  const queue = await errorQueue(page);
  expect(queue.filter((e) => e.action === 'sync')).toHaveLength(1);
  expect(queue.find((e) => e.action === 'sync').count).toBeGreaterThanOrEqual(2);
});

test('TC-LST-012b: export defuses a formula hidden behind a leading tab or line break', async ({ page }) => {
  await reloadAndWait(page);
  const csv = await page.evaluate(async () => {
    const { itemsToCsv } = await import('/src/items/exportCsv.js');
    return itemsToCsv([{ name: '\t=HYPERLINK("x")', notes: '\n+1' }], (k) => k);
  });
  expect(csv).toContain(' \t=HYPERLINK');
  expect(csv).toContain('" \n+1"');
});

test('REG-035e: the app version is shown at the bottom of the screen and inside error details', async ({ page }) => {
  await reloadAndWait(page);
  await expect(page.locator('.app-version')).toHaveText('גרסה dev');
  await page.evaluate(() => { window.__testForceSaveError = true; });
  await page.click('button:has-text("פריט חדש")');
  await page.fill('#item-overlay input[type=text] >> nth=0', 'א');
  await page.click('#item-overlay button[type=submit]');
  await expect(page.locator('.toast .error-version')).toHaveText('גרסה dev');
});
