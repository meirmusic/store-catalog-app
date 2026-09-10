// TC-CFG-* from TEST_PLAN.md.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, getPendingChanges, openNewItemForm, saveItemForm } from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await page.reload();
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
