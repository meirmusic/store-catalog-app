// SPEC.md 20.1: is a serial number / SKU typed in the form already used by
// another (not deleted) item? Case and surrounding spaces don't matter.
// Only values that changed in this form are checked, so an item that
// already shared a value doesn't warn on every unrelated save.
const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

export function findDuplicates(items, { rowId, serial, sku, serialChanged, skuChanged }) {
  const found = [];
  const check = (field, value, changed) => {
    if (!changed || !norm(value)) return;
    const other = items.find((it) => it.row_id !== rowId && !it.is_deleted && norm(it[field]) === norm(value));
    if (other) found.push({ field, value: String(value).trim(), name: other.name });
  };
  check('serial_number', serial, serialChanged);
  check('sku', sku, skuChanged);
  return found;
}
