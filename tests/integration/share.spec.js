// SPEC.md 28.1 (and 23.3 / 23.5) - sharing an artwork: one option, the
// designed card as a picture with the link to Instagram; the only choice is
// the price. TEST_PLAN.md TC-SHARE-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const INSTAGRAM = 'https://instagram.com/yossibittonfineart';
// A real (tiny) PNG, as the server's getImage would return it.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const ARTWORK = { row_id: 'S1', name: 'זריחה בגליל', size: '91X132', type: 'מקורי', location: 'מחסן', sku: 'SKU-9', serial_number: '112345', notes: 'פנימי', physical_status: 'ממוסגר', price: 2500, availability_status: 'available', image_url: 'https://drive.google.com/thumbnail?id=F1&sz=w1000' };

async function server(page, { image = 'ok', delayMs = 0 } = {}) {
  const state = { image, seen: [] };
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    state.seen.push(body.action);
    if (body.action === 'getImage') {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (state.image === 'ok') return route.fulfill({ json: { mime: 'image/png', data: PNG_B64 } });
      return route.fulfill({ json: { error: 'unknown action: getImage' } });
    }
    return route.fulfill({ json: { items: [], config: {} } });
  });
  // Drive itself won't hand the picture to the page (the fallback fails too)
  await page.route('https://drive.google.com/**', (route) => route.abort());
  return state;
}

// A share sheet that records what it was given, and whether it was opened
// straight from the tap (iPhone refuses it otherwise - SPEC.md 23.3).
async function fakeShareSheet(page, { cancel = false } = {}) {
  await page.evaluate((cancel) => {
    window.__shared = [];
    document.addEventListener('click', () => {
      window.__inTap = true;
      setTimeout(() => { window.__inTap = false; }, 0);
    }, true);
    navigator.canShare = (data) => Boolean(data);
    navigator.share = async (data) => {
      window.__shared.push({
        text: data.text,
        files: (data.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })),
        fromTap: window.__inTap === true,
      });
      if (cancel) throw new DOMException('closed', 'AbortError');
    };
  }, cancel);
}

const shared = (page) => page.evaluate(() => window.__shared);
const SHARE = '.share-dialog button.primary';
const cardSrc = (page) => page.locator('.share-card-img').getAttribute('src');

async function open(page, items = [ARTWORK], serverOpts) {
  const state = await server(page, serverOpts);
  await seedItems(page, items);
  await reloadAndWait(page);
  return state;
}

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.evaluate(() => { for (const k of ['gallery_share_price', 'gallery_share_lang', 'gallery_share_format']) localStorage.removeItem(k); });
});

test('TC-SHARE-001: the client gets the designed card as a picture and the Instagram link - nothing else', async ({ page }) => {
  await open(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator(SHARE)).toBeEnabled();
  await page.click(SHARE);
  await expect(page.locator('.share-dialog')).toHaveCount(0);
  const [s] = await shared(page);
  expect(s.files).toEqual([{ name: 'Yossi-Bitton-Fine-Art.jpg', type: 'image/jpeg', size: expect.any(Number) }]);
  expect(s.text).toBe(INSTAGRAM); // only the link - no caption
  expect(s.fromTap).toBe(true); // opened straight from the tap - works on iPhone
});

test('TC-SHARE-002: the window has one choice only - "include price"; no language, no card/photo choice, no caption', async ({ page }) => {
  await open(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-card-img')).toBeVisible();
  await expect(page.locator('.share-dialog input[type=checkbox]')).toHaveCount(1);
  await expect(page.locator('.share-price')).toContainText('לכלול מחיר');
  await expect(page.locator('.share-lang, .share-format, .share-preview')).toHaveCount(0);
  await expect(page.locator('.share-dialog')).not.toContainText('English');
  await expect(page.locator('.share-dialog')).toContainText('יישלח עם הקישור לאינסטגרם של יוסי ביטון');
});

test('TC-SHARE-003: "include price" builds another card, and is remembered; a sold artwork has no price choice', async ({ page }) => {
  await open(page, [ARTWORK, { ...ARTWORK, row_id: 'S2', name: 'נמכרה', availability_status: 'sold' }]);
  await page.locator('.card', { hasText: 'זריחה' }).locator('.share-icon-btn').click();
  await expect(page.locator('.share-card-img')).toBeVisible();
  const withPrice = await cardSrc(page);
  await page.uncheck('.share-price input');
  await expect.poll(() => cardSrc(page)).not.toBe(withPrice);
  await page.click('.share-dialog button:has-text("ביטול")');
  await page.locator('.card', { hasText: 'זריחה' }).locator('.share-icon-btn').click();
  await expect(page.locator('.share-price input')).not.toBeChecked();
  await page.click('.share-dialog button:has-text("ביטול")');
  await page.locator('.card', { hasText: 'נמכרה' }).locator('.share-icon-btn').click();
  await expect(page.locator('.share-card-img')).toBeVisible();
  await expect(page.locator('.share-price')).toHaveCount(0);
});

test('TC-SHARE-004: the card is in Hebrew; an English name goes on it under the Hebrew one; the size reads 91×132', async ({ page }) => {
  await open(page);
  const details = await page.evaluate(async () => {
    const { shareDetails } = await import('/src/items/shareText.js');
    const strip = (s) => s.replace(/[‎‏]/g, '');
    const he = shareDetails({ name: 'זריחה', name_en: 'Sunrise', size: '91X132', type: 'מקורי' }, { lang: 'he' });
    const none = shareDetails({ name: 'זריחה', size: '91X132' }, { lang: 'he' });
    return { name: he.name, nameEn: he.nameEn, details: strip(he.details), marked: he.details.includes('‎91×132‎'), noneEn: none.nameEn };
  });
  expect(details).toEqual({ name: 'זריחה', nameEn: 'Sunrise', details: '91×132 ס"מ · מקורי', marked: true, noneEn: '' });
  // and the card itself changes when there is an English name
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-card-img')).toBeVisible();
  const without = await cardSrc(page);
  const bytes = async (src) => page.evaluate(async (s) => (await (await fetch(s)).arrayBuffer()).byteLength, src);
  const withoutSize = await bytes(without);
  await page.click('.share-dialog button:has-text("ביטול")');
  await page.evaluate(async () => { const m = await import('/src/db/db.js'); await m.db.items.update('S1', { name_en: 'Sunrise over the Galilee' }); });
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-card-img')).toBeVisible();
  expect(await bytes(await cardSrc(page))).not.toBe(withoutSize);
});

test('TC-SHARE-005: no photo - no card, says so, and nothing can be shared', async ({ page }) => {
  await open(page, [{ ...ARTWORK, image_url: null }]);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-note')).toHaveText('ליצירה הזו אין תמונה - אי אפשר ליצור כרטיס. הוסיפו תמונה ליצירה ושתפו שוב.');
  await expect(page.locator(SHARE)).toBeDisabled();
  expect(await shared(page)).toEqual([]);
});

test('TC-SHARE-006: the photo can\'t be fetched (e.g. before the server update) - an error with a code, nothing sent instead; "try again" works', async ({ page }) => {
  const state = await open(page, [ARTWORK], { image: 'fail' });
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.toast.error')).toContainText('לא הצלחנו להביא את התמונה של היצירה לשיתוף');
  await expect(page.locator('.toast.error')).toContainText(/E-[A-Z0-9]{4}/);
  await expect(page.locator('.share-failed')).toContainText('לא הצלחנו להביא את התמונה של היצירה');
  await expect(page.locator(SHARE)).toBeDisabled(); // never a photo link instead
  expect(await shared(page)).toEqual([]);
  state.image = 'ok';
  await page.click('.share-failed button:has-text("לנסות שוב")');
  await expect(page.locator('.share-card-img')).toBeVisible();
  await expect(page.locator(SHARE)).toBeEnabled();
});

test('TC-SHARE-007: a photo not uploaded yet is taken from the device, without asking the server', async ({ page }) => {
  const state = await open(page, [{ ...ARTWORK, image_url: null, pending_image: `data:image/png;base64,${PNG_B64}` }]);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await page.click(SHARE);
  const [s] = await shared(page);
  expect(s.files).toHaveLength(1);
  expect(state.seen).not.toContain('getImage');
});

test('TC-SHARE-008: the photo is kept on the device - a second share does not fetch it again', async ({ page }) => {
  const state = await open(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-card-img')).toBeVisible();
  await page.click('.share-dialog button:has-text("ביטול")');
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-card-img')).toBeVisible();
  expect(state.seen.filter((a) => a === 'getImage')).toHaveLength(1);
});

test('TC-SHARE-009: closing the share sheet without choosing is not an error - our window stays', async ({ page }) => {
  await open(page);
  await fakeShareSheet(page, { cancel: true });
  await page.click('.card .share-icon-btn');
  await page.click(SHARE);
  await expect(page.locator('.share-dialog')).toBeVisible();
  await expect(page.locator('.toast.error')).toHaveCount(0);
});

test('TC-SHARE-010: a computer with no share sheet - "download the card" (English file name) and "copy the Instagram link"', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.evaluate(() => { navigator.share = undefined; });
  await page.click('.card .share-icon-btn');
  const download = page.waitForEvent('download');
  await page.click('.share-dialog button:has-text("הורדת הכרטיס")');
  expect((await download).suggestedFilename()).toBe('Yossi-Bitton-Fine-Art.jpg');
  await page.click('.share-copy');
  await expect(page.locator('.toast')).toContainText('הקישור הועתק');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(INSTAGRAM);
});

test('TC-SHARE-011: share from a list row, and from inside the artwork\'s form', async ({ page }) => {
  await open(page);
  await page.click('button[aria-label="תצוגת רשימה"]');
  await page.click('.item-row .share-icon-btn');
  await expect(page.locator('.share-dialog')).toBeVisible();
  await expect(page.locator('#item-overlay')).toHaveCount(0); // didn't open the form
  await page.click('.share-dialog button:has-text("ביטול")');
  await page.click('.item-row');
  await page.click('#item-overlay button:has-text("שיתוף")');
  await expect(page.locator('.share-dialog')).toBeVisible();
});

test.describe('on an iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });

  test('TC-SHARE-012: after sharing, the Instagram link is also on the clipboard, with a tip to paste it if WhatsApp dropped it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await fakeShareSheet(page);
    await page.click('.card .share-icon-btn');
    await page.click(SHARE);
    await expect(page.locator('.toast')).toContainText('אם הקישור לאינסטגרם לא הופיע בהודעה - הדביקו אותו');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(INSTAGRAM);
  });
});

test('TC-SHARE-014: the card is ready before "share" - 1080×1350, shown in the preview', async ({ page }) => {
  await open(page);
  await page.click('.card .share-icon-btn');
  const size = await page.locator('.share-card-img').evaluate(async (img) => { await img.decode(); return [img.naturalWidth, img.naturalHeight]; });
  expect(size).toEqual([1080, 1350]);
});

test('TC-SHARE-018: the card can\'t be built - an error with a code, nothing sent; "try again" builds it', async ({ page }) => {
  await open(page);
  await fakeShareSheet(page);
  let logoBroken = true;
  await page.route('**/logo-header.png', (route) => (logoBroken ? route.abort() : route.fallback()));
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.toast.error')).toContainText('לא הצלחנו לבנות את כרטיס השיתוף');
  await expect(page.locator('.toast.error')).toContainText(/E-[A-Z0-9]{4}/);
  await expect(page.locator(SHARE)).toBeDisabled();
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('gallery_error_log_queue') || '[]'));
  expect(queued.map((e) => e.action)).toContain('shareCard');
  logoBroken = false;
  await page.click('.share-failed button:has-text("לנסות שוב")');
  await expect(page.locator('.share-card-img')).toBeVisible();
  await expect(page.locator(SHARE)).toBeEnabled();
  expect(await shared(page)).toEqual([]);
});

test('TC-SHARE-019: the card needs nothing from outside the app - fonts and logo are part of it', async ({ page }) => {
  await open(page, [{ ...ARTWORK, image_url: null, pending_image: `data:image/png;base64,${PNG_B64}` }]);
  const outside = [];
  page.on('request', (req) => { const u = req.url(); if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== new URL(page.url()).origin) outside.push(u); });
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-card-img')).toBeVisible();
  expect(outside.filter((u) => !u.startsWith(MOCK_URL))).toEqual([]);
});

test('TC-SHARE-021: the preview shows only the card\'s frame, then the card - never the plain photo', async ({ page }) => {
  await open(page, [ARTWORK], { delayMs: 800 });
  await page.evaluate(() => {
    window.__previews = [];
    new MutationObserver(() => {
      const box = document.querySelector('.share-preview-card');
      if (!box) return;
      const img = box.querySelector('img');
      const seen = img ? (img.src.startsWith('blob:') ? 'card' : 'photo') : (box.querySelector('.share-card-placeholder') ? 'frame' : 'nothing');
      if (window.__previews.at(-1) !== seen) window.__previews.push(seen);
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-card-img')).toBeVisible();
  expect(await page.evaluate(() => window.__previews)).toEqual(['frame', 'card']);
});
