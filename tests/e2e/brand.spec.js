// SPEC.md 25 - the design in the catalog's brand language (package A).
// TEST_PLAN.md TC-BRAND-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait } from '../helpers/app.js';

const BLACK = 'rgb(14, 14, 13)';
const PNG_WIDE = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#3a6"/></svg>');
const ITEMS = Array.from({ length: 6 }, (_, i) => ({ row_id: 'B' + i, name: `יצירה ${i + 1}`, size: '100X50', sku: 'S' + i, price: 1000 + i, availability_status: i === 1 ? 'sold' : 'available', image_url: null, pending_image: PNG_WIDE }));

async function openCatalog(page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, ITEMS);
  await reloadAndWait(page);
}

test('TC-BRAND-001: a black band on top, the logo in white on it - no white plate; light buttons', async ({ page }) => {
  await openCatalog(page);
  const header = page.locator('header.top');
  await expect(page.locator('.top-band')).toHaveCSS('background-color', BLACK);
  await expect(header.locator('img.brand-logo')).toHaveAttribute('src', /logo-white\.png$/);
  await expect(page.locator('.brand-logo-plate')).toHaveCount(0);
  await expect(header.locator('.icon-btn').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  // the band reaches both edges of the screen, not just the page's column
  const band = await header.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; });
  expect(band.right - band.left).toBeGreaterThan(300);
  // what is actually drawn at the very edge of the screen, beside the header
  const shot = (await page.screenshot({ clip: { x: 1, y: 20, width: 1, height: 1 } })).toString('base64');
  const edge = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, shot);
  expect(Math.max(...edge)).toBeLessThan(30);
});

test('TC-BRAND-002: the artwork is whole - never cropped - on a square wall, with zoom / sold / pending in place', async ({ page }) => {
  await openCatalog(page, 1280);
  const card = page.locator('.card').first();
  await expect(card.locator('.thumb img')).toHaveCSS('object-fit', 'contain');
  const box = await card.locator('.thumb').boundingBox();
  expect(Math.abs(box.width - box.height)).toBeLessThan(2); // square
  await expect(card.locator('.thumb')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(card.locator('.thumb-zoom')).toBeVisible();
  await expect(card.locator('.pending-badge')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'יצירה 2' }).locator('.ribbon')).toHaveText('נמכר');
});

test('TC-BRAND-003: on a phone two artworks side by side; on a computer more; never wider than the screen', async ({ page }) => {
  await openCatalog(page, 390);
  const tops = await page.locator('.card').evaluateAll((els) => els.slice(0, 3).map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops[0]).toBe(tops[1]); // the first two on one line
  expect(tops[2]).toBeGreaterThan(tops[0]); // the third below
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 844 });
  const desk = await page.locator('.card').evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(desk).size).toBe(1); // four in a row
});

test('TC-BRAND-004: sign-in is the catalog cover - black, the logo, the tagline; also "forgot password" and "who\'s working"', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const cover = page.locator('.brand-cover');
  await expect(cover).toHaveCSS('background-color', BLACK);
  await expect(cover.locator('.brand-cover-logo')).toBeVisible();
  await expect(cover.locator('.brand-cover-tagline')).toHaveText(/art that speaks to your soul/i);
  await expect(cover.locator('input[type=email]')).toBeVisible();
  await cover.locator('button', { hasText: 'שכחתי סיסמה' }).click();
  await expect(cover.locator('.brand-cover-logo')).toBeVisible(); // still the cover
  // signed in but no team member chosen yet
  await page.evaluate(() => { localStorage.setItem('gallery_password_identity', JSON.stringify({ email: 'office@test', password: 'x' })); localStorage.removeItem('gallery_team_member'); });
  await page.reload();
  await expect(page.locator('.brand-cover .brand-cover-logo')).toBeVisible();
  await expect(page.locator('.brand-cover h2')).toBeVisible();
});

test('TC-BRAND-005: on a phone the band stays one slim line, and alerts never push it off the screen', async ({ page, context }) => {
  await openCatalog(page, 390);
  const h = await page.locator('header.top').evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeLessThan(70); // logo and buttons on one line
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('header.top .chip', { hasText: 'מנותק' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.setOffline(false);
});

test('TC-BRAND-006: the ⚙ menu opens fully above the catalog - not cut by the black band, not under the toolbar (REG-044)', async ({ page }) => {
  for (const width of [390, 1280]) {
    await openCatalog(page, width);
    await page.click('.header-menu > button');
    const last = page.locator('.header-menu-list > button').last();
    await expect(last).toBeVisible();
    // the item really is on top where it's drawn - a click there reaches it
    const onTop = await last.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(hit);
    });
    expect(onTop, `width ${width}`).toBe(true);
    await page.keyboard.press('Escape');
  }
});
