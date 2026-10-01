// Export to Excel (LST-06 per UI_STANDARD_GAP_ANALYSIS.md: exports the
// currently filtered/displayed list, not necessarily the whole catalog).
//
// This writes a plain CSV rather than a real .xlsx. Excel opens a CSV
// directly with a double-click - same practical result for staff - and it
// avoids adding a third-party xlsx-writing library: the only one readily
// installable from npm (SheetJS's `xlsx` package) currently ships with two
// unpatched high-severity advisories (prototype pollution, ReDoS) with "no
// fix available" on the npm registry. For a business's own inventory data,
// a zero-dependency export with zero audit findings is the safer choice.
//
// SPEC.md section 14: the export is for staff - headers in the app's
// language, availability as "available"/"sold", a readable date, and no
// technical columns (row_id, raw timestamps). To compare against the Sheet
// field by field, export from the Sheet itself.
const COLUMNS = [
  ['serial_number', 'fields.serialNumber'],
  ['sku', 'fields.sku'],
  ['name', 'fields.name'],
  ['size', 'fields.size'],
  ['type', 'filters.type'],
  ['location', 'filters.location'],
  ['physical_status', 'fields.status'],
  ['availability_status', 'filters.availability', (v, t) => (v === 'sold' ? t('filters.sold') : t('filters.available'))],
  ['price', 'fields.price'],
  ['notes', 'fields.notes'],
  ['image_url', 'export.imageLink'],
  ['last_modified_by', 'export.modifiedBy'],
  ['last_modified_at', 'export.modifiedAt', (v) => formatDate(v)],
];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeCsvValue(value) {
  if (value == null) return '';
  let str = String(value);
  // Excel reads text starting with = + - @ as a formula - e.g. a note like
  // "- small flaw" shows as #NAME?. A leading space keeps it plain text.
  // A tab or line break before them is stripped by some apps first (SPEC 18.7).
  if (typeof value === 'string' && /^[\t\r\n]*[=+\-@]/.test(str)) str = ' ' + str;
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function itemsToCsv(items, t) {
  const lines = [COLUMNS.map(([, header]) => escapeCsvValue(t(header))).join(',')];
  for (const item of items) {
    lines.push(COLUMNS.map(([key, , format]) => escapeCsvValue(format ? format(item[key], t) : item[key])).join(','));
  }
  return lines.join('\r\n');
}

export function downloadItemsCsv(items, t, filename) {
  const csv = itemsToCsv(items, t);
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
