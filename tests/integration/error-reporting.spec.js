// Error reporting and the ErrorLog - SPEC.md section 17, TEST_PLAN.md TC-ERR-*.
import { test, expect } from '@playwright/test';
import {
  pickIdentity,
  clearAllData,
  seedItems,
  reloadAndWait,
  clickRefresh,
  openNewItemForm,
  fillItemForm,
} from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const CODE = /E-[A-Z2-9]{4}/;

async function errorQueue(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('gallery_error_log_queue') || '[]'));
}

// Makes the app's own local database fail a given operation, the way a
// full or blocked browser storage would.
async function breakDb(page, table, method, message = 'QuotaExceededError: the disk is full') {
  await page.evaluate(async ({ table, method, message }) => {
    const mod = await import('/src/db/db.js');
    mod.db[table][method] = () => Promise.reject(new Error(message));
  }, { table, method, message });
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.evaluate(() => localStorage.removeItem('gallery_error_log_queue'));
});

test('TC-ERR-001: a failed save shows the message, an error code, the exact error and a copy button - and is logged', async ({ page }) => {
  await reloadAndWait(page);
  await page.evaluate(() => { window.__testForceSaveError = true; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'שמירה שנכשלת' });
  await page.click('#item-overlay button[type=submit]');

  const toast = page.locator('.toast.error');
  await expect(toast).toContainText('השמירה נכשלה');
  await expect(toast.locator('.error-code')).toContainText(CODE);
  await expect(toast.locator('.error-tech')).toContainText('Error: forced test failure');
  await expect(toast.locator('.error-copy')).toHaveText('העתקה');

  const code = (await toast.locator('.error-code bdi').textContent()).trim();
  const [entry] = await errorQueue(page);
  expect(entry).toMatchObject({ code, action: 'save', message: 'Error: forced test failure', member: 'שרה', count: 1 });
  expect(entry.app_version).toBeTruthy();
  expect(entry.device).toBeTruthy();
});

test('TC-ERR-002: queued errors go to the ErrorLog with the next sync, and leave the queue once sent', async ({ page }) => {
  const logged = [];
  let logUp = false;
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'logErrors') {
      if (!logUp) return route.fulfill({ json: { error: 'unknown action: logErrors' } });
      logged.push(...body.payload.entries);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ...body.payload } });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const now = new Date().toISOString();
    localStorage.setItem('gallery_error_log_queue', JSON.stringify([{
      code: 'E-TEST', action: 'save', message: 'Error: forced test failure', stack: '', member: 'שרה',
      device: 'test', app_version: 'dev', occurred_at: now, first_at: now, count: 1,
    }]));
  });
  await reloadAndWait(page);

  await clickRefresh(page); // the server can't take it yet (Apps Script not redeployed) - kept, silently
  await page.waitForTimeout(800);
  expect(await errorQueue(page)).toHaveLength(1);
  await expect(page.locator('.toast.error')).toHaveCount(0); // no error about the log itself

  logUp = true;
  await clickRefresh(page);
  await expect.poll(() => logged.length).toBe(1);
  expect(logged[0]).toMatchObject({ code: 'E-TEST', action: 'save', message: 'Error: forced test failure', member: 'שרה' });
  expect(logged[0]).not.toHaveProperty('first_at');
  await expect.poll(async () => (await errorQueue(page)).length).toBe(0);
});

test('TC-ERR-003: the same failure repeating is one entry with a count, and keeps its code', async ({ page }) => {
  await reloadAndWait(page);
  await page.evaluate(() => { window.__testForceSaveError = true; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'א' });
  const save = page.locator('#item-overlay button[type=submit]');
  await save.click();
  const first = (await page.locator('.toast .error-code bdi').textContent()).trim();
  await save.click();
  await save.click();
  await expect(page.locator('.toast .error-code bdi')).toHaveText(first);
  const queue = await errorQueue(page);
  expect(queue).toHaveLength(1);
  expect(queue[0].count).toBe(3);
});

test('TC-ERR-004: an unexpected error anywhere gets a message with code and details, and is logged', async ({ page }) => {
  await reloadAndWait(page);
  await page.evaluate(() => { setTimeout(() => { throw new TypeError('something broke in a button'); }, 0); });
  const toast = page.locator('.toast.error');
  await expect(toast).toContainText('קרתה תקלה לא צפויה');
  await expect(toast.locator('.error-tech')).toContainText('TypeError: something broke in a button');
  expect((await errorQueue(page))[0]).toMatchObject({ action: 'unexpected', message: 'TypeError: something broke in a button' });
});

test('TC-ERR-005: if the whole app crashes, the crash screen shows the code and details, and it is logged', async ({ page }) => {
  await page.addInitScript(() => { window.__testCrash = true; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('text=קרתה תקלה בלתי צפויה')).toBeVisible();
  await expect(page.locator('text=קוד תקלה')).toContainText(CODE);
  await expect(page.locator('text=פרטים טכניים')).toBeVisible();
  expect((await errorQueue(page)).some((e) => e.action === 'crash')).toBe(true);
});

test('TC-ERR-006: a failed delete says so with code and details, and the item and its form stay', async ({ page }) => {
  await seedItems(page, [{ row_id: 'D1', name: 'לא יימחק' }]);
  await reloadAndWait(page);
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await breakDb(page, 'items', 'put');
  await page.click('#item-overlay .danger-btn');
  await page.click('.confirm-modal button.danger');

  const toast = page.locator('.toast.error');
  await expect(toast).toContainText('המחיקה נכשלה');
  await expect(toast.locator('.error-tech')).toContainText('the disk is full');
  await expect(page.locator('#item-overlay')).toBeVisible();
  expect((await errorQueue(page))[0].action).toBe('delete');
});

test('TC-ERR-007: a failed "add to list" says so with code and details', async ({ page }) => {
  await reloadAndWait(page);
  await breakDb(page, 'config', 'put');
  await page.click('button[title="ניהול רשימות"]');
  const location = page.locator('#config-overlay .field', { hasText: 'מיקום' });
  await location.locator('input').fill('מחסן חדש');
  await location.locator('button').click();
  await expect(page.locator('.toast.error')).toContainText('ההוספה לרשימה נכשלה');
  expect((await errorQueue(page))[0].action).toBe('add-value:location');
});

test('TC-ERR-008: "not updated since" explains, when tapped, why fresh data could not be fetched', async ({ page }) => {
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { error: 'Exception: Service invoked too many times' } });
    return route.fulfill({ json: { ok: true } });
  });
  await reloadAndWait(page);
  await clickRefresh(page);
  const chip = page.locator('.chip-problem', { hasText: 'לא עודכן מאז' });
  await chip.click();
  const toast = page.locator('.toast.error');
  await expect(toast).toContainText('לא הצלחנו לקבל נתונים עדכניים מהשרת');
  await expect(toast.locator('.error-tech')).toContainText('Service invoked too many times');
  await expect(toast.locator('.error-code')).toContainText(CODE);
});

test('TC-ERR-009: sign-in - a wrong password is not a malfunction (no code, not logged); an unreachable server is, without the password', async ({ page }) => {
  let mode = 'wrong';
  await page.route(MOCK_URL, async (route) => {
    if (mode === 'wrong') return route.fulfill({ json: { error: 'forbidden' } });
    return route.fulfill({ status: 500, body: 'Internal Server Error' });
  });
  await page.click('button[title="התנתקות מחשבון הגלריה"]');
  await page.click('.signout-confirm button:has-text("התנתקות")');
  await page.evaluate(() => localStorage.removeItem('gallery_error_log_queue'));
  const message = page.locator('form ~ .inline-error');

  await page.fill('input[type=email]', 'office@example.com');
  await page.fill('input[type=password]', 'Secret-Pass-123');
  await page.press('input[type=password]', 'Enter');
  await expect(message).toContainText('המייל או הסיסמה שגויים');
  await expect(message.locator('.error-code')).toHaveCount(0);
  expect(await errorQueue(page)).toHaveLength(0);

  mode = 'down';
  await page.press('input[type=password]', 'Enter');
  await expect(message).toContainText('לא ניתן להתחבר לשרת כרגע');
  await expect(message.locator('.error-code')).toContainText(CODE);
  const queue = await errorQueue(page);
  expect(queue[0]).toMatchObject({ action: 'login', message: 'Error: API error 500' });
  expect(JSON.stringify(queue)).not.toContain('Secret-Pass-123'); // privacy
});

test('TC-ERR-010: "העתקה" copies the code and the details together', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await reloadAndWait(page);
  await page.evaluate(() => { window.__testForceSaveError = true; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'א' });
  await page.click('#item-overlay button[type=submit]');
  const code = (await page.locator('.toast .error-code bdi').textContent()).trim();
  await page.click('.toast .error-copy');
  await expect(page.locator('.toast .error-copy')).toHaveText('הועתק ✓');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${code} · Error: forced test failure`);
});
