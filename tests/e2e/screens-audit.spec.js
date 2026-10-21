// SPEC.md 29.9 - a walk through every screen and window, on a phone and a
// computer, light and dark, Hebrew and English, checking what a person would
// notice: the page scrolling sideways, something cut off at the screen's
// edge, text too faint to read, a button too small for a finger, an error in
// the console. Runs with every test run and in the weekly automatic check.
// TEST_PLAN.md TC-AUDIT-*.
import { test, expect } from '@playwright/test';
import { pickIdentity, clearAllData, seedItems, reloadAndWait, switchLanguage, openFilters } from '../helpers/app.js';

const MOCK_URL = 'https://mock-apps-script.test/exec';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const NOW = new Date().toISOString();
const ITEMS = [
  { row_id: 'A1', name: 'זריחה בגליל - שמן על בד, מהדורה ראשונה', name_en: 'Galilee Sunrise', size: '91X132', type: 'מקורי', location: 'גלריה', physical_status: 'ממוסגר', sku: 'SKU-1', serial_number: '112345', price: 2500, availability_status: 'available', image_url: 'https://drive.google.com/thumbnail?id=A1&sz=w1000', last_modified_by: 'שרה', last_modified_at: NOW },
  { row_id: 'A2', name: 'שקיעה', size: '50X70', type: 'הדפס', availability_status: 'sold', price: 900, image_url: 'https://drive.google.com/thumbnail?id=A2&sz=w1000', last_modified_at: NOW },
  { row_id: 'A3', name: 'בלי תמונה', availability_status: 'available', last_modified_at: NOW },
];
const CONFIG = { type: ['מקורי', 'הדפס'], location: ['גלריה', 'מחסן'], physical_status: ['ממוסגר', 'גליל'] };

const VARIANTS = [
  { name: 'phone, Hebrew, light', width: 390, height: 844, scheme: 'light', lang: null },
  { name: 'phone, Hebrew, dark', width: 390, height: 844, scheme: 'dark', lang: null },
  { name: 'phone, English, light', width: 390, height: 844, scheme: 'light', lang: 'English' },
  { name: 'computer, Hebrew, light', width: 1280, height: 800, scheme: 'light', lang: null },
];

// Everything a person would notice, on whatever is on screen now.
function auditScreen({ phone }) {
  const problems = [];
  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 1) problems.push(`the page scrolls sideways (${document.documentElement.scrollWidth - vw}px)`);

  const parse = (c) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])] : null;
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  // The color behind an element: its own background, else its parents'. null - a picture behind it.
  const backgroundOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none') return null;
      const bg = parse(s.backgroundColor);
      if (bg && bg[3] > 0) {
        layers.push(bg);
        if (bg[3] >= 1) break;
      }
    }
    let color = [255, 255, 255, 1];
    for (const layer of layers.reverse()) color = blend(layer, color);
    return color;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.95) return false;
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false;
    }
    return true;
  };
  const describe = (el) => {
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${cls} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
  };
  // inside something that scrolls or clips on purpose (a scrolling list, a crop)
  const clipped = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true;
    }
    return false;
  };

  // With a window open, only the window counts - what's behind it can't be touched.
  const layers = document.querySelectorAll('.overlay, .lightbox-overlay');
  const root = layers.length ? layers[layers.length - 1] : document.body;
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) problems.push(`cut off at the screen's edge: ${describe(el)}`);

    // letters or digits - an emoji's color isn't the color of its text
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.textContent));
    if (ownText && !el.closest(':disabled, [aria-disabled="true"]')) {
      const s = getComputedStyle(el);
      const fg = parse(s.color);
      const bg = backgroundOf(el);
      if (fg && bg) {
        const color = blend(fg, bg);
        const [a, b] = [lum(color), lum(bg)].sort((x, y) => y - x);
        const ratio = (a + 0.05) / (b + 0.05);
        const size = parseFloat(s.fontSize);
        const large = size >= 24 || (size >= 18.6 && Number(s.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) problems.push(`text too faint (${ratio.toFixed(2)}:1): ${describe(el)}`);
      }
    }

    if (phone && el.matches('button, a[href], select, input:not([type=hidden]), [role="button"]') && !el.closest('.visually-hidden')) {
      const label = el.closest('label');
      const target = label && label.contains(el) && el.matches('input') ? label.getBoundingClientRect() : r;
      if (target.width < 24 || target.height < 24) problems.push(`too small to tap (${Math.round(target.width)}x${Math.round(target.height)}): ${describe(el)}`);
    }
  }
  return [...new Set(problems)];
}

// Screens that are the catalog itself - what's found there is reported once, as "catalog".
const layerOpen = (screen) => !/^catalog|^totals|^filters|^search|^⚙/.test(screen);
const photoCard = (page) => page.locator('.card[data-row-id="A1"]');

// Every screen and window, each opened and then closed again.
const SCREENS = [
  ['catalog - cards', async () => {}],
  ['catalog - list', async (page) => page.click('.view-toggle button:nth-child(2)'), async (page) => page.click('.view-toggle button:nth-child(1)')],
  ['totals opened', async (page) => page.click('.stats-toggle'), async (page) => page.click('.stats-toggle')],
  ['filters opened', async (page) => openFilters(page), async (page) => page.click('.filters-toggle')],
  ['search with no results', async (page) => page.fill('.search-box input', 'אין כזה'), async (page) => page.fill('.search-box input', '')],
  ['⚙ menu', async (page) => page.click('.header-menu > button'), async (page) => page.keyboard.press('Escape')],
  ['artwork form', async (page) => photoCard(page).locator('.name').click(), async (page) => page.click('#item-overlay .modal-actions .left-actions button:first-child')],
  ['new artwork - a field error', async (page) => { await page.locator('button[data-usage="new-item"]:visible').click(); await page.click('#item-overlay button[type=submit]'); }, async (page) => page.click('#item-overlay .modal-actions .left-actions button:first-child')],
  ['leave without saving?', async (page) => { await photoCard(page).locator('.name').click(); await page.fill('#item-overlay textarea', 'x'); await page.click('#item-overlay .modal-actions .left-actions button:first-child'); },
    async (page) => { await page.click('.discard-confirm .danger'); }],
  ['delete?', async (page) => { await photoCard(page).locator('.name').click(); await page.click('#item-overlay .danger-btn'); },
    async (page) => { await page.keyboard.press('Escape'); await page.click('#item-overlay .modal-actions .left-actions button:first-child'); }],
  ['share', async (page) => { await photoCard(page).locator('.share-icon-btn').click(); await page.locator('.share-dialog .share-card-img').waitFor(); },
    async (page) => page.keyboard.press('Escape')],
  ['enlarged photo', async (page) => photoCard(page).locator('.thumb-zoom').click(), async (page) => page.click('.lightbox-close')],
  ['suggestion or problem', async (page) => { await page.click('.header-menu > button'); await page.locator('.header-menu-list button').nth(6).click(); }, async (page) => page.keyboard.press('Escape')],
  ['info & support', async (page) => { await page.click('.header-menu > button'); await page.locator('.header-menu-list button').nth(7).click(); }, async (page) => page.keyboard.press('Escape')],
  ['reload data', async (page) => { await page.click('.header-menu > button'); await page.locator('.header-menu-list button').nth(8).click(); }, async (page) => page.keyboard.press('Escape')],
  ['change password', async (page) => { await page.click('.header-menu > button'); await page.locator('.header-menu-list button').nth(4).click(); }, async (page) => page.keyboard.press('Escape')],
  ['manage lists', async (page) => { await page.click('.header-menu > button'); await page.locator('.header-menu-list button').nth(0).click(); }, async (page) => page.keyboard.press('Escape')],
];

async function mockServer(page) {
  await page.route(MOCK_URL, (route) => {
    const body = JSON.parse(route.request().postData());
    if (body.action === 'getAll') return route.fulfill({ json: { items: ITEMS, config: CONFIG, features: ['name_en'] } });
    if (body.action === 'getImage') return route.fulfill({ json: { mime: 'image/png', data: PNG_B64 } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('https://drive.google.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG_B64, 'base64') }));
}

for (const v of VARIANTS) {
  test(`TC-AUDIT-001: every screen - ${v.name}`, async ({ page }) => {
    test.setTimeout(90_000);
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.emulateMedia({ colorScheme: v.scheme });
    await mockServer(page);
    await pickIdentity(page);
    await clearAllData(page);
    await seedItems(page, ITEMS);
    await reloadAndWait(page);
    await expect(page.locator('.card')).toHaveCount(ITEMS.length);
    if (v.lang) await switchLanguage(page, v.lang);

    const found = new Set();
    for (const [screen, open, close] of SCREENS) {
      await open(page);
      await page.waitForTimeout(250); // animations settle
      const problems = await page.evaluate(auditScreen, { phone: v.width < 600 });
      problems.forEach((p) => found.add(p.includes(': ') && !layerOpen(screen) ? `catalog: ${p}` : `${screen}: ${p}`));
      if (close) await close(page);
      await expect(page.locator('.overlay, .header-menu-list, .lightbox-overlay')).toHaveCount(0);
    }
    expect([...found], [...found].join('\n')).toEqual([]);
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });
}

test('TC-AUDIT-002: the sign-in screens - phone, light and dark', async ({ page }) => {
  await page.route('**://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**://fonts.gstatic.com/**', (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  const found = [];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.removeItem('gallery_password_identity'); localStorage.removeItem('gallery_team_member'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('input[type=email]').waitFor();
    (await page.evaluate(auditScreen, { phone: true })).forEach((p) => found.push(`sign-in (${scheme}): ${p}`));
    await page.evaluate(() => localStorage.setItem('gallery_password_identity', JSON.stringify({ email: 'a@b.c', password: 'x' })));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.brand-cover, .team-picker, button').first().waitFor();
    (await page.evaluate(auditScreen, { phone: true })).forEach((p) => found.push(`who are you (${scheme}): ${p}`));
  }
  expect(found, found.join('\n')).toEqual([]);
});
