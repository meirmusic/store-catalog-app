// SPEC.md section 9 (gap 7): the app asks the browser for persistent
// storage, so the local database isn't evicted on its own when the device
// runs low on space (queued, unsent changes would be lost with it).
import { test, expect } from '@playwright/test';
import { pickIdentity } from '../helpers/app.js';

test('TC-OFF-006: the app requests persistent storage on startup', async ({ page }) => {
  await page.addInitScript(() => {
    window.__persistRequested = false;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        ...navigator.storage,
        persisted: () => Promise.resolve(false),
        persist: () => { window.__persistRequested = true; return Promise.resolve(true); },
        estimate: () => Promise.resolve({ usage: 0, quota: 0 }),
        getDirectory: navigator.storage?.getDirectory?.bind(navigator.storage),
      },
    });
  });
  await pickIdentity(page);
  await expect.poll(() => page.evaluate(() => window.__persistRequested)).toBe(true);
});
