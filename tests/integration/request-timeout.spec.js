// A server request that never answers - SPEC.md section 9, TEST_PLAN.md REG-030.
// Real report: an iPhone showed "connected" and "5 waiting to sync" forever,
// with no warning, and ⟳ did nothing - one request caught by a screen lock
// never settled, and the sync cycle waited on it indefinitely.
import { test, expect } from '@playwright/test';
import {
  pickIdentity,
  clearAllData,
  reloadAndWait,
  openNewItemForm,
  fillItemForm,
  saveItemForm,
  getPendingChanges,
} from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const REFRESH = 'button[title="רענון ידני"]';

// A mock server where requests matching `shouldHang` are never answered.
async function mockServer(page, shouldHang) {
  const seen = [];
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    seen.push(body);
    if (shouldHang(body)) return; // no answer, ever - like a request frozen by iOS
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    return route.fulfill({ json: { ...body.payload } });
  });
  return seen;
}

const upsertsOf = (seen, name) => seen.filter((b) => b.action === 'upsert' && b.payload.name === name);

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.evaluate(() => localStorage.removeItem('gallery_error_log_queue'));
});

test('REG-030: a request with no answer counts as a failed attempt after the time limit, and the next changes still go out', async ({ page }) => {
  let hang = true;
  const seen = await mockServer(page, (b) => hang && b.action === 'upsert' && b.payload.name === 'תקוע');
  await reloadAndWait(page);
  await page.evaluate(() => { window.__testApiTimeoutMs = 1000; });

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'תקוע' });
  await saveItemForm(page);
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'רגיל' });
  await saveItemForm(page);

  // The item behind the frozen one is not held up.
  await expect.poll(() => upsertsOf(seen, 'רגיל').length).toBeGreaterThan(0);
  await expect.poll(async () => (await getPendingChanges(page)).length).toBe(1);
  const [stuck] = await getPendingChanges(page);
  expect(stuck.attempts).toBeGreaterThanOrEqual(1);
  expect(stuck.lastError).toBe('no answer from the server after 1s');
  await expect(page.locator(`${REFRESH}.spin`)).toHaveCount(0); // the cycle ended

  // Logged to the ErrorLog (SPEC.md section 17).
  await expect.poll(() => seen.filter((b) => b.action === 'logErrors').flatMap((b) => b.payload.entries)
    .some((e) => e.action === 'sync-push:upsert' && e.message === 'TimeoutError: no answer from the server after 1s')).toBe(true);

  // Server answers again -> the next cycle sends it and the queue empties.
  hang = false;
  await page.click(REFRESH);
  await expect.poll(async () => (await getPendingChanges(page)).length).toBe(0);
  await expect(page.locator('.chip', { hasText: 'ממתינים' })).toHaveCount(0);
});

test('REG-030b: if a cycle is stuck anyway (the time limit did not fire), ⟳ starts a fresh one instead of waiting forever', async ({ page }) => {
  let hang = true;
  const seen = await mockServer(page, (b) => hang && b.action === 'upsert');
  await reloadAndWait(page);
  // Time limit effectively off (as if the browser froze its own clock too);
  // "stuck" after 1s without progress, instead of 2.5 minutes.
  await page.evaluate(() => { window.__testApiTimeoutMs = 10 * 60 * 1000; window.__testStuckSyncMs = 1000; });

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'תקוע' });
  await saveItemForm(page);
  await expect.poll(() => upsertsOf(seen, 'תקוע').length).toBe(1);
  await expect(page.locator(`${REFRESH}.spin`)).toHaveCount(1); // waiting on the frozen request

  hang = false;
  await page.waitForTimeout(1200);
  await page.click(REFRESH, { force: true }); // the button is spinning, so it's never "stable"
  await expect.poll(async () => (await getPendingChanges(page)).length).toBe(0);
  expect(upsertsOf(seen, 'תקוע')).toHaveLength(2);
  await expect(page.locator(`${REFRESH}.spin`)).toHaveCount(0);
});

test('REG-030b2: a long but healthy cycle is not replaced - ⟳ waits for it', async ({ page }) => {
  let hang = true;
  const seen = await mockServer(page, (b) => hang && b.action === 'upsert');
  await reloadAndWait(page);
  await page.evaluate(() => { window.__testApiTimeoutMs = 10 * 60 * 1000; window.__testStuckSyncMs = 60 * 1000; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'איטי' });
  await saveItemForm(page);
  await expect.poll(() => upsertsOf(seen, 'איטי').length).toBe(1);
  await page.click(REFRESH, { force: true });
  await page.waitForTimeout(500);
  expect(upsertsOf(seen, 'איטי')).toHaveLength(1); // not sent twice in parallel
});

test('REG-030c: coming back to the app (screen unlocked, switched back) syncs right away', async ({ page }) => {
  const seen = await mockServer(page, () => false);
  await reloadAndWait(page);
  await expect.poll(() => seen.filter((b) => b.action === 'getAll').length).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  const before = seen.filter((b) => b.action === 'getAll').length;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => seen.filter((b) => b.action === 'getAll').length).toBe(before + 1);
});

test('REG-030d: signing in when the server never answers ends with a clear message, not "signing in..." forever', async ({ page }) => {
  await mockServer(page, () => true);
  await reloadAndWait(page);
  await page.click('button[title="התנתקות מחשבון הגלריה"]');
  await page.click('.signout-confirm button:has-text("התנתקות")');
  await page.evaluate(() => { window.__testApiTimeoutMs = 1000; });
  await page.fill('input[type=email]', 'office@example.com');
  await page.fill('input[type=password]', 'Secret-Pass-123');
  await page.press('input[type=password]', 'Enter');
  const message = page.locator('form ~ .inline-error');
  await expect(message).toContainText('לא ניתן להתחבר לשרת כרגע');
  await expect(message.locator('.error-tech')).toContainText('no answer from the server after 1s');
});
