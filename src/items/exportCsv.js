// Export to Excel (LST-06 per UI_STANDARD_GAP_ANALYSIS.md: exports the
// currently filtered/displayed list, not necessarily the whole catalog).
//
// This writes a plain CSV rather than a real .xlsx. Excel opens a CSV
// directly with a double-click - same practical result for staff - and it
// avoids adding a third-party xlsx-writing library: the only one readily
// installable from npm (SheetJS's `xlsx` package) currently ships with two
// unpatched high-severity advisories (prototype pollution, ReDoS) with "no
// fix available" on the npm registry. Those specifically affect *parsing*
// untrusted files, which this app never does - but for a business's own
// inventory data, a zero-dependency export with zero audit findings is the
// safer choice when it costs nothing in capability.
//
// Column order matches the Items sheet schema (see db.js) so an export from
// the app and an export of the Google Sheet are directly comparable field
// by field.
const COLUMNS = [
  'row_id', 'serial_number', 'sku', 'name', 'size', 'type', 'location',
  'physical_status', 'availability_status', 'price', 'notes', 'image_url',
  'last_modified_by', 'last_modified_at',
];

function escapeCsvValue(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function itemsToCsv(items) {
  const lines = [COLUMNS.join(',')];
  for (const item of items) {
    lines.push(COLUMNS.map((col) => escapeCsvValue(item[col])).join(','));
  }
  return lines.join('\r\n');
}

export function downloadItemsCsv(items, filename) {
  const csv = itemsToCsv(items);
  // Leading UTF-8 BOM: without it, Excel guesses the system locale's
  // encoding instead of UTF-8 and Hebrew text renders as mojibake.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `gallery-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
