// TC-OFF-* from TEST_PLAN.md.
import { test, expect } from '@playwright/test';
import {
  pickIdentity,
  clearAllData,
  openNewItemForm,
  fillItemForm,
  saveItemForm,
  getPendingChanges,
  reloadApp,
} from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
});

test('TC-OFF-001: going offline flips the status dot and label', async ({ page, context }) => {
  await expect(page.locator('.dot.on')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('.dot.off')).toBeVisible();
});

test('TC-OFF-002: adding an item while offline queues it with a correct pending count', async ({ page, context }) => {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'נוסף אופליין' });
  await saveItemForm(page);

  await expect(page.locator('.chip', { hasText: 'ממתינים' })).toContainText('1');
  const pending = await getPendingChanges(page);
  expect(pending).toHaveLength(1);
  expect(pending[0].op).toBe('upsert');
});

test('TC-OFF-002b: several offline changes accumulate the correct count (upsert + uploadImage count separately)', async ({ page, context }) => {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'ראשון' });
  await saveItemForm(page);

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'שני' });
  await saveItemForm(page);

  await expect(page.locator('.chip', { hasText: 'ממתינים' })).toContainText('2');
});

test('TC-OFF-003: reconnecting triggers an automatic sync attempt', async ({ page, context }) => {
  let syncAttempted = false;
  await page.route('**/mock-apps-script.test/**', async (route) => {
    syncAttempted = true;
    await route.fulfill({ json: { items: [], config: {} } });
  });

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(500);

  expect(syncAttempted).toBe(true);
});
