// SPEC.md 33 - the server package (docs/ddd/002-server-package.md): only the
// changed fields, "undo" as an explicit restore, what the server says back,
// a key per phone, and the server's version. Against a server that can act
// as the new one or the old one. TEST_PLAN.md TC-SRV-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, clickRefresh, getItems, getPendingChanges, openMenuItem } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const LATEST = '2026-10-22';
const ART = { row_id: 'S1', name: 'נשמת הכותל', size: '120X80', serial_number: '4100', sku: 'YB-1', price: 3200, notes: 'ישנה', availability_status: 'available', last_modified_by: 'דב' };
const OTHER = { row_id: 'S2', name: 'שבילי תפילה', serial_number: '4101', availability_status: 'available' };

// A fake server: `version: 'new'` says it can take partial saves and keys; 'old' says nothing.
async function server(page, { version = 'new', upsert = (p) => ({ ...p, last_modified_at: new Date().toISOString() }), keyAccepted = true } = {}) {
  const state = { calls: [], version, keyAccepted };
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    state.calls.push(body);
    if (body.auth?.device_key && !state.keyAccepted) return route.fulfill({ json: { error: 'forbidden' } });
    const isNew = state.version === 'new';
    if (body.action === 'getAll') {
      return route.fulfill({ json: { items: [], config: {}, ...(isNew ? { features: ['name_en', 'partial_save', 'device_key', 'serial_check'], server_version: LATEST } : {}) } });
    }
    if (body.action === 'upsert') return route.fulfill({ json: upsert(body.payload) });
    if (body.action === 'issueDeviceKey') return route.fulfill({ json: isNew ? { device_key: 'k'.repeat(64) } : { error: 'unknown action: issueDeviceKey' } });
    return route.fulfill({ json: { ok: true } });
  });
  return state;
}
const upserts = (state) => state.calls.filter((c) => c.action === 'upsert').map((c) => c.payload);

async function editPrice(page, name, price) {
  await page.locator('.card', { hasText: name }).locator('.name').click();
  await page.fill('#item-overlay input[type=number]', String(price));
  await page.click('#item-overlay button[type=submit]');
  await expect(page.locator('#item-overlay')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.evaluate(() => { localStorage.removeItem('gallery_server_features'); localStorage.removeItem('gallery_server_version'); });
});

test('TC-SRV-001: a new server gets only the changed field; an old server still gets the whole artwork (it would erase the rest)', async ({ page }) => {
  const srv = await server(page, { version: 'new' });
  await seedItems(page, [ART]);
  await reloadAndWait(page);
  await editPrice(page, ART.name, 3600);
  await expect.poll(() => upserts(srv).length).toBe(1);
  expect(upserts(srv)[0]).toEqual({ row_id: 'S1', last_modified_by: 'שרה', price: 3600 });

  srv.version = 'old';
  await page.evaluate(() => localStorage.setItem('gallery_server_features', '[]')); // as an old server answers
  await editPrice(page, ART.name, 3700);
  await expect.poll(() => upserts(srv).length).toBe(2);
  expect(upserts(srv)[1]).toMatchObject({ row_id: 'S1', name: ART.name, serial_number: '4100', notes: 'ישנה', price: 3700 });
});

test('TC-SRV-002: two edits before a sync - both fields go; "undo" after a delete is sent as a restore', async ({ page, context }) => {
  const srv = await server(page);
  await seedItems(page, [ART]);
  await reloadAndWait(page);
  await clickRefresh(page); // learns what the server can do
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gallery_server_features'))).toContain('partial_save');
  await context.setOffline(true);
  await editPrice(page, ART.name, 3600);
  await page.locator('.card', { hasText: ART.name }).locator('.name').click();
  await page.fill('#item-overlay textarea', 'נבדק במחסן');
  await page.click('#item-overlay button[type=submit]');
  await context.setOffline(false);
  await clickRefresh(page);
  await expect.poll(() => upserts(srv).length).toBe(2);
  expect(upserts(srv).map((p) => Object.keys(p).sort())).toEqual([['last_modified_by', 'price', 'row_id'], ['last_modified_by', 'notes', 'row_id']]);

  await page.locator('.card', { hasText: ART.name }).locator('.name').click();
  await page.click('#item-overlay .danger-btn');
  await page.click('.confirm-modal button.danger');
  await page.click('.toast button:has-text("ביטול")');
  await expect.poll(() => upserts(srv).some((p) => p.restore === true)).toBe(true);
});

test('TC-SRV-003: deleted on another phone meanwhile - the old form\'s save is not kept, the artwork goes, and whoever saved is told (with a code)', async ({ page }) => {
  await server(page, { upsert: (p) => ({ deleted: true, row_id: p.row_id, name: ART.name, deleted_by: 'שרה' }) });
  await seedItems(page, [ART, OTHER]);
  await reloadAndWait(page);
  await editPrice(page, ART.name, 3600);
  const toast = page.locator('.toast.error');
  await expect(toast).toContainText('היצירה "נשמת הכותל" נמחקה בינתיים (שרה) - השינוי שלך לא נשמר.');
  await expect(toast.locator('.error-code')).toContainText(/E-[A-Z2-9]{4}/);
  await expect(page.locator('.card', { hasText: ART.name })).toHaveCount(0);
  expect((await getItems(page)).map((i) => i.row_id)).toEqual(['S2']);
  await expect.poll(async () => (await getPendingChanges(page)).length).toBe(0); // not retried forever
});

test('TC-SRV-004: a serial number the server finds taken - saved without it, this phone shows what was kept, and the message names the owner', async ({ page }) => {
  await server(page, { upsert: (p) => ({ ...p, serial_number: '', serial_taken: { value: '4100', owner_name: ART.name, owner_row_id: 'S1' }, last_modified_at: new Date().toISOString() }) });
  await seedItems(page, [OTHER]);
  await reloadAndWait(page);
  await page.locator('.card', { hasText: OTHER.name }).locator('.name').click();
  await page.locator('#item-overlay .field:has-text("מספר סידורי") input').fill('4100'); // free on this phone, taken on the server
  await page.click('#item-overlay button[type=submit]');
  await expect(page.locator('.toast.error')).toContainText('המספר 4100 כבר שייך ל"נשמת הכותל" - "שבילי תפילה" נשמרה בלי מספר סידורי. פתחו אותה לתיקון.');
  await expect.poll(async () => (await getItems(page)).find((i) => i.row_id === 'S2').serial_number).toBe(null);
  await expect.poll(async () => (await getPendingChanges(page)).length).toBe(0);
});

test('TC-SRV-005: a phone signed in with the password swaps it for a key on its first sync with the new server - no signing in again, the password leaves the phone', async ({ page }) => {
  const srv = await server(page);
  await reloadAndWait(page);
  await clickRefresh(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gallery_password_identity')))).toEqual({ email: 'test-user@example.com', device_key: 'k'.repeat(64) });
  const issue = srv.calls.find((c) => c.action === 'issueDeviceKey');
  expect(issue.auth).toEqual({ email: 'test-user@example.com', password: 'test-password' });
  expect(issue.payload).toEqual({ kind: 'computer', member: 'שרה' });
  // from now on - the key and the staff member's name, never the password
  const before = srv.calls.length;
  await clickRefresh(page);
  await expect.poll(() => srv.calls.length).toBeGreaterThan(before);
  for (const c of srv.calls.slice(before)) expect(c.auth).toEqual({ email: 'test-user@example.com', device_key: 'k'.repeat(64), member: 'שרה' });
  expect(JSON.stringify(await page.evaluate(() => ({ ...localStorage })))).not.toContain('test-password');
  // and after reopening the app (a fresh window - the test's own sign-in step doesn't run there)
  const reopened = await page.context().newPage();
  const srv2 = await server(reopened);
  await reopened.goto('/', { waitUntil: 'domcontentloaded' });
  await reopened.waitForSelector('text=קטלוג הגלריה');
  await expect.poll(() => srv2.calls.length).toBeGreaterThan(0);
  expect(srv2.calls[0].auth).toEqual({ email: 'test-user@example.com', device_key: 'k'.repeat(64), member: 'שרה' });
  await expect(reopened.locator('.auth-banner')).toHaveCount(0);
});

test('TC-SRV-006: an old server - the password stays, nothing breaks; a cancelled key - "sign in again"', async ({ page }) => {
  const srv = await server(page, { version: 'old' });
  await reloadAndWait(page);
  await clickRefresh(page);
  await page.waitForTimeout(500);
  expect(srv.calls.some((c) => c.action === 'issueDeviceKey')).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gallery_password_identity')).password)).toBe('test-password');

  srv.version = 'new';
  await clickRefresh(page);
  await expect.poll(() => page.evaluate(() => !!JSON.parse(localStorage.getItem('gallery_password_identity')).device_key)).toBe(true);
  srv.keyAccepted = false; // Meir wrote "כן" under "בוטל"
  await clickRefresh(page);
  await expect(page.locator('.auth-banner')).toBeVisible();
});

test('TC-SRV-007: "info & support" shows which server runs - old, behind, or up to date', async ({ page }) => {
  const srv = await server(page, { version: 'old' });
  await reloadAndWait(page);
  await clickRefresh(page);
  const row = async () => {
    await openMenuItem(page, 'מידע ותמיכה');
    const text = await page.locator('.support-rows div', { hasText: 'גרסת השרת' }).innerText();
    await page.keyboard.press('Escape');
    return text;
  };
  await expect.poll(row).toContain('ישנה (לפני 22/10) - קיים עדכון מ-22/10');
  srv.version = 'new';
  await clickRefresh(page);
  await expect.poll(row).toContain('22/10 (עדכנית)');
});
