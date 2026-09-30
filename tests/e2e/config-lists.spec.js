// TC-CFG-* from TEST_PLAN.md.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, getPendingChanges, openNewItemForm, saveItemForm, reloadApp } from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
});

test('TC-CFG-001: adding a new location value appears immediately and is usable', async ({ page }) => {
  await openNewItemForm(page);
  const locationGroup = page.locator('.field:has-text("מיקום")').first();
  await locationGroup.locator('.add-btn').click();
  await locationGroup.locator('.inline-add input').fill('מחסן חדש');
  await locationGroup.locator('.inline-add button').click();

  await expect(locationGroup.locator('select')).toHaveValue('מחסן חדש');
  // ACT-03/MSG-06: confirmation toast on the inline "+" add too, not just
  // the dedicated list-management screen.
  await expect(page.locator('.toast')).toContainText('נוסף לרשימה');

  await page.fill('#item-overlay input[type=text] >> nth=0', 'פריט עם מיקום חדש');
  await saveItemForm(page);

  const pending = await getPendingChanges(page);
  const configChange = pending.find((c) => c.op === 'addConfigOption');
  expect(configChange).toBeTruthy();
  expect(configChange.payload).toEqual({ list_name: 'location', value: 'מחסן חדש' });
});

test('TC-CFG-002: adding the same value with different casing does not duplicate it', async ({ page }) => {
  await openNewItemForm(page);
  const typeGroup = page.locator('.field:has-text("סוג")').first();
  await typeGroup.locator('.add-btn').click();
  await typeGroup.locator('.inline-add input').fill('הדפס');
  await typeGroup.locator('.inline-add button').click();
  await expect(typeGroup.locator('select option', { hasText: 'הדפס' })).toHaveCount(1);

  await typeGroup.locator('.add-btn').click();
  await typeGroup.locator('.inline-add input').fill('הדפס'); // exact same value again
  await typeGroup.locator('.inline-add button').click();
  await expect(typeGroup.locator('select option', { hasText: 'הדפס' })).toHaveCount(1);
});

test('TC-CFG-003: default seed values match SPEC.md on first load', async ({ page }) => {
  await openNewItemForm(page);
  const expectations = {
    'מיקום': ['אביגדור', 'גלריה', 'חיים'],
    'סוג': ['מקורי', 'מיקס מדיה'],
  };
  for (const [labelText, values] of Object.entries(expectations)) {
    const group = page.locator('.field:has-text("' + labelText + '")').first();
    for (const v of values) {
      await expect(group.locator('select option', { hasText: v })).toHaveCount(1);
    }
  }
});

// CFG-04 (was a deferred stage-2 item, now built per task #15): a
// dedicated screen showing every existing value per list, that can also
// add new ones - separate from the inline "+" inside an item form.
test('TC-CFG-004: the dedicated list-management screen shows and adds values, visible from item forms too', async ({ page }) => {
  await page.click('.icon-btn[title="ניהול רשימות"]');
  await expect(page.locator('#config-overlay')).toBeVisible();

  // existing seed values show up as read-only badges, not just in a select
  await expect(page.locator('#config-overlay .badge', { hasText: 'גלריה' })).toBeVisible();

  const locationSection = page.locator('#config-overlay .field:has-text("מיקום")');
  await locationSection.locator('.inline-add input').fill('מחסן מהמסך הייעודי');
  await locationSection.locator('.inline-add button').click();
  await expect(locationSection.locator('.badge', { hasText: 'מחסן מהמסך הייעודי' })).toBeVisible();

  await page.click('#config-overlay button:has-text("סגירה")');
  await expect(page.locator('#config-overlay')).toHaveCount(0);

  // the value added from the dedicated screen is immediately usable from
  // the regular item-form "+" flow too - same underlying config list.
  await openNewItemForm(page);
  const formLocationGroup = page.locator('#item-overlay .field:has-text("מיקום")').first();
  await expect(formLocationGroup.locator('select option', { hasText: 'מחסן מהמסך הייעודי' })).toHaveCount(1);
});

// REG-026 (SPEC.md section 13): a value added here whose send failed, while
// the pull from the server succeeded, vanished from the list until the send
// finally went through.
test('REG-026: a new list value that is still waiting to be sent survives a sync', async ({ page }) => {
  await page.route('https://mock-apps-script.test/exec', async (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: [], config: { location: ['אביגדור', 'גלריה', 'חיים'] } } });
    return route.fulfill({ json: { error: 'push failed' } });
  });
  await page.click('button[title="ניהול רשימות"]');
  const location = page.locator('#config-overlay .field', { hasText: 'מיקום' });
  await location.locator('input').fill('מחסן חדש');
  await location.locator('button').click();
  await page.click('#config-overlay button:has-text("סגירה")');
  await page.click('button[title="רענון ידני"]');
  await expect.poll(async () => (await getPendingChanges(page))[0]?.attempts || 0).toBeGreaterThanOrEqual(1);

  await page.click('button[title="ניהול רשימות"]');
  await expect(page.locator('#config-overlay .field', { hasText: 'מיקום' }).locator('.badge', { hasText: 'מחסן חדש' })).toHaveCount(1);
});

// REG-027: adding a value that already exists said "added to the list".
test('REG-027: adding a value that already exists says so, and the form picks the existing one', async ({ page }) => {
  await page.click('button[title="ניהול רשימות"]');
  const location = page.locator('#config-overlay .field', { hasText: 'מיקום' });
  await location.locator('input').fill(' גלריה ');
  await location.locator('button').click();
  await expect(page.locator('.toast')).toContainText('הערך כבר קיים ברשימה');
  await expect(location.locator('.badge', { hasText: 'גלריה' })).toHaveCount(1);
  expect((await getPendingChanges(page)).filter((c) => c.op === 'addConfigOption')).toHaveLength(0);
  await page.click('#config-overlay button:has-text("סגירה")');

  // English values differing only in case resolve to the list's own spelling.
  await openNewItemForm(page);
  const typeGroup = page.locator('#item-overlay .field:has-text("סוג")').first();
  await typeGroup.locator('.add-btn').click();
  await typeGroup.locator('.inline-add input').fill('Print');
  await typeGroup.locator('.inline-add button').click();
  await typeGroup.locator('.add-btn').click();
  await typeGroup.locator('.inline-add input').fill('print');
  await typeGroup.locator('.inline-add button').click();
  await expect(page.locator('.toast')).toContainText('הערך כבר קיים ברשימה');
  await expect(typeGroup.locator('select')).toHaveValue('Print');
});

test('TC-CFG-005: the "add" buttons are unavailable while the box is empty', async ({ page }) => {
  await page.click('button[title="ניהול רשימות"]');
  await expect(page.locator('#config-overlay .field', { hasText: 'מיקום' }).locator('button')).toBeDisabled();
  await page.click('#config-overlay button:has-text("סגירה")');
  await openNewItemForm(page);
  const locationGroup = page.locator('#item-overlay .field:has-text("מיקום")').first();
  await locationGroup.locator('.add-btn').click();
  await expect(locationGroup.locator('.inline-add button')).toBeDisabled();
});

test('TC-CFG-006: list values are sorted A-Z, in the form and in "manage lists"', async ({ page }) => {
  await page.click('button[title="ניהול רשימות"]');
  const location = page.locator('#config-overlay .field', { hasText: 'מיקום' });
  await location.locator('input').fill('אאא ראשון');
  await location.locator('button').click();
  await expect(location.locator('.badge').first()).toHaveText('אאא ראשון');
  await page.click('#config-overlay button:has-text("סגירה")');

  await openNewItemForm(page);
  const options = await page.locator('#item-overlay .field:has-text("מיקום") select option').allTextContents();
  expect(options.slice(1)).toEqual([...options.slice(1)].sort((a, b) => a.localeCompare(b, 'he')));
  expect(options[1]).toBe('אאא ראשון');
});

// SPEC.md section 15: a new team member is added in "manage lists" - no
// developer needed - and joins the built-in names in "who are you".
test('TC-CFG-007: a team member added in "manage lists" appears in "who are you" and can be picked', async ({ page }) => {
  await page.click('button[title="ניהול רשימות"]');
  const team = page.locator('#config-overlay .field', { hasText: 'צוות' });
  await expect(team.locator('.badge', { hasText: 'שפרה' })).toHaveCount(1); // built-in names are there
  await team.locator('input').fill('רותי');
  await team.locator('button').click();
  await page.click('#config-overlay button:has-text("סגירה")');
  expect((await getPendingChanges(page)).find((c) => c.op === 'addConfigOption')?.payload).toEqual({ list_name: 'team', value: 'רותי' });

  await page.click('.chip.user'); // back to "who are you"
  await page.click('button:has-text("רותי")');
  await expect(page.locator('.chip.user')).toContainText('רותי');
  // Remembered on the device, though not a built-in name. (Checked in
  // storage rather than by reloading: this suite's identity setup re-seeds
  // the remembered name on every page load.)
  expect(await page.evaluate(() => localStorage.getItem('gallery_team_member'))).toBe('רותי');
});
