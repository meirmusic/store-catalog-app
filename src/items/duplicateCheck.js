// SPEC.md 27.1: the serial number is an artwork's unique identifier - is the
// one typed in the form already used by another (not deleted) artwork?
// Surrounding spaces don't matter. The SKU may repeat, so it isn't checked.
const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

// The other artwork using this serial number, or null.
export function findSerialOwner(items, { rowId, serial }) {
  if (!norm(serial)) return null;
  return items.find((it) => it.row_id !== rowId && !it.is_deleted && norm(it.serial_number) === norm(serial)) || null;
}
