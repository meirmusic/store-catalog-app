// TC-SYNC-002/004/005/006/007 from TEST_PLAN.md: the app's behavior against
// a MOCKED Apps Script (page.route()) - proves the frontend's contract
// handling is correct without ever reaching the real backend. See
// TEST_PLAN.md section 1 for why this is 🟢 (frontend behavior) rather
// than proof the real Code.gs matches (that stays 🟡, per the plan).
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, openNewItemForm, fillItemForm, saveItemForm, getItems, getPendingChanges, reloadApp } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';

async function readAction(route) {
  const body = JSON.parse(route.request().postData());
  return body;
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
});

test('TC-SYNC-002: push happens before pull (upsert reaches the mock before getAll)', async ({ page }) => {
  const callOrder = [];
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    callOrder.push(body.action);
    if (body.action === 'getAll') {
      await route.fulfill({ json: { items: [], config: {} } });
    } else {
      await route.fulfill({ json: { ok: true, ...body.payload } });
    }
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  // The app also runs an automatic sync on mount (useSyncStatus's own
  // useEffect) - that first cycle has nothing pending yet, so it's a
  // lone 'getAll' with no upsert. Clear it so the assertion below only
  // reflects the cycle triggered by the manual refresh after adding the item.
  callOrder.length = 0;

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'סדר קריאות' });
  await saveItemForm(page);

  await page.click('.icon-btn[title]'); // manual refresh button, triggers syncNow()
  await page.waitForTimeout(500);

  const upsertIndex = callOrder.indexOf('upsert');
  const getAllIndex = callOrder.indexOf('getAll');
  expect(upsertIndex).toBeGreaterThanOrEqual(0);
  expect(getAllIndex).toBeGreaterThan(upsertIndex);
});

test('TC-SYNC-004: 5 consecutive failures on the same change trip the visible sync-problem indicator', async ({ page }) => {
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') {
      await route.fulfill({ json: { items: [], config: {} } });
    } else {
      await route.fulfill({ json: { error: 'simulated failure' } });
    }
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'תמיד נכשל' });
  await saveItemForm(page);

  // Each attempt now includes one quick in-cycle retry before it's counted
  // as failed (see syncEngine.js's withQuickRetry, REG-014) - polling the
  // actual attempts count (rather than a fixed pause per click) keeps this
  // robust to that added latency instead of racing it.
  for (let i = 0; i < 5; i++) {
    await page.click('.icon-btn[title]');
    await expect.poll(async () => {
      const pending = await getPendingChanges(page);
      return pending[0]?.attempts || 0;
    }, { timeout: 5000 }).toBeGreaterThanOrEqual(i + 1);
  }

  const pendingChip = page.locator('.chip-problem', { hasText: 'ממתינים' });
  await expect(pendingChip).toBeVisible();

  // SPEC.md section 9 (gap 5): clicking the red chip explains what wasn't
  // sent and what to do, in a message that stays until closed.
  await pendingChip.click();
  const explanation = page.locator('.toast.error');
  await expect(explanation).toContainText('לא הצליחו להישלח לשרת');
  await expect(explanation).toContainText('תמיד נכשל');
  await expect(explanation).toContainText('פנו למנהל');
});

// Fixed per task #15 (was SYNC-05): when a pull fails, syncNow() reports
// it instead of throwing, useSyncStatus.js tracks a `stale` flag, and the
// Header renders a "not updated since" chip per SPEC.md section 4.
test('TC-SYNC-005: a failed pull on a device that never received data says so in full (SPEC.md 22.6)', async ({ page }) => {
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') {
      await route.fulfill({ json: { error: 'simulated pull failure' } });
    } else {
      await route.fulfill({ json: { ok: true } });
    }
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.click('button[title="רענון ידני"]');
  await expect(page.locator('.chip-problem')).toHaveText('לא התקבלו נתונים מהשרת');
});

// Fixed per task #15: pushOne()'s 'upsert' branch now merges the server's
// response (last_modified_at and any other server-side change) back into
// the local record instead of discarding it.
test('TC-SYNC-006: after a successful upsert, the local record adopts the server-returned timestamp', async ({ page }) => {
  const serverTimestamp = '2099-01-01T00:00:00.000Z';
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') {
      await route.fulfill({ json: { items: [], config: {} } });
    } else if (body.action === 'upsert') {
      await route.fulfill({ json: { ...body.payload, last_modified_at: serverTimestamp } });
    } else {
      await route.fulfill({ json: { ok: true } });
    }
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'בדיקת חותמת זמן' });
  await saveItemForm(page);

  await page.click('.icon-btn[title]');
  await page.waitForTimeout(500);

  const items = await getItems(page);
  expect(items[0].last_modified_at).toBe(serverTimestamp);
});

// REG-011: found via a real user report - a brand-new item's upsert always
// carries image_url: null (the real photo goes out separately as its own
// 'uploadImage' change), so the server always echoes back image_url: ''
// for it. When TC-SYNC-006's fix (adopting the upsert response) first
// shipped, it blanket-adopted the ENTIRE echoed row - meaning that '' could
// stomp a real Drive URL 'uploadImage' had already written locally, if the
// upsert response for one sync cycle happened to land after another cycle's
// uploadImage (two overlapping refreshes on a slow connection is a
// realistic way to trigger that). Fixed by only adopting last_modified_at/
// last_modified_by from the upsert response, never image_url - this test
// proves that contract directly: whatever image_url an upsert response
// carries, it must never overwrite the local record's.
test('TC-SYNC-007 (REG-011 regression): an upsert response never overwrites the local image_url', async ({ page }) => {
  const REAL_URL = 'https://drive.google.com/thumbnail?id=REAL&sz=w1000';
  await seedItems(page, [{ row_id: 'IMGROW', name: 'עם תמונה אמיתית', image_url: REAL_URL, price: 100 }]);

  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') {
      await route.fulfill({ json: { items: [], config: {} } });
    } else if (body.action === 'upsert') {
      // A deliberately wrong echo, standing in for the '' the real
      // Apps Script sends back for any field whose payload was null.
      await route.fulfill({ json: { ...body.payload, image_url: 'WRONG' } });
    } else {
      await route.fulfill({ json: { ok: true } });
    }
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await fillItemForm(page, { price: 250 }); // any edit that queues a plain 'upsert'
  await saveItemForm(page);

  await page.click('.icon-btn[title]');
  await page.waitForTimeout(500);

  const items = await getItems(page);
  expect(items[0].image_url).toBe(REAL_URL);
});

// REG-017 (found by reading the code while writing the save-flow spec,
// SPEC.md section 9): when pushing a local edit fails but the pull in the
// same sync cycle succeeds, the pull used to overwrite the edited item
// with the server's older version - and the next cycle would then push
// that older version back, silently losing the user's edit for good.
// A pull must never overwrite an item that still has a queued change.
test('REG-017: a pull never overwrites a local edit whose push is still pending', async ({ page }) => {
  const serverVersion = { row_id: 'EDITME', name: 'גרסת שרת ישנה', is_deleted: false, availability_status: 'available' };
  await seedItems(page, [serverVersion]);

  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') {
      await route.fulfill({ json: { items: [serverVersion], config: {} } });
    } else {
      await route.fulfill({ json: { error: 'simulated push failure' } });
    }
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await fillItemForm(page, { name: 'עריכה מקומית' });
  await saveItemForm(page);

  await page.click('.icon-btn[title]');
  await expect.poll(async () => {
    const pending = await getPendingChanges(page);
    return pending[0]?.attempts || 0;
  }, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(300); // let the pull that follows the failed push land

  const items = await getItems(page);
  expect(items.find((it) => it.row_id === 'EDITME').name).toBe('עריכה מקומית');
  const pending = await getPendingChanges(page);
  expect(pending.some((c) => c.row_id === 'EDITME' && c.op === 'upsert')).toBe(true);
});

// SPEC.md section 9 (gap 1): a save goes out to the server right away -
// no manual refresh, and well inside the 45s poll interval.
test('TC-SYNC-008: a save is pushed immediately, without waiting for the next poll', async ({ page }) => {
  let upserts = 0;
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') {
      await route.fulfill({ json: { items: [], config: {} } });
    } else {
      if (body.action === 'upsert') upserts++;
      await route.fulfill({ json: { ...body.payload } });
    }
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'נשלח מיד' });
  await saveItemForm(page);

  await expect.poll(() => upserts, { timeout: 3000 }).toBe(1);
  await expect.poll(async () => (await getPendingChanges(page)).length, { timeout: 3000 }).toBe(0);
});

// SPEC.md section 9 (gap 2): once the change reaches the server, the user
// is told so ("סונכרן ✓").
test('TC-SYNC-009: a change that reaches the server shows a "synced" confirmation', async ({ page }) => {
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') {
      await route.fulfill({ json: { items: [], config: {} } });
    } else {
      await route.fulfill({ json: { ...body.payload } });
    }
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'אישור סנכרון' });
  await saveItemForm(page);

  await expect(page.locator('.toast')).toContainText('סונכרן', { timeout: 3000 });
});

// The "synced" message is a background one - it must never replace an
// error the user hasn't read yet (SPEC.md section 9).
test('TC-SYNC-010: a "synced" confirmation never replaces an open error message', async ({ page }) => {
  let releaseUpsert;
  const upsertHeld = new Promise((resolve) => { releaseUpsert = resolve; });
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (body.action === 'getAll') {
      await route.fulfill({ json: { items: [], config: {} } });
    } else {
      await upsertHeld;
      await route.fulfill({ json: { ...body.payload } });
    }
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'ראשון' });
  await saveItemForm(page); // its push is held at the mock

  await page.evaluate(() => { window.__testForceSaveError = true; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'שני' });
  await page.click('#item-overlay button:has-text("שמירה")');
  await expect(page.locator('.toast.error')).toBeVisible();

  releaseUpsert();
  await expect.poll(async () => (await getPendingChanges(page)).length, { timeout: 3000 }).toBe(0);
  await page.waitForTimeout(300);
  await expect(page.locator('.toast.error')).toBeVisible();
});

// REG-019 / SAVE-48-49 (found while building the save-button test plan):
// a Google sign-in is only valid for about an hour and isn't renewed while
// the app stays open (the same happens when the office password is changed
// from another device). The server then rejected every push as
// 'forbidden' - silently: saves piled up as "pending", and after 5 tries
// the red chip blamed the internet connection. Now a rejected sign-in
// shows a "sign in again" banner, isn't counted as a push failure, and the
// queued changes go out right after signing back in.
test('REG-019: an expired sign-in shows a "sign in again" banner, and queued changes are sent after re-login', async ({ page }) => {
  let signInValid = false;
  let upserts = 0;
  await page.route(MOCK_URL, async (route) => {
    const body = await readAction(route);
    if (!signInValid) return route.fulfill({ json: { error: 'forbidden' } });
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'upsert') upserts++;
    return route.fulfill({ json: { ...body.payload } });
  });

  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'נשמר בזמן שההתחברות פגה' });
  await saveItemForm(page);

  const banner = page.locator('.auth-banner');
  await expect(banner).toContainText('פג תוקף ההתחברות', { timeout: 3000 });
  const pending = await getPendingChanges(page);
  expect(pending).toHaveLength(1);
  expect(pending[0].attempts || 0).toBe(0); // not counted as a push failure
  await expect(page.locator('.chip-problem')).toHaveCount(0);

  signInValid = true;
  await banner.locator('button').click();
  await page.fill('input[type=email]', 'office@example.com');
  await page.fill('input[type=password]', 'correct-password');
  await page.press('input[type=password]', 'Enter');
  await page.waitForSelector('text=קטלוג הגלריה');

  await expect.poll(() => upserts, { timeout: 5000 }).toBe(1);
  await expect.poll(async () => (await getPendingChanges(page)).length, { timeout: 5000 }).toBe(0);
  await expect(page.locator('.auth-banner')).toHaveCount(0);
  const items = await getItems(page);
  expect(items.map((it) => it.name)).toContain('נשמר בזמן שההתחברות פגה');
});

// REG-028 (real user report - the long-running "save doesn't work"): Google
// Sheets stores an all-digit SKU or serial number as a number, so the app
// received e.g. sku: 3022 (a number). The form trimmed it as text, which
// threw - every save of such an existing item failed (silently at first,
// then with "השמירה במכשיר נכשלה" once REG-016 surfaced the error).
test('REG-028: an existing item whose SKU / serial arrived as numbers saves normally', async ({ page }) => {
  // As stored on a device before the fix.
  await seedItems(page, [{ row_id: 'NUM', name: 'פריט מהגיליון', sku: 3022, serial_number: 112345 }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await fillItemForm(page, { notes: 'שינוי קטן' });
  await saveItemForm(page);

  await expect(page.locator('.toast')).toContainText('נשמר מקומית');
  const item = (await getItems(page))[0];
  expect(item).toMatchObject({ sku: '3022', serial_number: '112345', notes: 'שינוי קטן' });
});

test('REG-028b: numbers arriving from the Sheet are stored as text - search, list and editing all work', async ({ page }) => {
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') {
      return route.fulfill({ json: { items: [
        { row_id: 'N1', name: 1948, sku: 3022, serial_number: 112345, size: 50, is_deleted: false, availability_status: 'available' },
        { row_id: 'N2', name: 'אחר', sku: 'X-1', is_deleted: false, availability_status: 'available' },
      ], config: {} } });
    }
    return route.fulfill({ json: { ...body.payload } });
  });
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await expect(page.locator('.card')).toHaveCount(2); // a numeric name doesn't break the list
  expect((await getItems(page)).find((it) => it.row_id === 'N1')).toMatchObject({ name: '1948', sku: '3022', serial_number: '112345', size: '50' });

  await page.fill('.search-box input', '112345');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await fillItemForm(page, { notes: 'עובד' });
  await saveItemForm(page);
  await expect(page.locator('.toast')).toContainText(/נשמר מקומית|סונכרן/);
});
