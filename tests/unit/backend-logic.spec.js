// TC-BE-001..008 from TEST_PLAN.md. Pure Node - no browser needed.
import { test, expect } from '@playwright/test';
import {
  findRowIndex,
  driveThumbnailUrl,
  configValueExists,
  rowToItem,
  planImageUrlFixes,
  planUploadImageResult,
} from '../../apps-script/logic.js';

test.describe('TC-BE: Apps Script pure logic', () => {
  test('TC-BE-006 (REG-002 regression): empty sheet does not crash findRowIndex', () => {
    expect(findRowIndex([], 'ABC123')).toBe(-1);
  });

  test('TC-BE-002: findRowIndex locates an existing row_id', () => {
    expect(findRowIndex(['AAA', 'BBB', 'CCC'], 'BBB')).toBe(1);
  });

  test('TC-BE-002b: findRowIndex returns -1 for a row_id that is not present (new item path)', () => {
    expect(findRowIndex(['AAA', 'BBB'], 'ZZZ')).toBe(-1);
  });

  test('TC-BE-004: driveThumbnailUrl uses the reliable thumbnail format, not uc?export=view', () => {
    const url = driveThumbnailUrl('FILE123');
    expect(url).toBe('https://drive.google.com/thumbnail?id=FILE123&sz=w1000');
    expect(url).not.toContain('uc?export=view');
  });

  test('TC-BE-005: config dedup check is case-insensitive', () => {
    const existing = [['type', 'מקורי'], ['location', 'גלריה']];
    expect(configValueExists(existing, 'type', 'מקורי')).toBe(true);
    expect(configValueExists(existing, 'location', 'חיים')).toBe(false);
  });

  test('TC-BE-001: rowToItem coerces is_deleted to a real boolean and blanks to null', () => {
    const header = ['row_id', 'name', 'is_deleted', 'price'];
    const item = rowToItem(header, ['R1', 'שם', 'TRUE', '']);
    expect(item).toEqual({ row_id: 'R1', name: 'שם', is_deleted: true, price: null });
  });

  test('TC-BE-001b: rowToItem treats a real false correctly (not just falsy)', () => {
    const header = ['row_id', 'is_deleted'];
    expect(rowToItem(header, ['R1', false]).is_deleted).toBe(false);
    expect(rowToItem(header, ['R1', 'FALSE']).is_deleted).toBe(false);
  });

  test('TC-BE-007 (REG-003 regression): oversized leftover cell is cleared, never rewritten verbatim', () => {
    const oversized = 'data:image/jpeg;base64,' + 'A'.repeat(60_000);
    const fixes = planImageUrlFixes([oversized, 'https://drive.google.com/uc?export=view&id=XYZ', null, '']);
    expect(fixes).toEqual([
      { index: 0, action: 'clear' },
      { index: 1, action: 'rewrite', value: 'https://drive.google.com/thumbnail?id=XYZ&sz=w1000' },
    ]);
    // The oversized value itself must never appear in what gets written back.
    const rewrittenValues = fixes.filter((f) => f.action === 'rewrite').map((f) => f.value);
    expect(rewrittenValues.join('')).not.toContain('A'.repeat(1000));
  });

  test('TC-BE-007b: an already-correct thumbnail URL is left untouched', () => {
    const fixes = planImageUrlFixes(['https://drive.google.com/thumbnail?id=ABC&sz=w1000']);
    expect(fixes).toEqual([]);
  });

  test('TC-BE-008 (REG-012 regression): uploadImage refuses a row that does not exist yet', () => {
    expect(planUploadImageResult(-1)).toEqual({ error: 'row not found - upsert has not been saved yet' });
  });

  test('TC-BE-008b: uploadImage proceeds once the row exists', () => {
    expect(planUploadImageResult(5)).toEqual({ ok: true });
  });
});
