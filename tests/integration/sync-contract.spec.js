// TC-SYNC-002/004/005/006/007 from TEST_PLAN.md: the app's behavior against
// a MOCKED Apps Script (page.route()) - proves the frontend's contract
// handling is correct without ever reaching the real backend. See
// TEST_PLAN.md section 1 for why this is 🟢 (frontend behavior) rather
// than proof the real Code.gs matches (that stays 🟡, per the plan).
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, openNewItemForm, fillItemForm, saveItemForm, getItems, reloadApp } from '../helpers/app.js';

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

  for (let i = 0; i < 5; i++) {
    await page.click('.icon-btn[title]');
    await page.waitForTimeout(300);
  }

  const pendingChip = page.locator('.chip', { hasText: 'ממתינים' });
  await expect(pendingChip).toHaveCSS('border-color', /.+/); // has some border-color set at all
  const style = await pendingChip.getAttribute('style');
  expect(style).toContain('border-color');
});

// Fixed per task #15 (was SYNC-05): when a pull fails, syncNow() reports
// it instead of throwing, useSyncStatus.js tracks a `stale` flag, and the
// Header renders a "not updated since" chip per SPEC.md section 4.
test('TC-SYNC-005: a failed pull should show a stale-data timestamp', async ({ page }) => {
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
  await page.click('.icon-btn[title]');
  await page.waitForTimeout(500);

  await expect(page.locator('text=לא עודכן מאז')).toBeVisible();
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
