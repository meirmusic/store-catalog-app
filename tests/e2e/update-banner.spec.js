// SPEC.md section 9 (REG-035, REG-037) - what the user sees when a new
// version arrives. The real service worker doesn't run in the dev server,
// so the "new version waiting" signal and the install are simulated
// (window.__testNeedRefresh / __testTriggerNeedRefresh / __testOnUpdate).
// A MutationObserver records anything that was EVER on screen - expect()
// alone waits for the final state and would miss a one-second flash.
import { test, expect } from '@playwright/test';
import { pickIdentity, reloadAndWait, openNewItemForm, cancelItemForm } from '../helpers/app.js';

async function watchBanner(page) {
  await page.addInitScript(() => {
    window.__bannerSeen = [];
    window.__updates = 0;
    window.__testOnUpdate = () => { window.__updates += 1; };
    new MutationObserver(() => {
      const banner = document.querySelector('.update-banner');
      if (banner) window.__bannerSeen.push(banner.innerText.trim());
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
}

const seen = (page) => page.evaluate(() => window.__bannerSeen);

test('REG-037: a version that installs by itself on opening never shows the "update" button - only "updating..."', async ({ page }) => {
  await pickIdentity(page);
  await watchBanner(page);
  await page.addInitScript(() => { window.__testNeedRefresh = true; });
  await reloadAndWait(page);
  await expect.poll(() => page.evaluate(() => window.__updates)).toBe(1);
  await expect(page.locator('.update-banner.updating')).toHaveText('מתעדכן לגרסה החדשה...');
  expect((await seen(page)).some((text) => text.includes('עדכון'))).toBe(false);
  await expect(page.locator('.update-banner button')).toHaveCount(0);
});

test('REG-037b: found while a form is open - the banner with "update" shows, and it installs once the form closes', async ({ page }) => {
  await pickIdentity(page);
  await watchBanner(page);
  await reloadAndWait(page);
  await openNewItemForm(page);
  await page.evaluate(() => window.__testTriggerNeedRefresh());
  await expect(page.locator('.update-banner button')).toHaveText('עדכון');
  expect(await page.evaluate(() => window.__updates)).toBe(0);
  await cancelItemForm(page);
  await expect.poll(() => page.evaluate(() => window.__updates)).toBe(1);
  await expect(page.locator('.update-banner.updating')).toBeVisible();
});

test('REG-037c: if installing fails, the banner with its button comes back and the error is shown', async ({ page }) => {
  await pickIdentity(page);
  await page.addInitScript(() => {
    window.__testNeedRefresh = true;
    window.__testOnUpdate = () => { throw new Error('the new version could not be activated'); };
  });
  await reloadAndWait(page);
  await expect(page.locator('.update-banner button')).toHaveText('עדכון');
  await expect(page.locator('.toast.error .error-tech')).toContainText('could not be activated');
});
