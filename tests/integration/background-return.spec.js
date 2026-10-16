// SPEC.md 30 - coming back to the app after it was in the background (iPhone
// pauses the app and cuts what it holds). Found in the scan of 16/10 after
// REG-053. TEST_PLAN.md TC-BG-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, openMenuItem } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ART = { row_id: 'B1', name: 'ירושלים בלילה', availability_status: 'available', price: 1200, image_url: 'https://drive.google.com/thumbnail?id=BG1&sz=w1000' };

// The app going to the background and coming back, as the browser tells it.
async function setVisible(page, visible) {
  await page.evaluate((visible) => {
    window.__vis = visible ? 'visible' : 'hidden';
    if (!window.__visPatched) {
      window.__visPatched = true;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__vis === 'hidden' });
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }, visible);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.__testUsageDay = '2026-03-01'; });
  await pickIdentity(page);
  await clearAllData(page);
  await page.evaluate(() => localStorage.removeItem('gallery_usage'));
  await seedItems(page, [ART]);
  await page.route('https://drive.google.com/**', (route) => route.abort());
  await page.route('https://lh3.googleusercontent.com/**', (route) => route.abort());
});

test('TC-BG-001: the photo for the share card fails while the app is in the background - on return it\'s tried again by itself, no error', async ({ page }) => {
  const calls = [];
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action !== 'getImage') return route.fulfill({ json: { items: [], config: {} } });
    calls.push(body.action);
    if (calls.length === 1) {
      await held; // cut while the app was away (on iPhone: no answer, then the time limit)
      return route.fulfill({ json: { error: 'no answer from the server after 120s' } });
    }
    return route.fulfill({ json: { mime: 'image/png', data: PNG_B64 } });
  });
  await reloadAndWait(page);
  await page.locator('.card .share-icon-btn').click();
  await expect(page.locator('.share-dialog')).toContainText('מכין'); // preparing
  await setVisible(page, false);
  release();
  await expect.poll(() => calls.length).toBe(1);
  await page.waitForTimeout(300);
  await setVisible(page, true);
  await expect(page.locator('.share-dialog .share-card-img')).toBeVisible();
  await expect(page.locator('.toast.error')).toHaveCount(0);
  await expect(page.locator('.share-failed')).toHaveCount(0);
  expect(calls).toHaveLength(2);
});

test('TC-BG-002: the same failure without going to the background still says so (nothing hidden)', async ({ page }) => {
  await page.route(MOCK_URL, (route) => {
    const body = JSON.parse(route.request().postData());
    return route.fulfill({ json: body.action === 'getImage' ? { error: 'no answer from the server after 120s' } : { items: [], config: {} } });
  });
  await reloadAndWait(page);
  await page.locator('.card .share-icon-btn').click();
  await expect(page.locator('.share-failed')).toBeVisible();
  await expect(page.locator('.toast.error')).toHaveCount(1);
});

test('TC-BG-003: "💡 suggestion or problem" and the share window hold off an automatic update, like the form - typed text isn\'t lost on return', async ({ page }) => {
  await page.route(MOCK_URL, (route) => {
    const body = JSON.parse(route.request().postData());
    return route.fulfill({ json: body.action === 'getImage' ? { mime: 'image/png', data: PNG_B64 } : { items: [], config: {} } });
  });
  await reloadAndWait(page);
  const typing = () => page.evaluate(async () => (await import('/src/pwa/typingGuard.js')).isTyping());
  expect(await typing()).toBe(false);
  await openMenuItem(page, 'הצעה או בעיה');
  expect(await typing()).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(typing).toBe(false);
  await page.locator('.card .share-icon-btn').click();
  expect(await typing()).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(typing).toBe(false);
});

test('TC-BG-004: time in the background isn\'t counted as waiting - a card that was being made while away is not timed', async ({ page }) => {
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action !== 'getImage') return route.fulfill({ json: { items: [], config: {} } });
    await held;
    return route.fulfill({ json: { mime: 'image/png', data: PNG_B64 } });
  });
  await reloadAndWait(page);
  await page.locator('.card .share-icon-btn').click();
  await setVisible(page, false);
  await page.waitForTimeout(1500); // away
  await setVisible(page, true);
  release();
  await expect(page.locator('.share-dialog .share-card-img')).toBeVisible();
  const day = await page.evaluate(() => JSON.parse(localStorage.getItem('gallery_usage'))['2026-03-01']);
  expect(day.counts['share-ready']).toBe(1); // still counted as ready
  expect(day.times.card).toBeUndefined(); // but not timed
});
