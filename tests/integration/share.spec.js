// SPEC.md section 23 - sharing an artwork with a client. TEST_PLAN.md TC-SHARE-*.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { pickIdentity, clearAllData, seedItems, reloadAndWait } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
// A real (tiny) PNG, as the server's getImage would return it.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const strip = (s) => s.replace(/[‎‏]/g, '');

const ARTWORK = { row_id: 'S1', name: 'זריחה בגליל', size: '91X132', type: 'מקורי', location: 'מחסן', sku: 'SKU-9', serial_number: '112345', notes: 'פנימי', physical_status: 'ממוסגר', price: 2500, availability_status: 'available', image_url: 'https://drive.google.com/thumbnail?id=F1&sz=w1000' };

async function server(page, { image = 'ok' } = {}) {
  const seen = [];
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    seen.push(body.action);
    if (body.action === 'getImage') {
      if (image === 'ok') return route.fulfill({ json: { mime: 'image/png', data: PNG_B64 } });
      return route.fulfill({ json: { error: 'unknown action: getImage' } });
    }
    return route.fulfill({ json: { items: [], config: {} } });
  });
  return seen;
}

// A share sheet that records what it was given, and whether it was opened
// straight from the tap (iPhone refuses it otherwise - SPEC.md 23.3).
async function fakeShareSheet(page, { cancel = false } = {}) {
  await page.evaluate((cancel) => {
    window.__shared = [];
    // "Inside the tap": set while the click is being handled, cleared on the
    // very next turn - any wait (like downloading the photo) comes after.
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

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.evaluate(() => { for (const k of ['gallery_share_lang', 'gallery_share_price', 'gallery_share_format']) localStorage.removeItem(k); });
});

test('TC-SHARE-001: from the card - the client gets the designed card and a clean Hebrew caption; nothing internal', async ({ page }) => {
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  const dialog = page.locator('.share-dialog');
  await expect(dialog.locator('button.primary')).toHaveText('שיתוף'); // photo ready
  await dialog.locator('button.primary').click();
  await expect(dialog).toHaveCount(0);
  const [s] = await shared(page);
  expect(s.files).toEqual([{ name: 'Yossi-Bitton-Fine-Art.jpg', type: 'image/jpeg', size: expect.any(Number) }]); // the card
  expect(strip(s.text)).toBe('Yossi Bitton - זריחה בגליל\n91×132 ס"מ · מקורי\n$2,500\n\nYossi Bitton Fine Art\nhttps://instagram.com/yossibittonfineart');
  for (const internal of ['SKU-9', '112345', 'מחסן', 'פנימי', 'ממוסגר']) expect(s.text).not.toContain(internal);
  expect(s.fromTap).toBe(true); // opened straight from the tap - works on iPhone
});

test('TC-SHARE-002: English, without price - and the choices are remembered next time', async ({ page }) => {
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await page.click('.share-lang button:has-text("English")');
  await page.uncheck('.share-price input');
  await expect(page.locator('.share-preview')).toHaveText('Yossi Bitton - זריחה בגליל\n91×132 cm · Original\n\nYossi Bitton Fine Art\nhttps://instagram.com/yossibittonfineart');
  await page.click('.share-dialog button.primary');
  await expect(page.locator('.share-dialog')).toHaveCount(0);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-lang button.on')).toHaveText('English');
  await expect(page.locator('.share-price input')).not.toBeChecked();
});

test('TC-SHARE-003: a sold artwork - no price, no price option, and nothing says it was sold', async ({ page }) => {
  await server(page);
  await seedItems(page, [{ ...ARTWORK, availability_status: 'sold' }]);
  await reloadAndWait(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-price')).toHaveCount(0);
  await expect.poll(async () => strip(await page.locator('.share-preview').textContent())).toBe('Yossi Bitton - זריחה בגליל\n91×132 ס"מ · מקורי\n\nYossi Bitton Fine Art\nhttps://instagram.com/yossibittonfineart');
  await page.click('.share-lang button:has-text("English")');
  await expect(page.locator('.share-preview')).not.toContainText('Sold');
  await expect(page.locator('.share-preview')).not.toContainText('$');
});

test('TC-SHARE-004: the Hebrew size reads 91×132 on screen - not flipped to 132×91', async ({ page }) => {
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await page.click('.card .share-icon-btn');
  const order = await page.locator('.share-preview').evaluate((el) => {
    const node = el.firstChild;
    const text = node.textContent;
    const left = (s) => { const i = text.indexOf(s); const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + s.length); return r.getBoundingClientRect().left; };
    return left('91') < left('132') ? '91×132' : '132×91';
  });
  expect(order).toBe('91×132');
});

test('TC-SHARE-005: no photo - says only the caption will be sent, and shares it', async ({ page }) => {
  await server(page);
  await seedItems(page, [{ ...ARTWORK, image_url: null }]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-note')).toHaveText('ליצירה הזו אין תמונה - יישלח רק הכיתוב.');
  await page.click('.share-dialog button.primary');
  const [s] = await shared(page);
  expect(s.files).toEqual([]);
  expect(s.text).not.toContain('drive.google.com');
});

test('TC-SHARE-006: the photo can\'t be prepared (e.g. before the server update) - says so, and shares a link instead', async ({ page }) => {
  await server(page, { image: 'fail' });
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-failed')).toContainText('לא הצלחנו להכין את התמונה');
  await page.click('.share-dialog button.primary');
  const [s] = await shared(page);
  expect(s.files).toEqual([]);
  expect(s.text).toContain('https://drive.google.com/thumbnail?id=F1&sz=w1600');
});

test('TC-SHARE-007: a photo not uploaded yet is attached straight from the device, without asking the server', async ({ page }) => {
  const seen = await server(page);
  await seedItems(page, [{ ...ARTWORK, image_url: null, pending_image: `data:image/png;base64,${PNG_B64}` }]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await page.click('.share-dialog button.primary');
  const [s] = await shared(page);
  expect(s.files).toHaveLength(1);
  expect(seen).not.toContain('getImage');
});

test('TC-SHARE-008: the photo is kept on the device - a second share does not fetch it again', async ({ page }) => {
  const seen = await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-dialog button.primary')).toHaveText('שיתוף');
  await page.click('.share-dialog button:has-text("ביטול")');
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-dialog button.primary')).toHaveText('שיתוף');
  expect(seen.filter((a) => a === 'getImage')).toHaveLength(1);
});

test('TC-SHARE-009: closing the share sheet without choosing is not an error - our window stays', async ({ page }) => {
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await fakeShareSheet(page, { cancel: true });
  await page.click('.card .share-icon-btn');
  await page.click('.share-dialog button.primary');
  await expect(page.locator('.share-dialog')).toBeVisible();
  await expect(page.locator('.toast.error')).toHaveCount(0);
});

test('TC-SHARE-010: a computer with no share sheet - "copy the caption" and "download the photo"', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await page.evaluate(() => { navigator.share = undefined; });
  await page.click('.card .share-icon-btn');
  const download = page.waitForEvent('download');
  await page.click('.share-dialog button:has-text("הורדת הכרטיס")');
  expect((await download).suggestedFilename()).toBe('Yossi-Bitton-Fine-Art.jpg'); // never "download" with no extension
  await page.click('.share-format button:has-text("תמונה בלבד")');
  const photo = page.waitForEvent('download');
  await page.click('.share-dialog button:has-text("הורדת התמונה")');
  expect((await photo).suggestedFilename()).toBe('Yossi-Bitton-Fine-Art.jpg');
  await page.click('.share-copy');
  await expect(page.locator('.toast')).toContainText('הכיתוב הועתק');
  expect(strip(await page.evaluate(() => navigator.clipboard.readText()))).toContain('Yossi Bitton - זריחה בגליל');
});

test('TC-SHARE-011: share from a list row, and from inside the artwork\'s form', async ({ page }) => {
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
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

  test('TC-SHARE-012: after sharing with the photo, the caption is also copied, with a tip to paste it if WhatsApp dropped it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await server(page);
    await seedItems(page, [ARTWORK]);
    await reloadAndWait(page);
    await fakeShareSheet(page);
    await page.click('.card .share-icon-btn');
    await expect(page.locator('.share-dialog button.primary')).toHaveText('שיתוף');
    await page.click('.share-dialog button.primary');
    await expect(page.locator('.toast')).toContainText('אם הכיתוב לא הופיע בהודעה - הדביקו אותו');
    expect(strip(await page.evaluate(() => navigator.clipboard.readText()))).toContain('Yossi Bitton Fine Art');
  });
});

// SPEC.md 23.5 - the designed card.
const cardSize = (page) => page.locator('.share-card-img').evaluate(async (img) => {
  await img.decode();
  return [img.naturalWidth, img.naturalHeight];
});

test('TC-SHARE-014: the designed card is ready before "share" - 1080×1350, shown in the preview as the client will see it', async ({ page }) => {
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-format button.on')).toHaveText('כרטיס מעוצב'); // the default
  await expect(page.locator('.share-dialog button.primary')).toHaveText('שיתוף');
  expect(await cardSize(page)).toEqual([1080, 1350]);
  await page.click('.share-dialog button.primary');
  const [s] = await shared(page);
  expect(s.files[0].type).toBe('image/jpeg');
  expect(s.fromTap).toBe(true);
});

test('TC-SHARE-015: "photo only" sends the original photo - and the choice is remembered', async ({ page }) => {
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  await page.click('.share-format button:has-text("תמונה בלבד")');
  await expect(page.locator('.share-card-img')).toHaveCount(0);
  await page.click('.share-dialog button.primary');
  const [s] = await shared(page);
  expect(s.files).toEqual([{ name: 'Yossi-Bitton-Fine-Art.jpg', type: 'image/png', size: expect.any(Number) }]); // the server's photo, as is
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-format button.on')).toHaveText('תמונה בלבד');
});

test('TC-SHARE-016: changing the language or the price builds the card again - a different image each time', async ({ page }) => {
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.click('.card .share-icon-btn');
  const src = () => page.locator('.share-card-img').getAttribute('src');
  await expect(page.locator('.share-card-img')).toBeVisible();
  const hebrew = await src();
  await page.click('.share-lang button:has-text("English")');
  await expect.poll(src).not.toBe(hebrew);
  await expect(page.locator('.share-card-img')).toBeVisible();
  const english = await src();
  await page.uncheck('.share-price input');
  await expect.poll(src).not.toBe(english);
  await expect(page.locator('.share-dialog button.primary')).toHaveText('שיתוף');
});

test('TC-SHARE-017: no photo - no card and no "card / photo" choice; the caption is shared', async ({ page }) => {
  await server(page);
  await seedItems(page, [{ ...ARTWORK, image_url: null }]);
  await reloadAndWait(page);
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-note')).toBeVisible();
  await expect(page.locator('.share-format')).toHaveCount(0);
  await expect(page.locator('.share-card-img')).toHaveCount(0);
});

test('TC-SHARE-018: the card can\'t be built - says so, logs it, and the photo alone is shared', async ({ page }) => {
  await server(page);
  await seedItems(page, [ARTWORK]);
  await reloadAndWait(page);
  await fakeShareSheet(page);
  await page.route('**/logo-header.png', (route) => route.abort()); // e.g. a broken install
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-failed')).toHaveText('לא הצלחנו לבנות את הכרטיס - תישלח התמונה בלבד.');
  await expect(page.locator('.share-dialog button.primary')).toHaveText('שיתוף');
  await page.click('.share-dialog button.primary');
  const [s] = await shared(page);
  expect(s.files[0].type).toBe('image/png'); // the photo itself
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('gallery_error_log_queue') || '[]'));
  expect(queued.map((e) => e.action)).toContain('shareCard');
});

test('TC-SHARE-019: the card is built offline too - fonts and logo are part of the app', async ({ page, context }) => {
  await server(page);
  await seedItems(page, [{ ...ARTWORK, image_url: null, pending_image: `data:image/png;base64,${PNG_B64}` }]);
  await reloadAndWait(page);
  // Nothing from outside the app may be needed: fonts and the logo come from the app itself.
  const outside = [];
  page.on('request', (req) => { const u = new URL(req.url()); if (u.origin !== new URL(page.url()).origin && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) outside.push(req.url()); });
  await page.click('.card .share-icon-btn');
  await expect(page.locator('.share-card-img')).toBeVisible();
  expect(outside.filter((u) => !u.startsWith(MOCK_URL))).toEqual([]);
});
