// Pure logic mirrored from apps-script/Code.gs, extracted so it can be
// unit-tested under plain Node (Apps Script itself cannot run outside
// Google's servers - there is no way to execute Code.gs directly in CI or
// locally). See TEST_PLAN.md section 3 ("Unit - לוגיקת Apps Script").
//
// IMPORTANT: this file is never pasted into the Apps Script editor and
// Code.gs never imports it (Apps Script's editor doesn't support importing
// another file the way Node does, and this project's deploy step is a
// manual full-file paste per SPEC.md's operational notes) - it exists only
// for this Node-side test suite, hence the plain ES module syntax below.
// Whenever the corresponding logic in Code.gs changes, update the matching
// function here too - the comment above each function names exactly which
// Code.gs function it mirrors.

// Mirrors Code.gs's findRowIndexByRowId, with `ids` already extracted as a
// plain array (Code.gs gets these via sheet.getRange(...).getValues()).
// Regression: used to crash with "range height must be >= 1" when the
// sheet had zero data rows (only the header) - see REG-002 in TEST_PLAN.md.
function findRowIndex(ids, rowId) {
  if (ids.length === 0) return -1;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === rowId) return i; // 0-indexed here; Code.gs adds the +2 sheet offset itself
  }
  return -1;
}

// Mirrors Code.gs's driveThumbnailUrl - already pure, copied verbatim.
function driveThumbnailUrl(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
}

// Mirrors the dedup check inside Code.gs's handleAddConfigOption.
function configValueExists(existingRows, listName, value) {
  return existingRows.some(
    (row) => row[0] === listName && String(row[1]).toLowerCase() === String(value).toLowerCase(),
  );
}

// Mirrors Code.gs's rowToItem.
function rowToItem(headerRow, row) {
  const item = {};
  headerRow.forEach((key, i) => {
    let value = row[i];
    if (key === 'is_deleted') {
      value = value === true || value === 'TRUE' || value === 'true';
    }
    item[key] = value === '' || value === undefined ? null : value;
  });
  return item;
}

// Mirrors the old->new URL rewrite decision inside Code.gs's fixImageUrls.
// Regression: writing the whole range back in one setValues() call used to
// re-send an untouched oversized cell and hit Sheets' 50,000-char limit -
// see REG-003. This function only decides *which* cells need a write; the
// caller (Code.gs) must write only those, never the whole range.
function planImageUrlFixes(cellValues) {
  const fixes = []; // { index, action: 'rewrite' | 'clear', value? }
  cellValues.forEach((url, i) => {
    if (typeof url !== 'string') return;
    const match = /drive\.google\.com\/uc\?export=view&id=([^&]+)/.exec(url);
    if (match) {
      fixes.push({ index: i, action: 'rewrite', value: driveThumbnailUrl(match[1]) });
    } else if (url.length > 2000) {
      fixes.push({ index: i, action: 'clear' });
    }
  });
  return fixes;
}

export { findRowIndex, driveThumbnailUrl, configValueExists, rowToItem, planImageUrlFixes };
