// SPEC.md section 21 - the ⚙ menu: language, account and support.
// TEST_PLAN.md TC-SET-*.
import { test, expect } from '@playwright/test';
import {
  pickIdentity,
  clearAllData,
  seedItems,
  reloadAndWait,
  getItems,
  getPendingChanges,
  openMenuItem,
  switchLanguage,
} from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';

async function mockServer(page, { items = [], fail = false } = {}) {
  const seen = [];
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    seen.push(body);
    if (fail && body.action === 'getAll') return route.fulfill({ status: 500, body: 'down' });
    if (body.action === 'getAll') return route.fulfill({ json: { items: typeof items === 'function' ? items() : items, config: { location: ['גלריה'] } } });
    if (body.action === 'requestPasswordReset') return route.fulfill({ json: { ok: true } });
    if (body.action === 'resetPassword') return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: { ...body.payload } });
  });
  return seen;
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.evaluate(() => localStorage.removeItem('gallery_recent_errors'));
});

test('TC-SET-001: the menu has three groups in order, and the language flag is gone from the header', async ({ page }) => {
  await reloadAndWait(page);
  await expect(page.locator('header .chip[aria-expanded]')).toHaveCount(0); // the old flag button
  await page.click('.header-menu > button');
  await expect(page.locator('.header-menu-list > button')).toHaveText([
    'ניהול רשימות', /^שפה: .*עברית/, 'החלפת משתמש/ת', 'שינוי סיסמת המשרד', 'התנתקות', 'מידע ותמיכה', 'טעינה מחדש של הנתונים',
  ]);
  await expect(page.locator('.header-menu-list hr')).toHaveCount(2);
});

test('TC-SET-002: language from the menu - current one marked, the switch applies and stays', async ({ page }) => {
  await reloadAndWait(page);
  await page.click('.header-menu > button');
  await page.click('.menu-language');
  await expect(page.locator('.menu-languages button[aria-checked="true"]')).toContainText('עברית ✓');
  await page.click('.menu-languages button:has-text("English")');
  await expect(page.locator('h1')).toHaveText('Gallery Catalog');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveText('Gallery Catalog');
  await switchLanguage(page, 'עברית');
  await expect(page.locator('h1')).toHaveText('קטלוג הגלריה');
});

test('TC-SET-003: "switch user" from the menu opens "who are you"', async ({ page }) => {
  await reloadAndWait(page);
  await openMenuItem(page, 'החלפת משתמש/ת');
  await expect(page.locator('text=מי אתה?')).toBeVisible();
});

test('TC-SET-004: changing the office password keeps this device signed in with the new one', async ({ page }) => {
  const seen = await mockServer(page);
  await reloadAndWait(page);
  await openMenuItem(page, 'שינוי סיסמת המשרד');
  const dialog = page.locator('.change-password');
  await expect(dialog.locator('input[type=email]')).toHaveValue('test-user@example.com');
  await dialog.locator('button:has-text("שליחת קוד")').click();
  await dialog.locator('input[inputmode=numeric], input[placeholder*="קוד"]').first().fill('123456');
  const passwords = dialog.locator('input[type=password]');
  await passwords.nth(0).fill('New-Pass-2026');
  await passwords.nth(1).fill('New-Pass-2026');
  await dialog.locator('button:has-text("עדכון סיסמה")').click();
  await expect(page.locator('.toast')).toContainText('הסיסמה עודכנה');
  await expect(dialog).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('gallery_password_identity'))).password).toBe('New-Pass-2026');

  const before = seen.length;
  await page.click('button[title="רענון ידני"]');
  await expect.poll(() => seen.slice(before).some((b) => b.auth?.password === 'New-Pass-2026')).toBe(true);
  await expect(page.locator('.auth-banner')).toHaveCount(0);
});

test('TC-SET-005: info & support shows the device state and recent errors, and copies it - never the password', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await reloadAndWait(page);
  await page.evaluate(async () => {
    const { reportError } = await import('/src/errors/errorReporting.js');
    reportError('save', new Error('disk full'));
  });
  await openMenuItem(page, 'מידע ותמיכה');
  const dialog = page.locator('.support-info');
  await expect(dialog).toContainText('גרסה');
  await expect(dialog).toContainText('dev');
  await expect(dialog).toContainText('test-user@example.com');
  await expect(dialog).toContainText('שרה');
  await expect(dialog).toContainText('ממתינים לסנכרון');
  await expect(dialog.locator('.support-errors li')).toContainText('save');
  await expect(dialog.locator('.support-errors li')).toContainText('Error: disk full');
  await dialog.locator('button:has-text("העתקת פרטים לתמיכה")').click();
  await expect(dialog.locator('button.primary')).toHaveText('הועתק ✓');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('test-user@example.com');
  expect(copied).toContain('Error: disk full');
  expect(copied).not.toContain('test-password');
});

test('TC-SET-005b: recent errors stay listed after they were sent to the ErrorLog', async ({ page }) => {
  await mockServer(page);
  await page.addInitScript(() => { window.__testErrorLogRetryMs = 0; });
  await reloadAndWait(page);
  await page.evaluate(async () => {
    const { reportError } = await import('/src/errors/errorReporting.js');
    reportError('save', new Error('sent already'));
  });
  await page.click('button[title="רענון ידני"]');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gallery_error_log_queue') || '[]').length)).toBe(0);
  await openMenuItem(page, 'מידע ותמיכה');
  await expect(page.locator('.support-errors li')).toContainText('sent already');
});

test('TC-SET-006: reloading is blocked while changes wait to be sent, and says why', async ({ page }) => {
  await page.route(MOCK_URL, (route) => route.fulfill({ json: { error: 'server busy - another save is in progress' } }));
  await seedItems(page, [{ row_id: 'P1', name: 'ממתין' }]);
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.js');
    await db.pendingChanges.add({ row_id: 'P1', op: 'upsert', payload: null, createdAt: Date.now(), attempts: 0 });
  });
  await reloadAndWait(page);
  await openMenuItem(page, 'טעינה מחדש של הנתונים');
  const dialog = page.locator('.reload-data');
  await expect(dialog.locator('.reload-blocker')).toContainText('יש 1 שינויים שעוד לא נשלחו לשרת');
  await expect(dialog.locator('button.primary')).toBeDisabled();
  expect(await getPendingChanges(page)).toHaveLength(1);
});

test('TC-SET-007: reloading replaces this device\'s copy with the server\'s', async ({ page }) => {
  let serverItems = [];
  await mockServer(page, { items: () => serverItems });
  await reloadAndWait(page);
  // Something stale only on this device, and a server item it never got.
  await seedItems(page, [{ row_id: 'STALE', name: 'ישן במכשיר' }]);
  serverItems = [{ row_id: 'S1', name: 'מהשרת', availability_status: 'available' }, { row_id: 'S2', name: 'גם מהשרת', availability_status: 'available' }];
  await openMenuItem(page, 'טעינה מחדש של הנתונים');
  await page.click('.reload-data button.primary');
  await expect(page.locator('.toast')).toContainText('הנתונים נטענו מחדש - 2 פריטים');
  expect((await getItems(page)).map((it) => it.name).sort()).toEqual(['גם מהשרת', 'מהשרת']);
});

test('TC-SET-008: a failed or empty reload leaves this device\'s data untouched', async ({ page }) => {
  let mode = 'fail';
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action !== 'getAll') return route.fulfill({ json: { ok: true } });
    if (mode === 'fail') return route.fulfill({ status: 500, body: 'down' });
    return route.fulfill({ json: { items: [], config: {} } });
  });
  await seedItems(page, [{ row_id: 'K1', name: 'נשאר' }]);
  await reloadAndWait(page);
  await openMenuItem(page, 'טעינה מחדש של הנתונים');
  await page.click('.reload-data button.primary');
  await expect(page.locator('.toast.error')).toContainText('הטעינה מחדש נכשלה - הנתונים במכשיר לא השתנו');
  expect(await getItems(page)).toHaveLength(1);

  mode = 'empty';
  await page.click('.reload-data button.primary');
  await expect(page.locator('.toast.error .error-tech')).toContainText('empty catalog');
  expect((await getItems(page)).map((it) => it.name)).toEqual(['נשאר']);
});
