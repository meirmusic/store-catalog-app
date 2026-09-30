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

async function exportCsv(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("ייצוא לאקסל")'),
  ]);
  return fs.readFileSync(await download.path(), 'utf-8').replace(/^﻿/, '');
}

// SPEC.md section 14: the export is for staff - app-language headers,
// readable values, no technical columns.
test('TC-LST-011: headers are in the app\'s language, availability is readable, and technical columns are left out', async ({ page }) => {
  await seedItems(page, [{
    row_id: 'TECH', name: 'פריט', sku: 'S1', serial_number: '555', availability_status: 'sold', price: 1200,
    last_modified_by: 'תמר', last_modified_at: '2026-09-30T08:05:00.000Z',
  }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  const [header, row] = (await exportCsv(page)).split('\r\n');

  expect(header.split(',')).toEqual([
    'מספר סידורי (תג פיזי)', 'מק"ט', 'שם היצירה', 'גודל', 'סוג', 'מיקום', 'סטטוס (מצב פיזי)', 'זמינות',
    'מחיר (₪)', 'הערות', 'קישור לתמונה', 'עודכן ע"י', 'תאריך עדכון',
  ].map((h) => (h.includes('"') ? `"${h.replace(/"/g, '""')}"` : h)));
  expect(row).toContain('נמכר');
  expect(row).toMatch(/30\/09\/2026 \d\d:05/);
  expect(row).not.toContain('TECH'); // no row_id
  expect(row).not.toContain('2026-09-30T'); // no raw timestamp
});

test('TC-LST-012: text starting with - + = or @ gets a leading space, so Excel shows it as text, not a formula', async ({ page }) => {
  await seedItems(page, [{ row_id: 'F1', name: '=כותרת', notes: '- פגם קטן בפינה', size: '+30' }]);
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
  const row = (await exportCsv(page)).split('\r\n')[1];
  expect(row).toContain(', - פגם קטן בפינה,');
  expect(row).toContain(', =כותרת,');
  expect(row).toContain(', +30,');
});
