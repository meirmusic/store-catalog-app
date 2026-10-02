// SPEC.md 22.8 - the built app, as it goes live (service worker included).
// TEST_PLAN.md TC-BUILT-*.
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { pickIdentity } from '../helpers/app.js';

async function waitUntilControlled(page) {
  // The first load installs the service worker; it controls the page from
  // the next load on.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
  await page.waitForSelector('text=קטלוג הגלריה');
}

const MOCK_URL = 'https://mock-apps-script.test/exec';

test('TC-BUILT-001: opening the app with no internet shows the catalog from the device', async ({ page, context }) => {
  // The catalog arrives from the (mocked) server the normal way first.
  await context.route(MOCK_URL, (route) => route.fulfill({
    json: { items: [{ row_id: 'OFF1', name: 'נראית גם בלי אינטרנט', availability_status: 'available' }], config: {} },
  }));
  await pickIdentity(page);
  await waitUntilControlled(page);
  await expect(page.locator('.card', { hasText: 'נראית גם בלי אינטרנט' })).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.card', { hasText: 'נראית גם בלי אינטרנט' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.chip', { hasText: 'מנותק' })).toBeVisible();
  await context.setOffline(false);
});

test('TC-BUILT-003: the designed share card is built with no internet - its fonts and logo are inside the app', async ({ page, context }) => {
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await context.route(MOCK_URL, (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getImage') return route.fulfill({ json: { mime: 'image/png', data: PNG_B64 } });
    return route.fulfill({ json: { items: [{ row_id: 'C1', name: 'כרטיס בלי אינטרנט', availability_status: 'available', image_url: 'https://drive.google.com/thumbnail?id=C1&sz=w1000' }], config: {} } });
  });
  await pickIdentity(page);
  await waitUntilControlled(page);
  // Shared once with internet - the photo is now kept on the device (SPEC.md 23.3).
  await page.click('.card .share-icon-btn', { timeout: 15_000 });
  await expect(page.locator('.share-card-img')).toBeVisible();
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('.card .share-icon-btn', { timeout: 15_000 });
  await expect(page.locator('.share-card-img')).toBeVisible();
  await expect(page.locator('.share-failed')).toHaveCount(0);
  await context.setOffline(false);
});

test('TC-BUILT-004: the installed app is in the brand\'s black - colors, icons, and an iPhone icon (SPEC.md 25.5)', async ({ page }) => {
  await page.goto('./');
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  expect(manifest.theme_color.toUpperCase()).toBe('#0E0E0D');
  expect(manifest.background_color.toUpperCase()).toBe('#0E0E0D');
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#0E0E0D');
  const apple = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
  // each icon: black at the corner, the white logo at the center line
  const icons = [...manifest.icons.map((i) => i.src), apple];
  for (const src of icons) {
    const px = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const corner = [...ctx.getImageData(2, 2, 1, 1).data.slice(0, 3)];
      const row = ctx.getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
      let brightest = 0;
      for (let i = 0; i < row.length; i += 4) brightest = Math.max(brightest, row[i]);
      return { corner, brightest, size: [c.width, c.height] };
    }, src);
    expect(Math.max(...px.corner), `${src} corner is black`).toBeLessThan(30);
    expect(px.brightest, `${src} has the white logo`).toBeGreaterThan(200);
  }
});

test('TC-BUILT-002: a new version installs by itself on returning to the app - no "update" button flashes', async ({ page }) => {
  // Everything that ever appears in the update banner, kept across the
  // reload the update causes.
  await page.addInitScript(() => {
    const seen = () => JSON.parse(sessionStorage.getItem('banner-seen') || '[]');
    new MutationObserver(() => {
      const banner = document.querySelector('.update-banner');
      if (banner) sessionStorage.setItem('banner-seen', JSON.stringify([...seen(), banner.innerText.trim()]));
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await pickIdentity(page);
  await waitUntilControlled(page);
  await expect(page.locator('.app-version')).toContainText('aaaaaaa');

  execSync('npm run build', { env: { ...process.env, GITHUB_SHA: 'bbbbbbb0000' }, stdio: 'ignore' });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // "back in the app"

  await expect(page.locator('.app-version')).toContainText('bbbbbbb', { timeout: 30_000 });
  const seen = await page.evaluate(() => JSON.parse(sessionStorage.getItem('banner-seen') || '[]'));
  expect(seen.some((text) => text.includes('עדכון') && !text.includes('מתעדכן'))).toBe(false);
});
