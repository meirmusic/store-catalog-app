// REG-053 (Meir, iPhone, 16/10, E-NFVL): after the app sat in the background,
// iPhone cut its connection to the device's storage ("Connection to Indexed
// Database server lost"). The first attempt to reconnect failed too, and from
// then on every save failed until the page was refreshed - with the edits on
// screen. The app now reconnects by itself and the action goes through.
// SPEC.md section 9, TEST_PLAN.md TC-DBLOST-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, getItems, getPendingChanges, clickRefresh } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const ART = { row_id: 'L1', name: 'בית המקדש בזהב', size: '120X80', price: 3200, availability_status: 'available' };

// What iPhone does: the connection is dropped while the app is in the
// background, and the app's next attempt to reconnect fails with the same
// error (as in the screenshot). After that the phone would allow a new one.
async function loseConnection(page) {
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.js');
    const factory = db._deps.indexedDB;
    const realOpen = factory.open.bind(factory);
    let down = true;
    factory.open = (...args) => {
      if (!down) return realOpen(...args);
      const req = {};
      setTimeout(() => {
        req.error = new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError');
        req.onerror?.({ target: req, type: 'error', preventDefault() {}, stopPropagation() {} });
      }, 0);
      return req;
    };
    db.close({ disableAutoOpen: false }); // dropped in the background
    await db.items.count().catch(() => {}); // the next use tries to reconnect - and fails
    down = false; // a new connection would work from now on
    window.__dbWasLost = await db.items.count().then(() => false, (e) => `${e.name}: ${e.message}`);
  });
  // the state Meir's phone was in
  expect(await page.evaluate(() => window.__dbWasLost)).toMatch(/^DatabaseClosedError: UnknownError Connection to Indexed Database server lost/);
}

test.beforeEach(async ({ page }) => {
  await page.route(MOCK_URL, (route) => {
    const body = JSON.parse(route.request().postData());
    return route.fulfill({ json: body.action === 'getAll' ? { items: [], config: {} } : { ok: true, ...(body.payload || {}) } });
  });
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, [ART]);
  await reloadAndWait(page);
});

test('TC-DBLOST-001: the storage connection was lost in the background - "save" reconnects and saves, no error', async ({ page }) => {
  await page.locator('.card', { hasText: ART.name }).locator('.name').click();
  await page.fill('#item-overlay input[type=number]', '3400');
  await loseConnection(page);
  await page.click('#item-overlay button[type=submit]');
  await expect(page.locator('.toast').first()).toContainText('נשמר מקומית');
  await expect(page.locator('.toast.error')).toHaveCount(0);
  await expect(page.locator('#item-overlay')).toHaveCount(0);
  expect((await getItems(page)).find((it) => it.row_id === 'L1').price).toBe(3400);
  await expect(page.locator('.card', { hasText: ART.name })).toContainText('$3,400'); // the list shows it too
});

test('TC-DBLOST-002: after a lost connection - a new artwork, a delete and its undo all work; and sync sends them', async ({ page }) => {
  await loseConnection(page);
  await page.click('button:has-text("פריט חדש")');
  await page.fill('#item-overlay input[type=text] >> nth=0', 'חדשה אחרי ניתוק');
  await page.click('#item-overlay button[type=submit]');
  await expect(page.locator('.card', { hasText: 'חדשה אחרי ניתוק' })).toBeVisible();
  await loseConnection(page);
  await page.locator('.card', { hasText: ART.name }).locator('.name').click();
  await page.click('#item-overlay .danger-btn');
  await page.click('.confirm-modal button.danger');
  await expect(page.locator('.card', { hasText: ART.name })).toHaveCount(0);
  await loseConnection(page);
  await page.click('.toast button:has-text("ביטול")');
  await expect(page.locator('.card', { hasText: ART.name })).toBeVisible();
  await expect(page.locator('.toast.error')).toHaveCount(0);
  await loseConnection(page);
  await clickRefresh(page);
  await expect.poll(async () => (await getPendingChanges(page)).length).toBe(0);
});

test('TC-DBLOST-003: coming back to the app reconnects on its own - before anything is tapped', async ({ page }) => {
  await loseConnection(page);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => page.evaluate(async () => {
    const { db } = await import('/src/db/db.js');
    return db.hasFailed();
  })).toBe(false);
});
