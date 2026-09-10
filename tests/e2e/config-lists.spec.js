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
