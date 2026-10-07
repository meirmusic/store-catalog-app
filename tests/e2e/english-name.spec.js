// SPEC.md 27.3 - the artwork's name in English, typed by hand.
// TEST_PLAN.md TC-EN-*.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { pickIdentity, clearAllData, reloadAndWait, getItems } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const ART = { row_id: 'E1', name: 'זריחה בגליל', name_en: null, size: '91X132', type: 'מקורי', price: 2500, availability_status: 'available' };
const strip = (s) => s.replace(/[‎‏]/g, '');

// A server that keeps the English name (features: name_en) - or an older one.
async function server(page, { features = ['name_en'], items = [ART] } = {}) {
  const sent = [];
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'upsert') sent.push(body.payload || body.item || body);
    if (body.action === 'getAll') return route.fulfill({ json: { items, config: {}, ...(features ? { features } : {}) } });
    return route.fulfill({ json: { ok: true } });
  });
  return sent;
}

async function start(page, opts) {
  const sent = await server(page, opts);
  await pickIdentity(page);
  await page.evaluate(() => localStorage.removeItem('gallery_server_features'));
  await clearAllData(page);
  await reloadAndWait(page);
  await expect(page.locator('.card')).toHaveCount((opts?.items ?? [ART]).length);
  return sent;
}

test('TC-EN-001: with a server that doesn\'t keep it yet, there is no English name field - nothing changes', async ({ page }) => {
  await start(page, { features: null });
  await page.click('.card .name');
  await expect(page.locator('#item-overlay')).toBeVisible();
  await expect(page.locator('#item-name-en')).toHaveCount(0);
});

test('TC-EN-002: the field appears once the server keeps it; typed by hand, left to right, and saved - nothing translated', async ({ page }) => {
  const sent = await start(page);
  await page.click('.card .name');
  const field = page.locator('#item-name-en');
  await expect(field).toBeVisible();
  await expect(field).toHaveValue(''); // empty - no automatic translation
  await expect(field).toHaveAttribute('dir', 'ltr');
  await field.fill('Sunrise over the Galilee');
  await page.click('#item-overlay button:has-text("שמירה")');
  await expect(page.locator('#item-overlay')).toHaveCount(0);
  expect((await getItems(page)).find((it) => it.row_id === 'E1').name_en).toBe('Sunrise over the Galilee');
  await expect.poll(() => sent.some((p) => JSON.stringify(p).includes('Sunrise over the Galilee'))).toBe(true);
});

test('TC-EN-003: sharing in English uses the English name; in Hebrew the Hebrew one; with no English name - the Hebrew one', async ({ page }) => {
  await start(page, { items: [{ ...ART, name_en: 'Sunrise over the Galilee' }, { ...ART, row_id: 'E2', name: 'גשם', name_en: null }] });
  await page.locator('.card', { hasText: 'זריחה בגליל' }).locator('.share-icon-btn').click();
  await page.click('.share-lang button:has-text("English")');
  await expect.poll(async () => strip(await page.locator('.share-preview').textContent())).toContain('Yossi Bitton - Sunrise over the Galilee');
  await page.click('.share-lang button:has-text("עברית")');
  await expect.poll(async () => strip(await page.locator('.share-preview').textContent())).toContain('Yossi Bitton - זריחה בגליל');
  await page.click('.share-dialog button:has-text("ביטול")');
  await page.locator('.card', { hasText: 'גשם' }).locator('.share-icon-btn').click();
  await page.click('.share-lang button:has-text("English")');
  await expect.poll(async () => strip(await page.locator('.share-preview').textContent())).toContain('Yossi Bitton - גשם');
});

test('TC-EN-004: search finds an artwork by its English name', async ({ page }) => {
  await start(page, { items: [{ ...ART, name_en: 'Sunrise over the Galilee' }, { ...ART, row_id: 'E2', name: 'גשם' }] });
  await page.fill('.toolbar input', 'sunrise');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('זריחה בגליל');
});

test('TC-EN-005: duplicating does not copy the English name; a draft keeps it', async ({ page }) => {
  await start(page, { items: [{ ...ART, name_en: 'Sunrise' }] });
  await page.click('.card .name');
  await page.click('#item-overlay button:has-text("שכפול")');
  await expect(page.locator('#item-name-en')).toHaveValue('');
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.click('.card .name');
  await page.locator('#item-name-en').fill('Sunrise II');
  await page.waitForTimeout(900);
  await reloadAndWait(page);
  await page.click('.draft-banner button:has-text("שחזור")');
  await expect(page.locator('#item-name-en')).toHaveValue('Sunrise II');
});

test('TC-EN-006: the Excel export has an "English name" column', async ({ page }) => {
  await start(page, { items: [{ ...ART, name_en: 'Sunrise' }] });
  const download = page.waitForEvent('download');
  await page.click('button:has-text("ייצוא לאקסל")');
  const csv = fs.readFileSync(await (await download).path(), 'utf8');
  expect(csv).toContain('שם היצירה באנגלית');
  expect(csv).toContain('Sunrise');
});
