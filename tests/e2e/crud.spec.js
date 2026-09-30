// TC-CRUD-*, TC-DM-* from TEST_PLAN.md.
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
  cancelItemForm,
  reloadApp,
  seedItems,
} from '../helpers/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_IMAGE = path.join(__dirname, '..', 'fixtures', 'sample-image.jpg');

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
});

test('TC-CRUD-001: add item with only a name - saves and appears in the list', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'יצירת בדיקה' });
  await saveItemForm(page);

  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('יצירת בדיקה');

  const items = await getItems(page);
  expect(items).toHaveLength(1);
  expect(items[0].serial_number).toBeNull();
  expect(items[0].price).toBeNull();
});

test('TC-CRUD-003: adding with an empty name is rejected', async ({ page }) => {
  await openNewItemForm(page);
  // Click directly (not via saveItemForm) - the form is expected to stay
  // open, so waiting for it to detach would just burn the test timeout.
  await page.click('#item-overlay button:has-text("שמירה")');
  await expect(page.locator('#item-overlay')).toBeVisible();

  // Fixed per task #15: the name <input> no longer carries a native
  // `required` attribute, so ItemForm's own onSubmit handler runs and
  // shows its translated errors.nameRequired message (in the user's
  // chosen app language, not the browser's native validation tooltip).
  await expect(page.locator('#item-overlay')).toContainText('יש להזין שם ליצירה');

  const items = await getItems(page);
  expect(items).toHaveLength(0);
});

test('TC-CRUD-002: editing an existing item fills in previously-missing fields', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'פריט לעריכה' });
  await saveItemForm(page);

  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await fillItemForm(page, { price: 4200 });
  await saveItemForm(page);

  const items = await getItems(page);
  expect(items).toHaveLength(1);
  expect(String(items[0].price)).toBe('4200');
});

test('TC-CRUD-004: marking sold requires no confirmation dialog and shows the ribbon', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'פריט למכירה', sold: true });
  await saveItemForm(page); // must close immediately, no confirm dialog in between

  await expect(page.locator('#item-overlay')).toHaveCount(0);
  await expect(page.locator('.card .ribbon')).toBeVisible();

  const items = await getItems(page);
  expect(items[0].availability_status).toBe('sold');
});

test('TC-CRUD-005: item with no price shows no price line on the card', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'בלי מחיר' });
  await saveItemForm(page);

  await expect(page.locator('.card .price')).toHaveCount(0);
});

test('TC-CRUD-006: delete requires confirmation, then hides the item for good', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'למחיקה' });
  await saveItemForm(page);

  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await page.click('button:has-text("מחיקת פריט")');
  await page.waitForSelector('.confirm-modal');
  await page.click('.confirm-modal button.danger');

  await expect(page.locator('.card')).toHaveCount(0);
  const items = await getItems(page);
  expect(items[0].is_deleted).toBe(true);
});

test('TC-CRUD-007: canceling the delete confirmation keeps the item', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'לא נמחק' });
  await saveItemForm(page);

  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await page.click('button:has-text("מחיקת פריט")');
  await page.waitForSelector('.confirm-modal');
  await page.click('.confirm-modal button:not(.danger)');

  // Canceling the delete confirmation dismisses only that dialog - the
  // item form underneath (also #item-overlay) is expected to stay open.
  await expect(page.locator('.confirm-modal')).toHaveCount(0);
  await expect(page.locator('#item-overlay')).toBeVisible();
  await cancelItemForm(page);

  await expect(page.locator('.card')).toHaveCount(1);
  const items = await getItems(page);
  expect(items[0].is_deleted).toBe(false);
});

test('TC-CRUD-008: canceling add/edit without saving writes nothing', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'לא יישמר' });
  // SAVE-70: there are unsaved edits, so closing asks first.
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.click('.discard-confirm button:has-text("יציאה בלי שמירה")');

  await expect(page.locator('#item-overlay')).toHaveCount(0);
  expect(await getItems(page)).toHaveLength(0);
  expect(await getPendingChanges(page)).toHaveLength(0);
});

// SAVE-70 (SPEC.md section 9): an in-app dialog (not the browser's own)
// with three buttons that each say exactly what they do.
test('TC-CRUD-010: closing with unsaved edits asks first; "back to editing", Esc and clicking outside all keep the edits', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'עריכה שלא נשמרה' });
  const nameInput = page.locator('#item-overlay input[type=text] >> nth=0');
  const dialog = page.locator('.discard-confirm');

  await page.mouse.click(5, 5); // outside the form, on its backdrop
  await expect(dialog).toContainText('יש שינויים שלא נשמרו');
  await dialog.locator('button:has-text("חזרה לעריכה")').click();
  await expect(dialog).toHaveCount(0);
  await expect(nameInput).toHaveValue('עריכה שלא נשמרה');

  await page.click('#item-overlay button:has-text("ביטול")');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(nameInput).toHaveValue('עריכה שלא נשמרה');
  expect(await getItems(page)).toHaveLength(0);
});

test('TC-CRUD-011: a form with no edits closes without asking', async ({ page }) => {
  await openNewItemForm(page);
  await cancelItemForm(page);
  await expect(page.locator('.discard-confirm')).toHaveCount(0);
});

test('TC-CRUD-012: "save" in the unsaved-changes dialog saves and closes, like the form\'s own save', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'נשמר מהחלון' });
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.click('.discard-confirm button:has-text("שמירה")');

  await page.waitForSelector('#item-overlay', { state: 'detached' });
  expect((await getItems(page)).map((it) => it.name)).toContain('נשמר מהחלון');
});

test('TC-CRUD-013: "save" in the dialog runs the same checks - an empty name shows the error in the form', async ({ page }) => {
  await seedItems(page, [{ row_id: 'NAMED', name: 'שם קיים' }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await fillItemForm(page, { name: '' });
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.click('.discard-confirm button:has-text("שמירה")');

  await expect(page.locator('.discard-confirm')).toHaveCount(0);
  await expect(page.locator('#item-overlay')).toContainText('יש להזין שם ליצירה');
  expect((await getItems(page))[0].name).toBe('שם קיים');
});

// UI_STANDARD_GAP_ANALYSIS.md ACT-03/MSG-06: a successful save shows a
// brief confirmation that disappears on its own - the toast plumbing
// (.toast CSS, toast.* translation strings) existed since early in the
// project but nothing actually rendered it until now.
test('TC-ACT-003: a successful save shows a confirmation toast that auto-dismisses', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'עם הודעת אישור' });
  await saveItemForm(page);

  await expect(page.locator('.toast')).toContainText('נשמר מקומית');
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5000 });
});

test('TC-ACT-004: deleting an item shows its own confirmation toast', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'למחיקה עם הודעה' });
  await saveItemForm(page);
  // the save toast from above must not linger and be mistaken for the
  // delete one below.
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5000 });

  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await page.click('button:has-text("מחיקת פריט")');
  await page.waitForSelector('.confirm-modal');
  await page.click('.confirm-modal button.danger');

  await expect(page.locator('.toast')).toContainText('הפריט נמחק');
});

// ACT-04: the button locks the instant it's clicked (ItemForm sets
// disabled={saving} on both buttons), so a fast double-click/double-tap
// can't queue the same item twice. A local save normally completes so
// fast that the disabled state and the eventual unmount land in the same
// React commit - unobservable from outside, and racing two real
// Playwright clicks against a form that can vanish mid-flight destabilized
// the browser session rather than producing a clean assertion. Using the
// window.__testSlowSave hook (see ItemForm.jsx) to widen the window is
// the stable way to actually see and test the lock.
test('TC-ACT-005: the save button locks for the duration of the save, preventing a double-submit', async ({ page }) => {
  await page.evaluate(() => { window.__testSlowSave = 400; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'נעילת כפתור שמירה' });

  const saveBtn = page.locator('#item-overlay button[type=submit]');
  await saveBtn.click();
  await expect(saveBtn).toBeDisabled();
  await saveBtn.click({ force: true }); // a second click while locked must be a no-op

  await page.waitForSelector('#item-overlay', { state: 'detached' });
  const items = await getItems(page);
  expect(items).toHaveLength(1);
  const pending = await getPendingChanges(page);
  expect(pending.filter((c) => c.op === 'upsert')).toHaveLength(1);
});

// REG-016 (real user report): a local save that failed (e.g. IndexedDB
// blocked/full on that specific device) used to look exactly like nothing
// happened at all - no error, no success, the form just sat there. Now a
// failed save shows a persistent error toast and leaves the form open
// (unlike a success, which closes it) so the item isn't lost.
test('REG-016: a failed save shows an error toast instead of silently doing nothing', async ({ page }) => {
  await page.evaluate(() => { window.__testForceSaveError = true; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'שמירה שנכשלת' });

  const saveBtn = page.locator('#item-overlay button:has-text("שמירה")');
  await saveBtn.click();

  await expect(page.locator('.toast.error')).toContainText('השמירה במכשיר נכשלה');
  await expect(page.locator('#item-overlay')).toBeVisible(); // the form stays open, nothing was lost
  const items = await getItems(page);
  expect(items).toHaveLength(0); // never actually saved
});

// SPEC.md section 9 (gap 3): the click itself is acknowledged at once -
// "nothing happens" can no longer be what the user sees.
test('TC-ACT-006: the save button shows "שומר..." the moment it is clicked', async ({ page }) => {
  await page.evaluate(() => { window.__testSlowSave = 800; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'תווית שומר' });

  const saveBtn = page.locator('#item-overlay button[type=submit]');
  await saveBtn.click();
  await expect(saveBtn).toHaveText('שומר...');
  await page.waitForSelector('#item-overlay', { state: 'detached' });
});

// SPEC.md section 9 (gap 3): a save still running after 5s shows a soft
// "delayed" notice - not a failure, save stays locked, cancel stays
// available - and still completes normally if it finishes.
test('TC-ACT-007: a save still running after 5s shows a "delayed" notice, then completes normally', async ({ page }) => {
  await page.evaluate(() => { window.__testSlowSave = 6500; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'שמירה איטית' });

  const saveBtn = page.locator('#item-overlay button[type=submit]');
  await saveBtn.click();
  await expect(page.locator('#item-overlay .save-delayed')).toHaveText('השמירה מתעכבת...', { timeout: 6000 });
  await expect(saveBtn).toBeDisabled();
  await expect(page.locator('#item-overlay button:has-text("ביטול")')).toBeEnabled();
  await expect(page.locator('.toast.error')).toHaveCount(0);

  await page.waitForSelector('#item-overlay', { state: 'detached', timeout: 5000 });
  const items = await getItems(page);
  expect(items.map((it) => it.name)).toContain('שמירה איטית');
});

test('TC-SYNC-003 / TC-DM: a fresh photo queues its own uploadImage change, not a raw upsert payload', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'עם תמונה', imagePath: SAMPLE_IMAGE });
  await saveItemForm(page);

  await expect(page.locator('.chip', { hasText: 'ממתינים' })).toContainText('2');

  const pending = await getPendingChanges(page);
  const ops = new Set(pending.map((c) => c.op));
  expect(ops).toEqual(new Set(['upsert', 'uploadImage']));

  const uploadChange = pending.find((c) => c.op === 'uploadImage');
  expect(uploadChange.payload.image).toMatch(/^data:image\/jpeg;base64,/);

  // the item row itself must NOT carry the raw base64 - see REG-006.
  const items = await getItems(page);
  expect(items[0].image_url == null || !items[0].image_url.startsWith('data:')).toBe(true);
});

// REG-013 (user report): opening an item's edit form left the item list
// behind it fully scrollable - a touch/wheel gesture landing outside the
// modal's own card scrolled the page underneath, which looks broken since
// the modal itself doesn't move. See src/hooks/useBodyScrollLock.js.
test('REG-013: opening an item locks the background from scrolling behind it', async ({ page }) => {
  await seedItems(page, Array.from({ length: 20 }, (_, i) => ({ row_id: `SC${i}`, name: `פריט גלילה ${i}` })));
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');

  const overflowBefore = await page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(overflowBefore).not.toBe('hidden');

  await page.click('.card >> nth=0');
  await page.waitForSelector('#item-overlay');
  const overflowWhileOpen = await page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(overflowWhileOpen).toBe('hidden');

  await cancelItemForm(page);
  const overflowAfter = await page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(overflowAfter).not.toBe('hidden');
});

test('TC-IMG-ZOOM: clicking a card photo opens a full-size lightbox, without also opening the edit form', async ({ page }) => {
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  await seedItems(page, [{ row_id: 'ZM1', name: 'פריט עם תמונה', image_url: tinyPng }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');

  await page.click('.thumb-zoom');
  await expect(page.locator('.lightbox-overlay')).toBeVisible();
  await expect(page.locator('.lightbox-overlay img')).toHaveAttribute('src', tinyPng);
  // The edit form must NOT have opened underneath - the zoom button's
  // click must not have bubbled up to the card (see REG: thumb-zoom
  // regression that broke TC-SYNC-007/image-upload tests during review).
  await expect(page.locator('#item-overlay')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('.lightbox-overlay')).toHaveCount(0);

  // Clicking the rest of the card (not the zoom button) still opens the
  // edit form as always.
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
});

// REG-018 / SAVE-03 (found while building the save-button test plan,
// TEST_PLAN.md section 3a): the price input only accepted whole numbers,
// so the browser itself silently blocked the save of any item whose price
// had a decimal point - including existing items whose Sheet price was
// already decimal, where no change at all could be saved. The browser's
// own tooltip (in the browser's language, often scrolled out of view) was
// the only feedback; the button didn't even switch to "שומר...".
test('REG-018: an existing item with a decimal price can be edited and saved', async ({ page }) => {
  await seedItems(page, [{ row_id: 'DEC1', name: 'מחיר עשרוני', price: 1234.5 }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await page.fill('#item-overlay textarea', 'שינוי הערה');
  await saveItemForm(page);

  const item = (await getItems(page)).find((it) => it.row_id === 'DEC1');
  expect(item.notes).toBe('שינוי הערה');
  expect(item.price).toBe(1234.5);
});

test('REG-018b: a new item can be saved with a decimal price', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'מחיר חדש עשרוני', price: '99.9' });
  await saveItemForm(page);

  const items = await getItems(page);
  expect(items[0].price).toBe(99.9);
});

// SAVE-04: a negative price is rejected by the app itself, with its own
// message in the app's language - never by a browser tooltip.
test('TC-CRUD-009: a negative price is rejected with an app message, and nothing is saved', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'מחיר שלילי', price: '-5' });
  await page.click('#item-overlay button[type=submit]');

  await expect(page.locator('#item-overlay')).toContainText('המחיר חייב להיות 0 או יותר');
  await expect(page.locator('#item-overlay')).toBeVisible();
  expect(await getItems(page)).toHaveLength(0);
});
