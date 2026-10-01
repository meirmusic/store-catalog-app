// SPEC.md section 15: the built-in team names פיגי and אמיתי (were פגי, עמיתי).
import { test, expect } from '@playwright/test';
import { pickIdentity, reloadAndWait } from '../helpers/app.js';

test('TC-TEAM-001: "who are you" lists פיגי and אמיתי, not the old spellings', async ({ page }) => {
  await pickIdentity(page);
  await page.click('.chip.user');
  await expect(page.locator('button:has-text("פיגי")')).toBeVisible();
  await expect(page.locator('button:has-text("אמיתי")')).toBeVisible();
  await expect(page.locator('button', { hasText: /^פגי$/ })).toHaveCount(0);
  await expect(page.locator('button', { hasText: /^עמיתי$/ })).toHaveCount(0);
});

test('TC-TEAM-002: a device that remembered an old spelling switches to the new one', async ({ page }) => {
  await pickIdentity(page, 'עמיתי');
  await expect(page.locator('.chip.user')).toContainText('אמיתי');
  expect(await page.evaluate(() => localStorage.getItem('gallery_team_member'))).toBe('אמיתי');
  await reloadAndWait(page);
  await expect(page.locator('.chip.user')).toContainText('אמיתי');
});
