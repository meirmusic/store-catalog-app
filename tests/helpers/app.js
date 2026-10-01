// Shared helpers for E2E/Integration tests - see TEST_PLAN.md section 1.
// Kept in one place so scenario tests read as the user action they encode,
// not repeated boilerplate.

const DEFAULT_USER = 'שרה';
const DEFAULT_EMAIL = 'test-user@example.com';

// index.html links Google Fonts, which this sandboxed test environment has
// no route to. Chromium's parser blocks on that stylesheet request (adding
// ~12s to every navigation, even with waitUntil: 'domcontentloaded') before
// the connection attempt gives up - aborting the requests outright avoids
// the wait entirely. The route persists on the page for its whole
// lifetime, so registering it once here also covers later reloadApp() calls.
async function blockGoogleFonts(page) {
  await page.route('**://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**://fonts.gstatic.com/**', (route) => route.abort());
}

const NAV_OPTS = { waitUntil: 'domcontentloaded' };

export async function reloadApp(page) {
  await page.reload(NAV_OPTS);
}

export async function reloadAndWait(page) {
  await reloadApp(page);
  await page.waitForSelector('text=קטלוג הגלריה');
}

// The header's manual refresh (⟳) - by its exact title, since several header
// icon buttons carry a title.
export async function clickRefresh(page) {
  await page.click('button[title="רענון ידני"]');
}

// Two gates stand before the main app: the office email + password (real
// access control) and the "who are you" team-member picker (attribution
// only). Both are seeded straight into localStorage via addInitScript, so
// they're in place before the app's first script runs and the two
// contexts' lazy useState initializers read them (see
// src/identity/passwordAuth.js and src/identity/TeamMemberContext.jsx).
// `name` is the team member (attribution); `email` is the signed-in
// office login. Google Sign-In was removed (SPEC.md section 15, REG-036).
export async function pickIdentity(page, name = DEFAULT_USER, email = DEFAULT_EMAIL) {
  await blockGoogleFonts(page);
  await page.addInitScript(
    ({ name, email }) => {
      localStorage.setItem('gallery_password_identity', JSON.stringify({ email, password: 'test-password' }));
      localStorage.setItem('gallery_team_member', name);
    },
    { name, email },
  );
  await page.goto('/', NAV_OPTS);
  await page.waitForSelector('text=קטלוג הגלריה');
}

// Bypasses the real upsert/uploadImage sync path entirely and writes
// straight into the local Dexie store - use this when a test cares about
// list/search/filter behavior on pre-existing data, not the save flow
// itself (that's what addItemViaForm is for).
export async function seedItems(page, items) {
  await page.evaluate(async (items) => {
    const mod = await import('/src/db/db.js');
    for (const item of items) {
      await mod.db.items.put({
        row_id: item.row_id || Math.random().toString(36).slice(2, 8).toUpperCase(),
        serial_number: null,
        sku: null,
        name: 'פריט בדיקה',
        size: null,
        type: null,
        location: null,
        physical_status: null,
        availability_status: 'available',
        price: null,
        notes: null,
        image_url: null,
        is_deleted: false,
        last_modified_by: null,
        last_modified_at: new Date().toISOString(),
        ...item,
      });
    }
  }, items);
}

export async function getPendingChanges(page) {
  return page.evaluate(async () => {
    const mod = await import('/src/db/db.js');
    return mod.db.pendingChanges.toArray();
  });
}

export async function getItems(page) {
  return page.evaluate(async () => {
    const mod = await import('/src/db/db.js');
    return mod.db.items.toArray();
  });
}

export async function clearAllData(page) {
  await page.evaluate(async () => {
    const mod = await import('/src/db/db.js');
    await mod.db.items.clear();
    await mod.db.pendingChanges.clear();
  });
}

// Fills and submits the real add/edit item form - exercises the actual
// user-facing save path (unlike seedItems).
export async function openNewItemForm(page) {
  await page.click('button:has-text("פריט חדש")');
  await page.waitForSelector('#item-overlay');
}

export async function fillItemForm(page, fields) {
  if (fields.name !== undefined) {
    await page.fill('#item-overlay input[type=text] >> nth=0', fields.name);
  }
  if (fields.size !== undefined) {
    const row2Inputs = await page.$$('#item-overlay .row2 input[type=text]');
    if (row2Inputs[0]) await row2Inputs[0].fill(fields.size);
  }
  if (fields.sku !== undefined) {
    const row2Inputs = await page.$$('#item-overlay .row2 input[type=text]');
    if (row2Inputs[1]) await row2Inputs[1].fill(fields.sku);
  }
  const selects = await page.$$('#item-overlay select');
  if (fields.type !== undefined && selects[0]) await selects[0].selectOption({ label: fields.type });
  if (fields.location !== undefined && selects[1]) await selects[1].selectOption({ label: fields.location });
  if (fields.status !== undefined && selects[2]) await selects[2].selectOption({ label: fields.status });
  if (fields.price !== undefined) {
    const priceInput = await page.$('#item-overlay input[type=number]');
    if (priceInput) await priceInput.fill(String(fields.price));
  }
  if (fields.serial !== undefined) {
    await page.locator('#item-overlay .field:has-text("מספר סידורי") input').fill(fields.serial);
  }
  if (fields.notes !== undefined) {
    await page.fill('#item-overlay textarea', fields.notes);
  }
  if (fields.sold) {
    await page.click('#item-overlay button:has-text("נמכר")');
  }
  if (fields.imagePath) {
    const fileInput = await page.$('#item-overlay input[type=file]');
    await fileInput.setInputFiles(fields.imagePath);
    // Resizing happens async (FileReader + canvas) - wait for the actual
    // preview <img> to carry a data: URL rather than a fixed timeout, so
    // this never races ahead of state actually updating.
    await page.waitForSelector('#item-overlay img[src^="data:"]', { timeout: 5000 });
  }
}

export async function saveItemForm(page) {
  await page.click('#item-overlay button:has-text("שמירה")');
  await page.waitForSelector('#item-overlay', { state: 'detached' });
}

// LanguageSwitcher's trigger button carries aria-label = current language's
// own display name (e.g. "עברית"), so this works regardless of which
// language is currently active.
export async function switchLanguage(page, targetLabel) {
  await page.click('button.chip[aria-expanded]');
  await page.click(`button:has-text("${targetLabel}")`);
}

export async function cancelItemForm(page) {
  await page.click('#item-overlay button:has-text("ביטול")');
  await page.waitForSelector('#item-overlay', { state: 'detached' });
}

// SPEC.md 19.10: "manage lists" and "sign out" live in the ⚙ menu.
export async function openMenuItem(page, label) {
  await page.click('button[title="תפריט"]');
  await page.click(`.header-menu-list button:has-text("${label}")`);
}

export async function openManageLists(page) {
  await openMenuItem(page, 'ניהול רשימות');
}

export async function startSignOut(page) {
  await openMenuItem(page, 'התנתקות');
}

// SPEC.md 19.4: the filters sit behind the "סינון" button. Safe to call
// when already open.
export async function openFilters(page) {
  const toggle = page.locator('.filters-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}
