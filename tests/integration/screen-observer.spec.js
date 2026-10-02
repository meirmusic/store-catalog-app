// SPEC.md 22.2-22.4, 22.8: an "observer" records everything that ever
// appeared on screen, with timing - a normal expect() waits for the final
// state and would miss a flash. TEST_PLAN.md TC-OBS-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, openNewItemForm, fillItemForm, saveItemForm, openManageLists } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const ITEMS = [{ row_id: 'O1', name: 'זריחה', price: 1000, availability_status: 'available' }];

async function observe(page) {
  await page.addInitScript(() => {
    window.__seen = []; // { at, what, text }
    const last = {};
    const watch = { toast: '.toast', empty: '.empty-state', stats: '.stats-toggle', chips: '.status-cluster .chip', banner: '.update-banner' };
    const t0 = performance.now();
    function snap() {
      for (const [what, sel] of Object.entries(watch)) {
        const text = [...document.querySelectorAll(sel)].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | ');
        if (text !== last[what]) {
          last[what] = text;
          window.__seen.push({ at: performance.now() - t0, what, text });
        }
      }
    }
    new MutationObserver(snap).observe(document, { childList: true, subtree: true, characterData: true });
  });
}

const seen = (page, what) => page.evaluate((what) => window.__seen.filter((e) => e.what === what), what);

// How long `text` stayed in the toast before the toast changed.
async function visibleFor(page, text) {
  const toasts = await seen(page, 'toast');
  const i = toasts.findIndex((e) => e.text.includes(text));
  if (i === -1) return -1;
  const next = toasts[i + 1];
  return next ? next.at - toasts[i].at : Infinity;
}

async function server(page, { pullDelay = 0 } = {}) {
  let items = [...ITEMS];
  const timeline = [];
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') {
      timeline.push({ action: 'getAll-asked', at: Date.now() });
      if (pullDelay) await new Promise((r) => setTimeout(r, pullDelay));
      timeline.push({ action: 'getAll-answered', at: Date.now() });
      return route.fulfill({ json: { items: items.filter((it) => !it.is_deleted), config: {} } });
    }
    if (body.action === 'upsert') {
      timeline.push({ action: 'upsert-asked', at: Date.now() });
      items = [...items.filter((it) => it.row_id !== body.payload.row_id), body.payload];
      timeline.push({ action: 'upsert-answered', at: Date.now() });
      return route.fulfill({ json: body.payload });
    }
    if (body.action === 'softDelete') {
      items = items.map((it) => (it.row_id === body.payload.row_id ? { ...it, is_deleted: true } : it));
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  return timeline;
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, ITEMS);
});

test('TC-OBS-001: opening the app never shows "no items" or a 0 total while the catalog loads', async ({ page }) => {
  await server(page);
  await observe(page);
  await reloadAndWait(page);
  await expect(page.locator('.card')).toHaveCount(1);
  await page.waitForTimeout(300);
  expect(await seen(page, 'empty')).toEqual(expect.not.arrayContaining([expect.objectContaining({ text: expect.stringContaining('לא נמצאו') })]));
  expect((await seen(page, 'stats')).map((e) => e.text)).not.toContainEqual(expect.stringMatching(/סה"כ פריטים: 0\b/));
});

test('TC-OBS-002: "saved" stays readable (at least 1.5s) before "synced" replaces it, even on a fast connection', async ({ page }) => {
  await server(page);
  await reloadAndWait(page);
  await observe(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'חדשה' });
  await saveItemForm(page);
  await expect(page.locator('.toast')).toContainText('סונכרן ✓', { timeout: 5000 });
  expect(await visibleFor(page, 'נשמר מקומית')).toBeGreaterThanOrEqual(1400);
});

test('TC-OBS-003: "restored" after undo stays readable before "synced"', async ({ page }) => {
  await server(page);
  await observe(page);
  await reloadAndWait(page);
  await page.click('.card');
  await page.click('#item-overlay .danger-btn');
  await page.click('.confirm-modal button.danger');
  await page.locator('.toast .toast-action').click();
  await expect(page.locator('.toast')).toContainText('סונכרן ✓', { timeout: 5000 });
  expect(await visibleFor(page, 'הפריט הוחזר')).toBeGreaterThanOrEqual(1400);
});

test('TC-OBS-004: "added to the list" stays readable before "synced"', async ({ page }) => {
  await server(page);
  await observe(page);
  await reloadAndWait(page);
  await openManageLists(page);
  const location = page.locator('#config-overlay .field', { hasText: 'מיקום' });
  await location.locator('input').fill('תערוכה');
  await location.locator('button').click();
  await expect(page.locator('.toast')).toContainText('סונכרן ✓', { timeout: 5000 });
  expect(await visibleFor(page, 'נוסף לרשימה')).toBeGreaterThanOrEqual(1400);
});

test('TC-OBS-005: "synced" shows as soon as the change reached the server - not after a slow data refresh', async ({ page }) => {
  const timeline = await server(page, { pullDelay: 3000 });
  await reloadAndWait(page);
  await page.waitForTimeout(3500); // let the opening (slow) refresh finish
  timeline.length = 0;
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'מהר' });
  await saveItemForm(page);
  await expect(page.locator('.toast')).toContainText('סונכרן ✓', { timeout: 6000 });
  const shownAt = Date.now();
  const pushedAt = timeline.find((e) => e.action === 'upsert-answered').at;
  const pull = timeline.find((e) => e.action === 'getAll-answered' && e.at > pushedAt); // this save's refresh
  expect(pull === undefined || shownAt < pull.at).toBe(true); // shown before that refresh answered
  expect(shownAt - pushedAt).toBeLessThan(2000);
});

test('TC-OBS-006: with the server down on opening, the header never shows a dangling "not updated since"', async ({ page }) => {
  await page.route(MOCK_URL, (route) => route.fulfill({ status: 500, body: 'down' }));
  await observe(page);
  await reloadAndWait(page);
  await expect(page.locator('.chip-problem')).toBeVisible({ timeout: 5000 });
  const chips = (await seen(page, 'chips')).map((e) => e.text);
  expect(chips.some((text) => /לא עודכן מאז(\s*\||\s*$)/.test(text))).toBe(false);
});
