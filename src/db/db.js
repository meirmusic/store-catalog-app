import Dexie from 'dexie';

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

export async function getConfigList(listName) {
  const row = await db.config.get(listName);
  return row ? row.values : [];
}

export async function addConfigValue(listName, rawValue) {
  const value = (rawValue || '').trim();
  if (!value) return null;
  const row = await db.config.get(listName);
  const values = row ? row.values : [];
  const exists = values.some((v) => v.toLowerCase() === value.toLowerCase());
  if (!exists) {
    await db.config.put({ list_name: listName, values: [...values, value] });
  }
  return value;
}
