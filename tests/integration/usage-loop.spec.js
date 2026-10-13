// SPEC.md 29 - the improvement loop in the app: usage counted on the device
// (counts and times only) and sent once a day; the "💡 suggestion or
// problem" button. TEST_PLAN.md TC-USE-* / TC-FB-*.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, clickRefresh, openNewItemForm, fillItemForm, saveItemForm, openMenuItem } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DAY = '2026-03-01';
const NEXT_DAY = '2026-03-02';
// Values no count or time could equal by chance - none may reach the usage data.
const ART = {
  row_id: 'U1', name: 'זריחה בגליל', name_en: 'Galilee Sunrise', sku: 'SKU-QX81', serial_number: '9917355', size: '91X132',
  location: 'מחסן צפון', notes: 'פגם קטן בפינה', price: 734519, physical_status: 'ממוסגר', type: 'מקורי',
  availability_status: 'available', image_url: 'https://drive.google.com/thumbnail?id=FX1&sz=w1000',
};
const OTHER = { row_id: 'U2', name: 'שקיעה', serial_number: '4455', availability_status: 'available' };

async function server(page, { usage = 'ok', feedback = 'ok' } = {}) {
  const state = { usage, feedback, usageCalls: [], feedbackCalls: [] };
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'getImage') return route.fulfill({ json: { mime: 'image/png', data: PNG_B64 } });
    if (body.action === 'logUsage') {
      state.usageCalls.push(body.payload.days);
      return route.fulfill({ json: state.usage === 'ok' ? { ok: true } : { error: 'unknown action: logUsage' } });
    }
    if (body.action === 'sendFeedback') {
      state.feedbackCalls.push(body.payload.entries);
      return route.fulfill({ json: state.feedback === 'ok' ? { ok: true } : { error: 'unknown action: sendFeedback' } });
    }
    return route.fulfill({ json: { ok: true, ...(body.payload || {}) } });
  });
  await page.route('https://drive.google.com/**', (route) => route.abort());
  await page.route('https://lh3.googleusercontent.com/**', (route) => route.abort());
  return state;
}

// What this device has counted for the test's day.
const counted = (page, day = DAY) => page.evaluate((d) => (JSON.parse(localStorage.getItem('gallery_usage') || '{}')[d]) || { counts: {}, times: {} }, day);
const setDay = (page, day) => page.evaluate((d) => { window.__testUsageDay = d; }, day);

async function fakeShareSheet(page, { cancel = false } = {}) {
  await page.evaluate((cancel) => {
    navigator.canShare = () => true;
    navigator.share = async () => {
      if (cancel) throw new DOMException('closed', 'AbortError');
    };
  }, cancel);
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.addInitScript((d) => {
    window.__testUsageDay = d;
    window.__testUsageRetryMs = 0;
    if (!sessionStorage.getItem('usage-reset')) {
      sessionStorage.setItem('usage-reset', '1');
      localStorage.removeItem('gallery_usage');
      localStorage.removeItem('gallery_feedback_queue');
    }
  }, DAY);
});

test('TC-USE-001: privacy - after real use with real artworks, nothing of an artwork or of what was typed is in the usage data, and no name', async ({ page }) => {
  const srv = await server(page);
  await seedItems(page, [ART, OTHER]);
  await reloadAndWait(page);
  // search, open, change, a failed save, share, a new artwork
  await page.fill('.search-box input', 'גליל');
  await page.waitForTimeout(1700);
  await page.locator('.card', { hasText: ART.name }).locator('.name').click();
  await page.fill('#item-overlay input[type=number]', '-5');
  await page.click('#item-overlay button[type=submit]');
  await page.fill('#item-overlay input[type=number]', '734520');
  await page.locator('#item-overlay .field:has-text("מספר סידורי") input').fill('4455');
  await page.click('#item-overlay button[type=submit]');
  await page.locator('#item-overlay .field:has-text("מספר סידורי") input').fill('9917356');
  await saveItemForm(page);
  await page.fill('.search-box input', '');
  await fakeShareSheet(page);
  await page.locator('.card', { hasText: ART.name }).locator('.share-icon-btn').click();
  await page.click('.share-dialog button.primary:not([disabled])');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'יצירה סודית', sku: 'SKU-ZZ93', notes: 'הערה סודית', price: 81234 });
  await saveItemForm(page);

  const day = await counted(page);
  expect(day.counts).toMatchObject({ search: 1, 'search-open': 1, 'form-error-price': 1, 'form-error-serial': 1, 'share-open': 1, 'share-sent': 1, 'new-open': 1, 'new-saved': 1 });

  await setDay(page, NEXT_DAY);
  await clickRefresh(page);
  await expect.poll(() => srv.usageCalls.length).toBe(1);
  const sent = JSON.stringify(srv.usageCalls[0]);
  const stored = await page.evaluate(() => JSON.stringify(localStorage.getItem('gallery_usage')));
  for (const secret of [ART.name, 'גליל', ART.name_en, ART.sku, ART.serial_number, '4455', '9917356', ART.location, ART.notes, '734519', '734520', '81234', 'יצירה סודית', 'SKU-ZZ93', 'הערה סודית', 'שרה', 'test-user', 'U1']) {
    expect(sent, `"${secret}" was sent`).not.toContain(secret);
    expect(stored, `"${secret}" is kept`).not.toContain(secret);
  }
  // only the fixed names, and numbers
  const [entry] = srv.usageCalls[0];
  expect(Object.keys(entry).sort()).toEqual(['counts', 'day', 'device_id', 'installed', 'kind', 'times', 'version']);
  for (const [k, v] of Object.entries(entry.counts)) expect([k, typeof v]).toEqual([expect.stringMatching(/^([a-z-]+|(rage|dead):[a-z0-9-]+)$/), 'number']);
  for (const list of Object.values(entry.times)) for (const v of list) expect(typeof v).toBe('number');
});

test('TC-USE-002: the form - opened, closed at once without a change, each field error, a new artwork and how long it took, leaving without saving, undo after delete', async ({ page }) => {
  await server(page);
  await seedItems(page, [ART, OTHER]);
  await reloadAndWait(page);

  await page.locator('.card', { hasText: OTHER.name }).locator('.name').click();
  await page.click('#item-overlay button:has-text("ביטול")'); // opened by mistake
  await openNewItemForm(page);
  await page.click('#item-overlay button[type=submit]'); // no name
  await fillItemForm(page, { name: 'חדשה', price: -1 });
  await page.click('#item-overlay button[type=submit]'); // bad price
  await fillItemForm(page, { price: 10, serial: '4455' });
  await page.click('#item-overlay button[type=submit]'); // serial taken
  await fillItemForm(page, { serial: '' });
  await saveItemForm(page);
  // changed, then left without saving
  await page.locator('.card', { hasText: OTHER.name }).locator('.name').click();
  await page.fill('#item-overlay textarea', 'שינוי');
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.click('.discard-confirm button.danger');
  // deleted, then undone
  await page.locator('.card', { hasText: OTHER.name }).locator('.name').click();
  await page.click('#item-overlay .danger-btn');
  await page.click('.confirm-modal button.danger');
  await page.click('.toast button:has-text("ביטול")');
  await expect(page.locator('.card', { hasText: OTHER.name })).toBeVisible();

  const { counts, times } = await counted(page);
  expect(counts).toMatchObject({
    'form-open': 4, 'form-quick-close': 1, 'form-error-name': 1, 'form-error-price': 1, 'form-error-serial': 1,
    'new-open': 1, 'new-saved': 1, 'leave-unsaved': 1, 'undo-delete': 1,
  });
  expect(times.form).toHaveLength(4);
  expect(times['new-time']).toHaveLength(1);
  expect(times.open).toHaveLength(1); // opening the app, once
});

test('TC-USE-003: taps - 3 quick taps on one button count once, by its fixed name; 2 don\'t; a tap on something that isn\'t clickable; a disabled button counts too', async ({ page }) => {
  await server(page);
  await seedItems(page, [ART]);
  await reloadAndWait(page);
  const sync = page.locator('button[data-usage="sync"]');
  for (let i = 0; i < 2; i++) await sync.click();
  expect((await counted(page)).counts['rage:sync']).toBeUndefined();
  await page.waitForTimeout(1100);
  for (let i = 0; i < 5; i++) await sync.click({ delay: 0 });
  expect((await counted(page)).counts['rage:sync']).toBe(1);

  await page.click('.brand-logo'); // the logo isn't a button
  expect((await counted(page)).counts['dead:header']).toBe(1);

  // "share" while the card is still being made - disabled, tapped again and again
  await page.unroute(MOCK_URL);
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getImage') await new Promise((r) => setTimeout(r, 3000));
    return route.fulfill({ json: body.action === 'getImage' ? { mime: 'image/png', data: PNG_B64 } : { items: [], config: {} } });
  });
  await fakeShareSheet(page);
  await page.locator('.card .share-icon-btn').click();
  const send = page.locator('.share-dialog button[data-usage="send"]');
  await expect(send).toBeDisabled();
  const box = await send.boundingBox();
  for (let i = 0; i < 3; i++) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect((await counted(page)).counts['rage:send']).toBe(1);
});

test('TC-USE-004: the share funnel - opened, card ready (and how long), sent; closed without sending; failed', async ({ page }) => {
  await server(page);
  const NO_FILE = { row_id: 'U3', name: 'בלי קובץ', availability_status: 'available', image_url: 'https://drive.google.com/thumbnail?id=GONE&sz=w1000' };
  await seedItems(page, [ART, NO_FILE]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  const open = (name = ART.name) => page.locator('.card', { hasText: name }).locator('.share-icon-btn').click();

  await open();
  await page.click('.share-dialog button.primary:not([disabled])');
  await expect(page.locator('.share-dialog')).toHaveCount(0);
  await open();
  await expect(page.locator('.share-dialog button.primary:not([disabled])')).toBeVisible();
  await page.click('.share-dialog button:has-text("ביטול")');
  await fakeShareSheet(page, { cancel: true }); // the share sheet closed - then the window
  await open();
  await page.click('.share-dialog button.primary:not([disabled])');
  await page.click('.share-dialog button:has-text("ביטול")');
  await page.unroute(MOCK_URL);
  await page.route(MOCK_URL, (route) => route.fulfill({ json: { error: 'photo too large to share as a file' } }));
  await open(NO_FILE.name);
  await expect(page.locator('.share-failed')).toBeVisible();
  await page.click('.share-dialog button:has-text("ביטול")');

  await expect.poll(async () => (await counted(page)).counts['share-cancel']).toBe(2);
  const { counts, times } = await counted(page);
  expect(counts).toMatchObject({ 'share-open': 4, 'share-ready': 3, 'share-sent': 1, 'share-cancel': 2, 'share-failed': 1 });
  expect(times.card).toHaveLength(3);
});

test('TC-USE-005: search - counted once the typing stops, with "no results"; opening an artwork from the results', async ({ page }) => {
  await server(page);
  await seedItems(page, [ART, OTHER]);
  await reloadAndWait(page);
  await page.locator('.search-box input').pressSequentially('לא קיים', { delay: 30 });
  await page.waitForTimeout(1700);
  expect((await counted(page)).counts).toMatchObject({ search: 1, 'search-empty': 1 });
  await page.fill('.search-box input', 'שקיעה');
  await page.locator('.card', { hasText: 'שקיעה' }).locator('.name').click(); // before the search was counted - not from "results"
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.waitForTimeout(1700);
  await page.locator('.card', { hasText: 'שקיעה' }).locator('.name').click();
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.locator('.card', { hasText: 'שקיעה' }).locator('.name').click(); // the same search - once
  const { counts } = await counted(page);
  expect(counts).toMatchObject({ search: 2, 'search-empty': 1, 'search-open': 1 });
});

test('TC-USE-006: sent once a day - finished days only; a refused or failed send keeps them for later; today is never sent', async ({ page }) => {
  const srv = await server(page, { usage: 'old' });
  await reloadAndWait(page);
  await clickRefresh(page);
  await page.waitForTimeout(500);
  expect(srv.usageCalls).toHaveLength(0); // only today so far
  await setDay(page, NEXT_DAY);
  await clickRefresh(page);
  await expect.poll(() => srv.usageCalls.length).toBe(1);
  expect(srv.usageCalls[0].map((d) => d.day)).toEqual([DAY]);
  expect(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem('gallery_usage'))))).toContain(DAY); // kept
  await expect(page.locator('.toast.error')).toHaveCount(0); // never shown - it's not the user's problem

  srv.usage = 'ok';
  await clickRefresh(page);
  await expect.poll(() => srv.usageCalls.length).toBe(2);
  expect(srv.usageCalls[1].map((d) => d.day)).toEqual([DAY]);
  const left = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('gallery_usage'))));
  expect(left).not.toContain(DAY);
  await clickRefresh(page);
  await page.waitForTimeout(500);
  expect(srv.usageCalls).toHaveLength(2); // nothing new to send
  const [entry] = srv.usageCalls[1];
  expect(entry.device_id).toMatch(/^[a-z0-9]{10}$/);
  expect(entry.kind).toBe('computer');
  expect(entry.counts['sync-ok']).toBeGreaterThan(0);
  expect(entry.times.sync.length).toBeGreaterThan(0);
});

test('TC-USE-007: the app and the server know the same names (a name only one side knows would be lost)', async () => {
  const code = fs.readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../../src/telemetry/usage.js', import.meta.url), 'utf8');
  const list = (src, name) => JSON.parse(src.match(new RegExp(`${name} = (\\[[\\s\\S]*?\\]);`))[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  expect(list(client, 'USAGE_COUNTS')).toEqual(list(code, 'USAGE_COUNTS'));
  expect(list(client, 'USAGE_TIMES')).toEqual(list(code, 'USAGE_TIMES'));
  // every element name in the app's code has a plain-language label in the report
  const names = new Set();
  for (const file of fs.readdirSync(new URL('../../src', import.meta.url), { recursive: true })) {
    if (!/\.jsx?$/.test(file) || file.startsWith('telemetry')) continue; // the names in use, not the explanation
    const src = fs.readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/data-(usage|dead)="([a-z0-9-]+)"/g)) names.add(`${m[1] === 'usage' ? 'rage' : 'dead'}:${m[2]}`);
  }
  expect(names.size).toBeGreaterThan(8);
  for (const name of names) expect(code, name).toContain(`'${name}':`);
});

test('TC-FB-001: "💡 suggestion or problem" - sent under the sender\'s name, with the screens, the version and the device type', async ({ page }) => {
  const srv = await server(page);
  await seedItems(page, [ART]);
  await reloadAndWait(page);
  await page.locator('.card .name').click();
  await page.click('#item-overlay button:has-text("ביטול")');
  await openMenuItem(page, 'הצעה או בעיה');
  const dialog = page.locator('.feedback-dialog');
  await expect(dialog.locator('h2')).toHaveText('💡 הצעה או בעיה');
  await expect(dialog).toContainText('מה היה קשה / מה חסר?');
  await expect(dialog).toContainText('ההצעה תישלח בשמך (שרה)');
  await expect(dialog.locator('button.primary')).toBeDisabled();
  await dialog.locator('textarea').fill('   ');
  await expect(dialog.locator('button.primary')).toBeDisabled();
  await dialog.locator('textarea').fill('חסר מיון לפי גודל');
  await dialog.locator('button.primary').click();
  await expect(page.locator('.toast')).toContainText('תודה! ההצעה נשלחה');
  await expect(dialog).toHaveCount(0);
  expect(srv.feedbackCalls).toHaveLength(1);
  const [entry] = srv.feedbackCalls[0];
  expect(entry).toMatchObject({ text: 'חסר מיון לפי גודל', member: 'שרה', kind: 'computer', screens: ['catalog', 'form-edit', 'catalog'] });
  expect(entry.version).toBeTruthy();
  expect(entry.id).toBeTruthy();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gallery_feedback_queue') || '[]'))).toHaveLength(0);
});

test('TC-FB-002: without internet - kept and sent with a later sync; a server that refuses it - an error with a code, still kept', async ({ page, context }) => {
  const srv = await server(page, { feedback: 'old' });
  await reloadAndWait(page);
  await context.setOffline(true);
  await openMenuItem(page, 'הצעה או בעיה');
  await page.fill('.feedback-dialog textarea', 'בלי אינטרנט');
  await page.click('.feedback-dialog button.primary');
  await expect(page.locator('.toast')).toContainText('ההצעה נשמרה ותישלח כשיהיה אינטרנט');
  await expect(page.locator('.toast.error')).toHaveCount(0);
  await context.setOffline(false);

  await openMenuItem(page, 'הצעה או בעיה');
  await page.fill('.feedback-dialog textarea', 'שרת ישן');
  await page.click('.feedback-dialog button.primary');
  const toast = page.locator('.toast.error');
  await expect(toast).toContainText('ההצעה נשמרה במכשיר ותישלח בהמשך');
  await expect(toast.locator('.error-code')).toContainText(/E-[A-Z2-9]{4}/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gallery_feedback_queue')).map((e) => e.text))).toEqual(['בלי אינטרנט', 'שרת ישן']);

  srv.feedback = 'ok';
  await clickRefresh(page);
  await expect.poll(() => srv.feedbackCalls.at(-1)?.map((e) => e.text)).toEqual(['בלי אינטרנט', 'שרת ישן']);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gallery_feedback_queue')).length)).toBe(0);
});
