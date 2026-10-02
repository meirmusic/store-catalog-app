// SPEC.md 24.2 - every artwork can be seen as a card or as a row; for
// every capability there is an explicit decision for both views, and this
// table checks each one. TEST_PLAN.md TC-PAR-*.
//
// Adding a capability to one view, or adding a new view: add it here with a
// decision for every view - the first test fails until you do.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait } from '../helpers/app.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ITEMS = [
  { row_id: 'P1', name: 'עם תמונה', size: '50X70', location: 'גלריה', sku: 'SKU-77', type: 'מקורי', physical_status: 'ממוסגר', price: 900, availability_status: 'available', image_url: 'https://drive.google.com/thumbnail?id=P1&sz=w1000', last_modified_by: 'שרה', last_modified_at: new Date().toISOString() },
  { row_id: 'P2', name: 'נמכרה', availability_status: 'sold', image_url: 'https://drive.google.com/thumbnail?id=P2&sz=w1000' },
  { row_id: 'P3', name: 'ממתינה', availability_status: 'available', image_url: null, pending_image: PNG },
  { row_id: 'P4', name: 'בלי תמונה', availability_status: 'available', image_url: null },
];

// How each view shows things. A new view must fill in every key.
const VIEWS = {
  cards: { item: '.card', zoom: '.thumb-zoom', sold: '.ribbon', switchTo: null },
  list: { item: '.item-row', zoom: '.row-zoom', sold: '.row-sold', switchTo: 'button[aria-label="תצוגת רשימה"]' },
};

// true = must be there and work; a string = must NOT be there, and why.
const PARITY = {
  open: { cards: true, list: true },
  share: { cards: true, list: true },
  zoom: { cards: true, list: true },
  sold: { cards: true, list: true },
  price: { cards: true, list: true },
  modified: { cards: true, list: true },
  pendingUpload: { cards: true, list: true },
  ids: { cards: true, list: true },
  typeAndCondition: { cards: true, list: 'by design - the row is for quick scanning (SPEC.md 24.2)' },
};

const at = (page, view, name) => page.locator(VIEWS[view].item, { hasText: name });

// Each check: present(page, view) proves it works; part(page, view) is the
// element that must be absent when the decision says so.
const CHECKS = {
  open: {
    present: async (page, view) => {
      await at(page, view, 'עם תמונה').locator('.name').click();
      await expect(page.locator('#item-overlay h2')).toHaveText('עם תמונה');
    },
  },
  share: {
    present: async (page, view) => {
      await at(page, view, 'עם תמונה').locator('.share-icon-btn').click();
      await expect(page.locator('.share-dialog')).toBeVisible();
      await expect(page.locator('#item-overlay')).toHaveCount(0);
    },
    part: (page, view) => at(page, view, 'עם תמונה').locator('.share-icon-btn'),
  },
  zoom: {
    present: async (page, view) => {
      await at(page, view, 'עם תמונה').locator(VIEWS[view].zoom).click();
      await expect(page.locator('.lightbox-img')).toHaveAttribute('src', /sz=w1600/); // the large size
      await expect(page.locator('#item-overlay')).toHaveCount(0); // zooming doesn't open the form
      await page.click('.lightbox-close');
      await expect(page.locator('.lightbox-overlay')).toHaveCount(0);
      await expect(page.locator('#item-overlay')).toHaveCount(0); // nor does closing it
      await expect(at(page, view, 'בלי תמונה').locator(VIEWS[view].zoom)).toHaveCount(0); // nothing to zoom
      await at(page, view, 'ממתינה').locator(VIEWS[view].zoom).click(); // a photo not uploaded yet
      await expect(page.locator('.lightbox-img')).toHaveAttribute('src', /^data:image\/png/);
    },
    part: (page, view) => at(page, view, 'עם תמונה').locator(VIEWS[view].zoom),
  },
  sold: {
    present: async (page, view) => {
      await expect(at(page, view, 'נמכרה').locator(VIEWS[view].sold)).toHaveText('נמכר');
      await expect(at(page, view, 'עם תמונה').locator(VIEWS[view].sold)).toHaveCount(0);
    },
    part: (page, view) => at(page, view, 'נמכרה').locator(VIEWS[view].sold),
  },
  price: {
    present: async (page, view) => expect(at(page, view, 'עם תמונה')).toContainText('$900'),
    part: (page, view) => at(page, view, 'עם תמונה').getByText('$900'),
  },
  modified: {
    present: async (page, view) => {
      await page.selectOption('.sort-select select', 'recent');
      await expect(at(page, view, 'עם תמונה').locator('.modified-line')).toContainText('שרה');
    },
  },
  pendingUpload: {
    present: async (page, view) => expect(at(page, view, 'ממתינה').locator('.pending-badge')).toBeVisible(),
    part: (page, view) => at(page, view, 'ממתינה').locator('.pending-badge'),
  },
  typeAndCondition: {
    present: async (page, view) => {
      await expect(at(page, view, 'עם תמונה')).toContainText('מקורי');
      await expect(at(page, view, 'עם תמונה')).toContainText('ממוסגר');
    },
    part: (page, view) => at(page, view, 'עם תמונה').getByText('ממוסגר'),
  },
  ids: {
    present: async (page, view) => expect(at(page, view, 'עם תמונה')).toContainText('SKU-77'),
    part: (page, view) => at(page, view, 'עם תמונה').getByText('SKU-77'),
  },
};

test('TC-PAR-000: every capability has a decision for every view, and a check', () => {
  for (const [capability, decisions] of Object.entries(PARITY)) {
    expect(Object.keys(decisions).sort(), `"${capability}" - a decision for every view`).toEqual(Object.keys(VIEWS).sort());
    expect(CHECKS[capability], `"${capability}" - has a check`).toBeTruthy();
    for (const d of Object.values(decisions)) {
      if (d !== true) expect(CHECKS[capability].part, `"${capability}" - can check it's absent`).toBeTruthy();
    }
  }
});

test.beforeEach(async ({ page }) => {
  await pickIdentity(page);
  await clearAllData(page);
  await seedItems(page, ITEMS);
  await reloadAndWait(page);
});

for (const [capability, decisions] of Object.entries(PARITY)) {
  for (const [view, decision] of Object.entries(decisions)) {
    const title = decision === true ? `${capability} works in ${view}` : `${capability} is not in ${view} - ${decision}`;
    test(`TC-PAR: ${title}`, async ({ page }) => {
      if (VIEWS[view].switchTo) await page.click(VIEWS[view].switchTo);
      await expect(page.locator(VIEWS[view].item)).toHaveCount(ITEMS.length);
      if (decision === true) await CHECKS[capability].present(page, view);
      else await expect(CHECKS[capability].part(page, view)).toHaveCount(0);
    });
  }
}
