// SPEC.md 19.1: the list's sort options. Items without the sorted value
// (no price, no serial number, never updated) always go last; ties keep
// name order.
export const SORT_OPTIONS = ['name', 'recent', 'priceHigh', 'priceLow', 'serial'];

const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'he');
const hasPrice = (it) => it.price != null && it.price !== '' && !Number.isNaN(Number(it.price));
const has = (v) => v != null && String(v).trim() !== '';

function missingLast(aHas, bHas) {
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  return 0;
}

const COMPARE = {
  name: byName,
  recent: (a, b) =>
    missingLast(has(a.last_modified_at), has(b.last_modified_at)) ||
    String(b.last_modified_at ?? '').localeCompare(String(a.last_modified_at ?? '')) ||
    byName(a, b),
  priceHigh: (a, b) =>
    missingLast(hasPrice(a), hasPrice(b)) || (hasPrice(a) && Number(b.price) - Number(a.price)) || byName(a, b),
  priceLow: (a, b) =>
    missingLast(hasPrice(a), hasPrice(b)) || (hasPrice(a) && Number(a.price) - Number(b.price)) || byName(a, b),
  serial: (a, b) =>
    missingLast(has(a.serial_number), has(b.serial_number)) ||
    String(a.serial_number ?? '').localeCompare(String(b.serial_number ?? ''), undefined, { numeric: true }) ||
    byName(a, b),
};

export function sortItems(items, sortBy) {
  return [...items].sort(COMPARE[sortBy] || byName);
}
