// The remaining automatable scenarios from the save-button test plan
// (TEST_PLAN.md section 3a) - each test is named by its SAVE-xx id.
import { test, expect } from '@playwright/test';
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

const MOCK_URL = 'https://mock-apps-script.test/exec';
const saveButton = '#item-overlay button[type=submit]';
const nameInput = '#item-overlay input[type=text] >> nth=0';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
});

async function openFirstCard(page) {
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.click('.card');
  await page.waitForSelector('#item-overlay');
}

// --- א. אימות קלט ---

test('SAVE-02: a name of only spaces is rejected like an empty one', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: '   ' });
  await page.click(saveButton);
  await expect(page.locator('#item-overlay')).toContainText('יש להזין שם ליצירה');
  expect(await getItems(page)).toHaveLength(0);
});

test('SAVE-05: a price of 0 is saved as 0 and shown as ₪0, not as "missing price"', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'מחיר אפס', price: 0 });
  await saveItemForm(page);
  expect((await getItems(page))[0].price).toBe(0);
  const card = page.locator('.card', { hasText: 'מחיר אפס' });
  await expect(card.locator('.price')).toHaveText('₪0');
  await expect(card).not.toContainText('חסר מחיר');
});

test('SAVE-06: clearing an existing price saves it empty and shows "missing price"', async ({ page }) => {
  await seedItems(page, [{ row_id: 'PRICED', name: 'היה מחיר', price: 500 }]);
  await openFirstCard(page);
  await page.fill('#item-overlay input[type=number]', '');
  await saveItemForm(page);
  expect((await getItems(page))[0].price).toBeNull();
  await expect(page.locator('.card', { hasText: 'היה מחיר' })).toContainText('חסר מחיר');
});

test('SAVE-07: a serial number and SKU already used by another item are still saved (no uniqueness check)', async ({ page }) => {
  await seedItems(page, [{ row_id: 'FIRST', name: 'ראשון', serial_number: '111111', sku: 'A-1' }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'שני עם אותם מזהים', sku: 'A-1' });
  await page.locator('.field:has-text("מספר סידורי") input').fill('111111');
  await saveItemForm(page);
  const items = await getItems(page);
  expect(items).toHaveLength(2);
  expect(items.filter((it) => it.serial_number === '111111' && it.sku === 'A-1')).toHaveLength(2);
});

// --- ב. פידבק ונעילה ---

test('SAVE-12: pressing Enter in a text field saves, like clicking the button', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'נשמר באנטר' });
  await page.press(nameInput, 'Enter');
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  expect((await getItems(page)).map((it) => it.name)).toContain('נשמר באנטר');
});

test('SAVE-13: pressing Enter in the "add value" field adds the value and does not save the item', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'לא אמור להישמר עדיין' });
  const locationGroup = page.locator('.field:has-text("מיקום")').first();
  await locationGroup.locator('.add-btn').click();
  await locationGroup.locator('.inline-add input').fill('מחסן באנטר');
  await locationGroup.locator('.inline-add input').press('Enter');

  await expect(locationGroup.locator('select')).toHaveValue('מחסן באנטר');
  await expect(page.locator('#item-overlay')).toBeVisible();
  expect(await getItems(page)).toHaveLength(0);
});

test('SAVE-15: cancel during a slow save, then open another item - the first still saves and the second form stays open', async ({ page }) => {
  await page.evaluate(() => { window.__testSlowSave = 1500; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'שמירה איטית שבוטלה' });
  await page.click(saveButton);
  await page.click('#item-overlay button:has-text("ביטול")'); // mid-save: closes at once, no question
  await expect(page.locator('#item-overlay')).toHaveCount(0);

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'טופס שני' });
  await page.waitForTimeout(2000); // the first save finishes during this

  await expect(page.locator('#item-overlay')).toBeVisible();
  await expect(page.locator(nameInput)).toHaveValue('טופס שני');
  expect((await getItems(page)).map((it) => it.name)).toEqual(['שמירה איטית שבוטלה']);
});

test('SAVE-17: after a failed save, a successful retry replaces the error and closes the form', async ({ page }) => {
  await page.evaluate(() => { window.__testForceSaveError = true; });
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'ניסיון שני מצליח' });
  await page.click(saveButton);
  await expect(page.locator('.toast.error')).toBeVisible();

  await page.evaluate(() => { window.__testForceSaveError = false; });
  await page.click(saveButton);
  await page.waitForSelector('#item-overlay', { state: 'detached' });
  await expect(page.locator('.toast')).toContainText('נשמר מקומית');
  await expect(page.locator('.toast.error')).toHaveCount(0);
});

// --- ג. תוכן ---

test('SAVE-21: a new item with every field filled keeps all values, on the card and when reopened', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, {
    name: 'פריט מלא', size: '91X132', sku: 'SKU-9', type: 'מקורי', location: 'גלריה', status: 'ממוסגר', price: '2500', sold: true,
  });
  await page.locator('.field:has-text("מספר סידורי") input').fill('424242');
  await page.fill('#item-overlay textarea', 'הערה מלאה');
  await saveItemForm(page);

  expect((await getItems(page))[0]).toMatchObject({
    name: 'פריט מלא', size: '91X132', sku: 'SKU-9', type: 'מקורי', location: 'גלריה', physical_status: 'ממוסגר',
    price: 2500, serial_number: '424242', notes: 'הערה מלאה', availability_status: 'sold',
  });
  const card = page.locator('.card', { hasText: 'פריט מלא' });
  await expect(card).toContainText('91X132');
  await expect(card).toContainText('גלריה');
  await expect(card).toContainText('₪2,500');

  await card.click();
  await page.waitForSelector('#item-overlay');
  await expect(page.locator('#item-overlay textarea')).toHaveValue('הערה מלאה');
  await expect(page.locator('.field:has-text("מספר סידורי") input')).toHaveValue('424242');
});

test('SAVE-24: opening an item and saving with no change saves normally, without error', async ({ page }) => {
  await seedItems(page, [{ row_id: 'SAME', name: 'בלי שינוי' }]);
  await openFirstCard(page);
  await saveItemForm(page);
  await expect(page.locator('.toast')).toContainText('נשמר מקומית');
  expect((await getPendingChanges(page)).filter((c) => c.op === 'upsert')).toHaveLength(1);
});

test('SAVE-25: a save is attributed to the current team member', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'מי שמר' });
  await saveItemForm(page);
  expect((await getItems(page))[0].last_modified_by).toBe('שרה');

  await page.click('.card');
  await page.waitForSelector('#item-overlay');
  await expect(page.locator('#item-overlay .sub')).toContainText('שרה');
});

test('SAVE-27: a serial number made with the "generate" button is saved', async ({ page }) => {
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'מספר אוטומטי' });
  await page.click('#item-overlay button:has-text("צור קוד")');
  const generated = await page.locator('.field:has-text("מספר סידורי") input').inputValue();
  expect(generated).toMatch(/^\d{6}$/);
  await saveItemForm(page);
  expect((await getItems(page))[0].serial_number).toBe(generated);
});

test('SAVE-28: long notes mixing Hebrew, English and emoji are saved exactly as typed', async ({ page }) => {
  const notes = 'יצירה על בד Oil on canvas 🎨 - '.repeat(40) + '\nשורה שנייה: "מרכאות" ו-\'גרש\'';
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'הערות ארוכות' });
  await page.fill('#item-overlay textarea', notes);
  await saveItemForm(page);
  expect((await getItems(page))[0].notes).toBe(notes.trim());
});

// --- ד. תמונות ---

test('SAVE-32: removing an item\'s photo saves it without a photo', async ({ page }) => {
  await seedItems(page, [{ row_id: 'PHOTO', name: 'עם תמונה', image_url: 'https://drive.google.com/thumbnail?id=X&sz=w1000' }]);
  await openFirstCard(page);
  await page.click('#item-overlay button:has-text("הסר תמונה")');
  await saveItemForm(page);
  expect((await getItems(page))[0].image_url).toBeNull();
});

// --- ה. סנכרון ---

test('SAVE-45: a save made while a sync cycle is running goes out right after it - once', async ({ page }) => {
  let upserts = 0;
  let releaseGetAll;
  let holdNextGetAll = false;
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') {
      if (holdNextGetAll) {
        holdNextGetAll = false;
        await new Promise((resolve) => { releaseGetAll = resolve; });
      }
      return route.fulfill({ json: { items: [], config: {} } });
    }
    if (body.action === 'upsert') upserts++;
    return route.fulfill({ json: { ...body.payload } });
  });
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await page.waitForTimeout(500); // let the startup cycle finish

  holdNextGetAll = true;
  await page.click('.icon-btn[title]'); // start a cycle, held at its pull
  await expect.poll(() => typeof releaseGetAll).toBe('function');

  await openNewItemForm(page);
  await fillItemForm(page, { name: 'נשמר באמצע סבב' });
  await saveItemForm(page);
  await page.waitForTimeout(300);
  expect(upserts).toBe(0); // not sent alongside the running cycle

  releaseGetAll();
  await expect.poll(() => upserts, { timeout: 3000 }).toBe(1);
  await expect.poll(async () => (await getPendingChanges(page)).length, { timeout: 3000 }).toBe(0);
  await page.waitForTimeout(500);
  expect(upserts).toBe(1);
});

test('SAVE-71: closing/refreshing right after a save, before it synced, keeps it and sends it on the next open', async ({ page }) => {
  let serverUp = false;
  let upserts = 0;
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    if (!serverUp) return route.abort();
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: {} } });
    if (body.action === 'upsert') upserts++;
    return route.fulfill({ json: { ...body.payload } });
  });
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await openNewItemForm(page);
  await fillItemForm(page, { name: 'שרד רענון' });
  await saveItemForm(page);
  expect(await getPendingChanges(page)).toHaveLength(1);

  serverUp = true;
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  await expect(page.locator('.card', { hasText: 'שרד רענון' })).toBeVisible();
  await expect.poll(() => upserts, { timeout: 5000 }).toBe(1);
  await expect.poll(async () => (await getPendingChanges(page)).length, { timeout: 5000 }).toBe(0);
});
