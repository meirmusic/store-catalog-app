import Dexie from 'dexie';
import { TEAM_NAMES } from '../config/seed.js';

// Local cache + offline sync queue. See SPEC.md "מבנה הנתונים" and
// "עבודה אופליין" - this is the on-device mirror of the Google Sheet,
// always the source the UI reads from; the sync engine (src/sync)
// reconciles it with the real backend when online.
export const db = new Dexie('gallery_catalog');

db.version(1).stores({
  // row_id is the real primary key (see SPEC.md) - never serial_number,
  // which is optional and business-only.
  items: 'row_id, sku, serial_number, availability_status, is_deleted, last_modified_at',

  // One row per list (location / type / physical_status), each holding
  // its current array of values. Seeded on first load - see config/seed.js.
  config: 'list_name',

  // Queue of not-yet-synced writes. Processed in insertion order by the
  // sync engine; see SPEC.md "מדיניות כשלים" for the retry/fail-visible policy.
  pendingChanges: '++id, row_id, createdAt',
});

// SPEC.md 26.2: the draft of a form that was interrupted (one at a time) -
// on this device only, never sent anywhere.
db.version(2).stores({
  drafts: 'id',
});

// SPEC.md section 9: ask the browser not to evict this database on its own
// when the device runs low on space - the catalog copy would just
// re-download, but queued changes not yet sent would be lost.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persisted()
    .then((already) => already || navigator.storage.persist())
    .catch(() => {});
}

export async function getConfigList(listName) {
  const row = await db.config.get(listName);
  return row ? row.values : [];
}

// Returns { value, added } - `value` is the list's own spelling when an
// equivalent value already exists (so "mixed" selects the existing "Mixed"),
// and `added` tells a real addition from a duplicate (SPEC.md section 13).
export async function addConfigValue(listName, rawValue) {
  const value = (rawValue || '').trim();
  if (!value) return null;
  const row = await db.config.get(listName);
  const values = row ? row.values : [];
  // The built-in team names always belong to the team list (SPEC.md 15).
  const known = listName === 'team' ? [...TEAM_NAMES, ...values] : values;
  const existing = known.find((v) => String(v).toLowerCase() === value.toLowerCase());
  if (existing !== undefined) return { value: existing, added: false };
  await db.config.put({ list_name: listName, values: [...values, value] });
  return { value, added: true };
}
