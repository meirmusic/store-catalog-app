// LST-06 (UI_STANDARD_GAP_ANALYSIS.md): export must reflect the currently
// filtered/displayed list, not the whole unfiltered catalog.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { pickIdentity, clearAllData, seedItems, reloadApp } from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
});

test('TC-LST-010: export downloads a CSV of only the currently filtered items', async ({ page }) => {
  await seedItems(page, [
    { row_id: 'EXP1', name: 'פריט לייצוא', sku: '111', location: 'גלריה' },
    { row_id: 'EXP2', name: 'פריט אחר', sku: '222', location: 'חיים' },
  ]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');

  await page.selectOption('.filter-group:has-text("מיקום") select', { label: 'גלריה' });
  await expect(page.locator('.card')).toHaveCount(1);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("ייצוא לאקסל")'),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const path = await download.path();
  const content = fs.readFileSync(path, 'utf-8');
  expect(content).toContain('פריט לייצוא');
  expect(content).toContain('111');
  expect(content).not.toContain('פריט אחר'); // filtered out - must not leak into the export
});
