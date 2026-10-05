// SPEC.md 26.3-26.5 - finger-sized header buttons, the form's polish, and
// the artwork just saved highlighted. TEST_PLAN.md TC-HDR / TC-FORM / TC-SAVED.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait } from '../helpers/app.js';

const ITEM = { row_id: 'F1', name: 'אלף', price: 900, availability_status: 'available' };

async function open(page, items = [ITEM], width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, items);
  await reloadAndWait(page);
}

test('TC-HDR-001: refresh, ⚙ and the team member\'s name are at least 44×44 - on a phone and a computer', async ({ page }) => {
  for (const width of [390, 1280]) {
    await open(page, [ITEM], width);
    for (const sel of ['header.top .icon-btn >> nth=0', '.header-menu > button', 'header.top .chip.user']) {
      const box = await page.locator(sel).boundingBox();
      expect(box.height, `${sel} at ${width}`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${sel} at ${width}`).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const h = await page.locator('header.top').evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeLessThan(70); // still one line on a phone
});

test('TC-FORM-001: the name is marked as required before any save attempt', async ({ page }) => {
  await open(page);
  await page.click('button:has-text("פריט חדש")');
  await expect(page.locator('label[for="item-name"] .required-mark')).toBeVisible();
  await expect(page.locator('#item-name')).toHaveAttribute('aria-required', 'true');
});

test('TC-FORM-002: a new item starts with the cursor in the name; editing an artwork does not', async ({ page }) => {
  await open(page);
  await page.click('button:has-text("פריט חדש")');
  await expect(page.locator('#item-name')).toBeFocused();
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.click('.card .name');
  await expect(page.locator('#item-overlay')).toBeVisible();
  await expect(page.locator('#item-name')).not.toBeFocused();
});

test('TC-FORM-003: no name - the message is right under the name, the field is marked, the cursor is in it; typing clears it', async ({ page }) => {
  await open(page);
  await page.click('button:has-text("פריט חדש")');
  await page.locator('#item-overlay textarea').focus();
  await page.click('#item-overlay button:has-text("שמירה")');
  const field = page.locator('.field', { has: page.locator('#item-name') });
  await expect(field.locator('.field-error')).toHaveText('יש להזין שם ליצירה');
  await expect(page.locator('#item-name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#item-name')).toBeFocused();
  await page.locator('#item-name').fill('א');
  await expect(field.locator('.field-error')).toHaveCount(0);
});

test('TC-FORM-004: a wrong price - the message is under the price, and the form scrolls the cursor to it', async ({ page }) => {
  await open(page);
  await page.click('.card .name');
  await page.locator('#item-overlay input[type=number]').fill('-5');
  await page.locator('#item-overlay textarea').focus();
  await page.click('#item-overlay button:has-text("שמירה")');
  const price = page.locator('#item-overlay input[type=number]');
  const field = page.locator('#item-overlay .field', { has: page.locator('input[type=number]') });
  await expect(field.locator('.field-error')).toHaveText('המחיר חייב להיות 0 או יותר');
  await expect(price).toBeFocused();
  await expect(price).toBeInViewport();
});

test('TC-SAVED-001: after saving, the artwork\'s card is highlighted for a moment, then not', async ({ page }) => {
  await open(page);
  await page.click('.card .name');
  await page.locator('#item-overlay textarea').fill('שינוי');
  await page.click('#item-overlay button:has-text("שמירה")');
  const card = page.locator('.card', { hasText: 'אלף' });
  await expect(card).toHaveClass(/just-saved/);
  await expect(card).not.toHaveClass(/just-saved/, { timeout: 5000 });
});

test('TC-SAVED-002: a new artwork far down a long list - the list scrolls to it and highlights it', async ({ page }) => {
  const many = Array.from({ length: 40 }, (_, i) => ({ row_id: 'M' + i, name: `א${String(i).padStart(2, '0')}`, availability_status: 'available' }));
  await open(page, many);
  await page.click('button:has-text("פריט חדש")');
  await page.locator('#item-name').fill('תתת אחרונה'); // sorts last
  await page.click('#item-overlay button:has-text("שמירה")');
  const card = page.locator('.card', { hasText: 'תתת אחרונה' });
  await expect(card).toHaveClass(/just-saved/);
  await expect(card).toBeInViewport();
});

test('TC-SAVED-003: saved but hidden by the current search - the message says so', async ({ page }) => {
  await open(page);
  await page.fill('.toolbar input', 'אלף');
  await page.click('button:has-text("פריט חדש")');
  await page.locator('#item-name').fill('בית');
  await page.click('#item-overlay button:has-text("שמירה")');
  await expect(page.locator('.toast')).toContainText('לא מוצג בגלל החיפוש או הסינון הנוכחי');
});
