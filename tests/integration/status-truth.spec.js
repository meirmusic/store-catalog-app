// SPEC.md 22.6-22.7: each status field tells the truth in every state -
// one test per row of the truth tables. TEST_PLAN.md TC-TRUTH-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, openMenuItem, getPendingChanges } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const REFRESH = 'button[title="רענון ידני"]';
const HHMM = /\b\d{2}:\d{2}\b/;

async function server(page, initial = {}) {
  const state = { pull: 'ok', push: 'ok', ...initial };
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') {
      if (state.pull === 'down') return route.fulfill({ status: 500, body: 'down' });
      if (state.pull === 'abort') return route.abort('connectionrefused');
      return route.fulfill({ json: { items: [], config: {} } });
    }
    if (state.push === 'down') return route.fulfill({ json: { error: 'push rejected by server' } });
    return route.fulfill({ json: { ...body.payload } });
  });
  return state;
}

function row(page, label) {
  return page.locator('.support-rows > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');
}

async function openSupport(page) {
  await openMenuItem(page, 'מידע ותמיכה');
  await expect(page.locator('.support-info')).toBeVisible();
}

async function closeSupport(page) {
  await page.click('.support-info button:has-text("סגירה")');
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.evaluate(() => ['gallery_last_pull_ok', 'gallery_last_push_ok', 'gallery_server_status', 'gallery_recent_errors'].forEach((k) => localStorage.removeItem(k)));
});

test('TC-TRUTH-001: all fine - server answering, last data received now, nothing pending', async ({ page }) => {
  await server(page);
  await reloadAndWait(page);
  await page.click(REFRESH);
  await openSupport(page);
  await expect(row(page, 'אינטרנט')).toHaveText('מחובר');
  await expect(row(page, 'שרת')).toContainText('עונה · נבדק היום');
  await expect(row(page, 'קבלת נתונים אחרונה')).toContainText('היום');
  await expect(row(page, 'שליחת שינויים אחרונה')).toHaveText('עוד לא נשלחו שינויים מהמכשיר הזה');
  await expect(row(page, 'ממתינים לסנכרון')).toHaveText('0');
});

test('TC-TRUTH-002: online but the server does not answer - "connected" is not claimed for the server', async ({ page }) => {
  const state = await server(page);
  await reloadAndWait(page);
  await page.click(REFRESH);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gallery_last_pull_ok'))).not.toBeNull();
  const lastOk = await page.evaluate(() => localStorage.getItem('gallery_last_pull_ok'));
  state.pull = 'abort';
  await page.click(REFRESH);
  await expect(page.locator('.chip-problem')).toContainText(/לא עודכן מאז \d{2}:\d{2}/); // header: since when, 24h
  await openSupport(page);
  await expect(row(page, 'אינטרנט')).toHaveText('מחובר');
  await expect(row(page, 'שרת')).toContainText('לא עונה');
  await expect(row(page, 'שרת')).toContainText('Failed to fetch');
  // The last successful time is kept, not reset by the failure.
  expect(await page.evaluate(() => localStorage.getItem('gallery_last_pull_ok'))).toBe(lastOk);
  await expect(row(page, 'קבלת נתונים אחרונה')).toContainText('היום');
});

test('TC-TRUTH-003: the server answers with an error - "answered with an error", with the reason', async ({ page }) => {
  await server(page, { pull: 'down' });
  await reloadAndWait(page);
  await page.click(REFRESH);
  await openSupport(page);
  await expect(row(page, 'שרת')).toContainText('לא עונה'); // HTTP 500: no usable answer
  await expect(row(page, 'שרת')).toContainText('API error 500');
  await expect(row(page, 'קבלת נתונים אחרונה')).toHaveText('אף פעם במכשיר הזה');
});

test('TC-TRUTH-004: never received data - the header says so in full, not a dangling "since"', async ({ page }) => {
  await server(page, { pull: 'down' });
  await reloadAndWait(page);
  await page.click(REFRESH);
  await expect(page.locator('.chip-problem')).toHaveText('לא התקבלו נתונים מהשרת');
});

test('TC-TRUTH-005: sending fails while receiving works - last send is not claimed as now, stuck count is live', async ({ page }) => {
  const state = await server(page, { push: 'down' });
  await seedItems(page, [{ row_id: 'P1', name: 'לא נשלח' }]);
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.js');
    await db.pendingChanges.add({ row_id: 'P1', op: 'upsert', payload: null, createdAt: Date.now(), attempts: 4 });
  });
  await reloadAndWait(page);
  await openSupport(page);
  await expect(row(page, 'שליחת שינויים אחרונה')).toHaveText('עוד לא נשלחו שינויים מהמכשיר הזה');
  await expect(row(page, 'קבלת נתונים אחרונה')).toContainText('היום');
  // A 5th failure while the window is open - the stuck count follows live.
  await closeSupport(page);
  await page.click(REFRESH);
  await expect.poll(async () => (await getPendingChanges(page))[0].attempts).toBeGreaterThanOrEqual(5);
  await openSupport(page);
  await expect(row(page, 'ממתינים לסנכרון')).toHaveText('1 (תקועים: 1)');
  state.push = 'ok';
  await page.click('.support-info button:has-text("סגירה")');
  await page.click(REFRESH);
  await openSupport(page);
  await expect(row(page, 'ממתינים לסנכרון')).toHaveText('0');
  await expect(row(page, 'שליחת שינויים אחרונה')).toContainText('היום');
});

test('TC-TRUTH-006: after closing and reopening the app, the times are still there', async ({ page }) => {
  await server(page);
  await reloadAndWait(page);
  await page.click(REFRESH);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gallery_last_pull_ok'))).not.toBeNull();
  await page.unroute(MOCK_URL);
  await server(page, { pull: 'down' });
  await reloadAndWait(page); // reopened, and this time the server is down
  await page.click(REFRESH);
  await expect(page.locator('.chip-problem')).toContainText(/^לא עודכן מאז \d{2}:\d{2}$/);
  await openSupport(page);
  await expect(row(page, 'קבלת נתונים אחרונה')).toContainText(HHMM);
});

test('TC-TRUTH-007: an error shown while offline is listed too, marked as not sent to the log', async ({ page, context }) => {
  await server(page);
  await reloadAndWait(page);
  await context.setOffline(true);
  await page.evaluate(async () => {
    const { reportError } = await import('/src/errors/errorReporting.js');
    reportError('sync-pull', new TypeError('Failed to fetch'), { log: false });
  });
  await context.setOffline(false);
  await openSupport(page);
  const item = page.locator('.support-errors li', { hasText: 'sync-pull' });
  await expect(item).toContainText('לא נשלחה ליומן');
  await expect(item).toContainText('Failed to fetch');
});

test('TC-TRUTH-008: the device line is readable and says it is as reported; the copy keeps the raw text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await server(page);
  await reloadAndWait(page);
  await openSupport(page);
  await expect(row(page, 'מכשיר')).toContainText(/^Computer · Windows · Chrome \d+ · /); // Playwright's desktop profile reports Windows
  await expect(row(page, 'מכשיר')).toContainText('דפדפן (כפי שהמכשיר מדווח)');
  await page.click('.support-info button.primary');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('User agent: Mozilla/5.0');
  expect(copied).toContain('שרת:');
});
