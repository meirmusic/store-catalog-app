// SPEC.md 32 - design package B (docs/ddd/001-design-package-b.md, approved
// decisions 1-10). TEST_PLAN.md TC-PB-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, openNewItemForm } from '../helpers/app.js';

const NOW = new Date().toISOString();
const ITEMS = Array.from({ length: 9 }, (_, i) => ({
  row_id: `PB${i}`, name: i === 0 ? 'נשמת הכותל' : `יצירה ${i}`, size: '120X80', type: 'מקורי', physical_status: 'ממוסגר',
  location: 'גלריה', sku: `YB-${i}`, serial_number: String(4100 + i), price: 3200 + i, availability_status: 'available',
  image_url: i % 3 === 2 ? null : `https://drive.google.com/thumbnail?id=PB${i}&sz=w1000`, last_modified_at: NOW,
}));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const OLD_ICONS = /[⟳⚙👤🔍⤴🖼▦☰💡⏳]/u;
const PHONE = { width: 390, height: 844 };

test.beforeEach(async ({ page }) => {
  await page.route('https://drive.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, ITEMS);
  await reloadAndWait(page);
});

const style = (page, selector, prop) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el)[p], prop);

test('TC-PB-001: no emoji icons anywhere in the app\'s chrome - drawn line icons, and every icon-only button keeps its name', async ({ page }) => {
  for (const view of ['cards', 'list']) {
    if (view === 'list') await page.click('.view-toggle button:nth-child(2)');
    const text = await page.locator('header.top, .toolbar, .grid, .item-rows').evaluateAll((els) => els.map((e) => e.innerText).join(' '));
    expect(text, view).not.toMatch(OLD_ICONS);
  }
  await page.click('.header-menu > button');
  expect(await page.locator('.header-menu-list').innerText()).not.toMatch(OLD_ICONS);
  await expect(page.locator('.header-menu-list .menu-with-icon svg.icon-bulb')).toHaveCount(1);
  await page.keyboard.press('Escape');
  for (const sel of ['button[data-usage="sync"]', '.header-menu > button', '.view-toggle button', '.share-icon-btn', '.row-zoom']) {
    const named = await page.locator(sel).evaluateAll((els) => els.every((b) => (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim().length > 1));
    expect(named, sel).toBe(true);
  }
  await expect(page.locator('button[data-usage="sync"] svg.icon-sync')).toHaveCount(1);
});

test('TC-PB-002: corners - cards almost square, controls slightly rounded, round only on the photo and the share button', async ({ page }) => {
  expect(await style(page, '.card', 'borderTopLeftRadius')).toBe('2px');
  expect(await style(page, '.toolbar .btn', 'borderTopLeftRadius')).toBe('4px');
  expect(await style(page, '.search-box input', 'borderTopLeftRadius')).toBe('4px');
  expect(await style(page, 'header.top .icon-btn', 'borderTopLeftRadius')).toBe('4px');
  expect(await style(page, '.thumb-zoom', 'borderTopLeftRadius')).toBe('50%');
  expect(await style(page, '.share-icon-btn', 'borderTopLeftRadius')).toBe('50%');
});

test('TC-PB-003: the name in the catalog serif, the price in Cormorant - larger, even figures; all from inside the app (no Google Fonts)', async ({ page }) => {
  const fontRequests = [];
  page.on('request', (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) fontRequests.push(r.url()); });
  await reloadAndWait(page); // Google Fonts are blocked in tests - the fonts must load anyway
  await page.evaluate(() => document.fonts.ready);
  expect(await style(page, '.card .name', 'fontFamily')).toMatch(/^"Frank Ruhl Libre"/);
  expect(await style(page, '.card .price', 'fontFamily')).toMatch(/^"Cormorant Garamond"/);
  expect(parseFloat(await style(page, '.card .price', 'fontSize'))).toBeGreaterThanOrEqual(18);
  expect(await style(page, '.card .price', 'fontVariantNumeric')).toContain('lining-nums');
  await page.evaluate(() => Promise.all(['700 16px "Frank Ruhl Libre"', '500 19px "Cormorant Garamond"', '400 16px "Assistant"', '700 16px "Assistant"'].map((f) => document.fonts.load(f, 'אב12'))));
  const loaded = await page.evaluate(() => ['700 16px "Frank Ruhl Libre"', '500 19px "Cormorant Garamond"', '400 16px "Assistant"', '700 16px "Assistant"'].map((f) => document.fonts.check(f, 'אב12')));
  expect(loaded).toEqual([true, true, true, true]);
  expect(fontRequests).toEqual([]);
});

test('TC-PB-004: "export to Excel" is in the ⚙ menu, says how many it exports - what\'s shown - and is gone from the toolbar', async ({ page }) => {
  await expect(page.locator('.toolbar button', { hasText: 'אקסל' })).toHaveCount(0);
  await page.click('.header-menu > button');
  await expect(page.locator('.header-menu-list .menu-export')).toHaveText(`ייצוא לאקסל (${ITEMS.length} היצירות שמוצגות)`);
  await page.keyboard.press('Escape');
  await page.fill('.search-box input', 'נשמת');
  await page.click('.header-menu > button');
  await expect(page.locator('.header-menu-list .menu-export')).toHaveText('ייצוא לאקסל (1 היצירות שמוצגות)');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.header-menu-list .menu-export')]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  await page.click('.header-menu > button');
  await page.keyboard.press('Escape');
  await page.fill('.search-box input', 'אין כזה');
  await page.click('.header-menu > button');
  await expect(page.locator('.header-menu-list .menu-export')).toBeDisabled(); // nothing to export
});

test('TC-PB-005: on a phone, "+ new artwork" is a round button in the corner - the toolbar row goes, it opens the form, it never hides the last artwork', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await expect(page.locator('.toolbar .new-item-btn')).toBeHidden();
  const fab = page.locator('.fab-new');
  await expect(fab).toBeVisible();
  const box = await fab.boundingBox();
  expect(box.x).toBeLessThan(40);
  expect(box.y + box.height).toBeGreaterThan(PHONE.height - 100);
  expect(box.width).toBeGreaterThanOrEqual(44);
  const tops = await page.locator('.toolbar-row > *').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().top));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(8); // filters, sort and view - one row
  // at the very bottom, the last card ends above the round button
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const lastBottom = await page.locator('.card').last().evaluate((el) => el.getBoundingClientRect().bottom);
  expect(lastBottom).toBeLessThanOrEqual((await fab.boundingBox()).y);
  await fab.click();
  await expect(page.locator('#item-overlay h2')).toHaveText('פריט חדש');
});

test('TC-PB-006: the round + is light in dark mode (not black on black); on a computer it isn\'t there - the toolbar button is', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ colorScheme: 'dark' });
  const bg = await style(page, '.fab-new', 'backgroundColor');
  const [r, g, b] = bg.match(/\d+/g).map(Number);
  expect((r + g + b) / 3).toBeGreaterThan(180);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.fab-new')).toBeHidden();
  await expect(page.locator('.toolbar .new-item-btn')).toBeVisible();
  await openNewItemForm(page);
  await expect(page.locator('#item-overlay')).toBeVisible();
});

test('TC-PB-007: on a phone the card has no type / condition labels (shorter card, more artwork); on a computer they stay', async ({ page }) => {
  await expect(page.locator('.card').first().locator('.badges')).toBeVisible();
  await page.setViewportSize(PHONE);
  await expect(page.locator('.card').first().locator('.badges')).toBeHidden();
  await openNewItemForm(page); // still chosen in the form
  await expect(page.locator('#item-overlay select').first()).toBeVisible();
});
