// docs/RESTORE.md (SPEC.md 34) promises two things about the phones - checked
// here on the real app, so the guide stays true. TEST_PLAN.md TC-RST-*.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, clickRefresh, getItems, exportFromMenu } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const NOW = new Date().toISOString();
const ARTWORKS = Array.from({ length: 12 }, (_, i) => ({
  row_id: `R${i}`, name: `יצירה ${i}`, serial_number: String(7000 + i), sku: `YB-${i}`, location: 'מחסן', price: 1000 + i,
  notes: 'הערה', availability_status: i === 0 ? 'sold' : 'available', is_deleted: false, last_modified_at: NOW,
}));

async function server(page, answer) {
  const state = { answer };
  await page.route(MOCK_URL, (route) => {
    const body = JSON.parse(route.request().postData());
    return route.fulfill({ json: body.action === 'getAll' ? state.answer() : { ok: true } });
  });
  return state;
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
});

test('TC-RST-001: guide case 1 - an artwork un-deleted in the Sheet (is_deleted FALSE) comes back on the phone at the next sync', async ({ page }) => {
  const srv = await server(page, () => ({ items: ARTWORKS.slice(1), config: {} })); // R0 deleted in the Sheet
  await seedItems(page, ARTWORKS);
  await reloadAndWait(page);
  await clickRefresh(page);
  await expect(page.locator('.card', { hasText: 'יצירה 0' })).toHaveCount(0);
  srv.answer = () => ({ items: ARTWORKS, config: {} }); // Meir set is_deleted to FALSE
  await clickRefresh(page);
  await expect(page.locator('.card .name', { hasText: /^יצירה 0$/ })).toBeVisible();
});

test('TC-RST-002: guide case 3 - the Sheet gone (error), refused (password changed) or empty: the phone keeps every artwork, and "export to Excel" still gives all of them', async ({ page }) => {
  const srv = await server(page, () => ({ items: ARTWORKS, config: {} }));
  await seedItems(page, ARTWORKS);
  await reloadAndWait(page);
  await clickRefresh(page);
  for (const gone of [
    () => ({ error: "TypeError: Cannot read properties of null (reading 'getDataRange')" }),
    () => ({ error: 'forbidden' }),
    () => ({ items: [], config: {} }),
  ]) {
    srv.answer = gone;
    await clickRefresh(page);
    await page.waitForTimeout(800);
    expect((await getItems(page)).length).toBe(ARTWORKS.length);
  }
  const download = page.waitForEvent('download');
  await exportFromMenu(page);
  const csv = fs.readFileSync(await (await download).path(), 'utf8');
  const rows = csv.trim().split(/\r?\n/);
  expect(rows).toHaveLength(1 + ARTWORKS.length);
  for (const a of ARTWORKS) expect(csv).toContain(a.serial_number);
  expect(csv).toContain('YB-11');
  expect(csv).toContain('מחסן');
});
