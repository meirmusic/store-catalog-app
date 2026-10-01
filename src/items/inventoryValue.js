// SPEC.md 20.2: inventory value = the sum of prices of AVAILABLE (not sold)
// items that have a price. Computed on the device, from what's on it.
const hasPrice = (it) => it.price != null && it.price !== '' && !Number.isNaN(Number(it.price));
const isAvailable = (it) => it.availability_status !== 'sold';

export function formatMoney(n) {
  return `$${Number(n).toLocaleString()}`;
}

export function availableValue(items) {
  return items.filter((it) => isAvailable(it) && hasPrice(it)).reduce((sum, it) => sum + Number(it.price), 0);
}

// { total, unpriced, byType: [[name, {count, value}]], byLocation: [...] }
export function inventoryValue(items) {
  const priced = items.filter((it) => isAvailable(it) && hasPrice(it));
  const group = (field) => {
    const map = new Map();
    priced.forEach((it) => {
      const key = it[field] || '—';
      const entry = map.get(key) || { count: 0, value: 0 };
      entry.count += 1;
      entry.value += Number(it.price);
      map.set(key, entry);
    });
    return [...map.entries()].sort((a, b) => b[1].value - a[1].value);
  };
  return {
    total: priced.reduce((sum, it) => sum + Number(it.price), 0),
    unpriced: items.filter((it) => isAvailable(it) && !hasPrice(it)).length,
    byType: group('type'),
    byLocation: group('location'),
  };
}
