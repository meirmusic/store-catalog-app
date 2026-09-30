// Choosing a photo for an item - SPEC.md section 10, TEST_PLAN.md
// TC-IMG-*. Upload/sync behavior is mocked at the Apps Script boundary.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pickIdentity,
  clearAllData,
  getItems,
  getPendingChanges,
  openNewItemForm,
  fillItemForm,
  saveItemForm,
  reloadApp,
  seedItems,
} from '../helpers/app.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const SAMPLE = path.join(FIXTURES, 'sample-image.jpg');
const TRANSPARENT = path.join(FIXTURES, 'transparent.png');
const WIDE = path.join(FIXTURES, 'wide-3200x2000.jpg');
const TALL = path.join(FIXTURES, 'tall-1000x4000.jpg');
const MOCK_URL = 'https://mock-apps-script.test/exec';
const DRIVE = (id, w = 1000) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;

const galleryInput = '#item-overlay .image-buttons input[type=file]:not([capture])';
const cameraInput = '#item-overlay .image-buttons input[type=file][capture]';
const preview = '#item-overlay .image-preview img';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
});

// Decodes the form's current preview (a data: URL) and reports its size and
// one corner pixel.
async function inspectPreview(page) {
  await page.waitForSelector(`${preview}[src^="data:"]`);
  return page.evaluate(async (sel) => {
    const img = new Image();
    img.src = document.querySelector(sel).src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return { width: img.width, height: img.height, corner: Array.from(g.getImageData(3, 3, 1, 1).data) };
  }, preview);
}

test('TC-IMG-001: two app-language buttons, "צילום" and "בחירת תמונה", the same on every device', async ({ page }) => {
  await openNewItemForm(page);
  await expect(page.locator('#item-overlay .image-buttons label')).toHaveText(['צילום', 'בחירת תמונה']);
  // "צילום" asks for the camera; "בחירת תמונה" doesn't.
  await expect(page.locator(cameraInput)).toHaveAttribute('capture', 'environment');
  await expect(page.locator(galleryInput)).toHaveCount(1);
});

test('TC-IMG-002: a file that isn\'t an openable image shows a message, and the previous photo stays', async ({ page }) => {
  await openNewItemForm(page);
  await page.setInputFiles(galleryInput, SAMPLE);
  await page.waitForSelector(`${preview}[src^="data:"]`);
  const before = await page.locator(preview).getAttribute('src');

  await page.setInputFiles(galleryInput, { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
  await expect(page.locator('#item-overlay .image-error')).toHaveText(
    'הקובץ שנבחר אינו תמונה שאפשר לפתוח. בחרו תמונה בפורמט JPG או PNG.',
  );
  expect(await page.locator(preview).getAttribute('src')).toBe(before);
});

test('TC-IMG-003: a transparent background becomes white, not black', async ({ page }) => {
  await openNewItemForm(page);
  await page.setInputFiles(galleryInput, TRANSPARENT);
  const { corner } = await inspectPreview(page);
  corner.slice(0, 3).forEach((channel) => expect(channel).toBeGreaterThan(245));
});

test('TC-IMG-004: a large photo is stored at up to 1600 wide / 2400 tall, keeping its proportions', async ({ page }) => {
  await openNewItemForm(page);
  await page.setInputFiles(galleryInput, WIDE);
  expect(await inspectPreview(page)).toMatchObject({ width: 1600, height: 1000 });

  await page.setInputFiles(galleryInput, TALL);
  await expect.poll(async () => (await inspectPreview(page)).height).toBe(2400);
  expect((await inspectPreview(page)).width).toBe(600);
});

test('TC-IMG-005: while a photo is processing, "מעבד תמונה..." shows and save is locked', async ({ page }) => {
  await page.evaluate(() => { window.__testSlowImageProcessing = 1000; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'עיבוד איטי' });
  await page.setInputFiles(galleryInput, SAMPLE);

  await expect(page.locator('#item-overlay .image-processing')).toHaveText('מעבד תמונה...');
  await expect(page.locator('#item-overlay button[type=submit]')).toBeDisabled();

  await page.waitForSelector(`${preview}[src^="data:"]`);
  await expect(page.locator('#item-overlay .image-processing')).toHaveCount(0);
  await expect(page.locator('#item-overlay button[type=submit]')).toBeEnabled();
});

test('TC-IMG-006: a saved photo shows at once, marked "ממתינה להעלאה", then the Drive photo once uploaded', async ({ page }) => {
  let serverUp = false;
  const upsertBodies = [];
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (!serverUp) return route.abort();
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'uploadImage') return route.fulfill({ json: { image_url: DRIVE('UP1') } });
    if (body.action === 'upsert') upsertBodies.push(body.payload);
    return route.fulfill({ json: { ...body.payload } });
  });
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'תמונה ממתינה', imagePath: SAMPLE });
  await saveItemForm(page);

  const card = page.locator('.card', { hasText: 'תמונה ממתינה' });
  await expect(card.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await expect(card.locator('.pending-badge')).toHaveText('ממתינה להעלאה');

  await card.click();
  await page.waitForSelector('#item-overlay');
  await expect(page.locator(preview)).toHaveAttribute('src', /^data:image\/jpeg/);
  await expect(page.locator('#item-overlay .pending-badge')).toHaveText('ממתינה להעלאה');
  await page.click('#item-overlay button:has-text("ביטול")'); // no edits - closes directly

  serverUp = true;
  await page.click('button[title="רענון ידני"]');
  await expect(card.locator('img')).toHaveAttribute('src', DRIVE('UP1', 400), { timeout: 5000 });
  await expect(card.locator('.pending-badge')).toHaveCount(0);
  expect((await getItems(page))[0].pending_image).toBeUndefined();
  // The pending photo never rides along with the item's own save.
  expect(upsertBodies.length).toBeGreaterThan(0);
  upsertBodies.forEach((b) => expect(b).not.toHaveProperty('pending_image'));
});

test('TC-IMG-007: removing a photo that is still waiting to upload cancels the upload for good', async ({ page }) => {
  let serverUp = false;
  let uploads = 0;
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (!serverUp) return route.abort();
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'uploadImage') { uploads++; return route.fulfill({ json: { image_url: DRIVE('SHOULD-NOT') } }); }
    return route.fulfill({ json: { ...body.payload } });
  });
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'תמונה שהוסרה', imagePath: SAMPLE });
  await saveItemForm(page);
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await page.click('#item-overlay button:has-text("הסר תמונה")');
  await saveItemForm(page);

  expect((await getPendingChanges(page)).filter((c) => c.op === 'uploadImage')).toHaveLength(0);
  serverUp = true;
  await page.click('button[title="רענון ידני"]');
  await expect.poll(async () => (await getPendingChanges(page)).length, { timeout: 5000 }).toBe(0);
  expect(uploads).toBe(0);
  const item = (await getItems(page))[0];
  expect(item.image_url).toBeNull();
  expect(item.pending_image).toBeUndefined();
  await expect(page.locator('.card', { hasText: 'תמונה שהוסרה' }).locator('img')).toHaveCount(0);
});

test('TC-IMG-008: replacing a pending photo with a newer one ends with the newer photo', async ({ page }) => {
  let serverUp = false;
  let n = 0;
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (!serverUp) return route.abort();
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'uploadImage') { n++; return route.fulfill({ json: { image_url: DRIVE(`V${n}`) } }); }
    return route.fulfill({ json: { ...body.payload } });
  });
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'שתי תמונות', imagePath: SAMPLE });
  await saveItemForm(page);
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await page.setInputFiles(galleryInput, WIDE);
  await expect.poll(async () => (await inspectPreview(page)).width).toBe(1600);
  await saveItemForm(page);

  serverUp = true;
  await page.click('button[title="רענון ידני"]');
  await expect.poll(async () => (await getPendingChanges(page)).length, { timeout: 8000 }).toBe(0);
  const item = (await getItems(page))[0];
  expect(item.image_url).toBe(DRIVE('V2'));
  expect(item.pending_image).toBeUndefined();
});

test('TC-IMG-009: each place loads only the size it needs - 400 on the card and in the form, 1600 enlarged', async ({ page }) => {
  await seedItems(page, [{ row_id: 'SIZED', name: 'גדלים', image_url: DRIVE('SIZE') }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');

  const card = page.locator('.card', { hasText: 'גדלים' });
  await expect(card.locator('img')).toHaveAttribute('src', DRIVE('SIZE', 400));
  await card.locator('.thumb-zoom').click();
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', DRIVE('SIZE', 1600));
  await page.keyboard.press('Escape');

  await card.click();
  await page.waitForSelector('#item-overlay');
  await expect(page.locator(preview)).toHaveAttribute('src', DRIVE('SIZE', 400));
  // The stored Sheet URL itself is untouched.
  expect((await getItems(page))[0].image_url).toBe(DRIVE('SIZE'));
});
