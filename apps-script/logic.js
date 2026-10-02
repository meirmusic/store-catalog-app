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
    if (String(ids[i]) === String(rowId)) return i; // as text (REG-034); 0-indexed here, Code.gs adds the +2 sheet offset
  }
  return -1;
}

// Mirrors Code.gs's driveThumbnailUrl - already pure, copied verbatim.
function driveThumbnailUrl(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
}

// Mirrors Code.gs's extractDriveFileId (REG-014, image-upload cleanup on
// retry). Only recognizes our own thumbnail URL format - the old
// uc?export=view links, blank cells, or anything else are left alone.
function extractDriveFileId(url) {
  if (typeof url !== 'string') return null;
  const match = /^https:\/\/drive\.google\.com\/thumbnail\?id=([^&]+)&sz=w1000$/.exec(url);
  return match ? match[1] : null;
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
    // The id is always text (SPEC.md 18.5, REG-034) - the Sheet may hold an
    // all-digit one as a number.
    if (key === 'row_id' && typeof value === 'number') value = String(value);
    item[key] = value === '' || value === undefined ? null : value;
  });
  return item;
}

// Mirrors the old->new URL rewrite decision inside Code.gs's fixImageUrls.
// Regression: writing the whole range back in one setValues() call used to
// re-send an untouched oversized cell and hit Sheets' 50,000-char limit -
// see REG-003. This function only decides *which* cells need a write; the
// caller (Code.gs) must write only those, never the whole range.
// Two known-unreliable formats, both replaced by the same reliable
// thumbnail URL: the old uc?export=view hotlink, and (REG-015) an
// lh3.googleusercontent.com/d/FILEID=...?authuser=N link - that one is
// tied to whichever Google account session (authuser slot) generated it,
// so it renders for some signed-in browsers and not others, even though
// the file's own "anyone with the link" sharing is fine. This turned up
// in a real item whose photo showed broken for the very person who'd
// uploaded it.
function planImageUrlFixes(cellValues) {
  const fixes = []; // { index, action: 'rewrite' | 'clear', value? }
  cellValues.forEach((url, i) => {
    if (typeof url !== 'string') return;
    const match =
      /drive\.google\.com\/uc\?export=view&id=([^&]+)/.exec(url) ||
      /lh3\.googleusercontent\.com\/d\/([^=?]+)/.exec(url);
    if (match) {
      fixes.push({ index: i, action: 'rewrite', value: driveThumbnailUrl(match[1]) });
    } else if (url.length > 2000) {
      fixes.push({ index: i, action: 'clear' });
    }
  });
  return fixes;
}

// Mirrors the row-exists guard at the top of Code.gs's handleUploadImage.
// Regression (REG-012): the guard used to run AFTER uploading to Drive and
// only skipped the Sheet write when the row wasn't found yet - it still
// returned { image_url } as if nothing were wrong. Since the client queues
// an item's 'upsert' (row creation) and 'uploadImage' as two independent
// changes, and one failing doesn't block the other, this let a photo
// upload "succeed" for a row that was never actually created - a real
// Drive file with nothing in the Sheet pointing to it, and a client that
// believed the photo was saved. Now the row must exist before anything is
// uploaded at all.
function planUploadImageResult(rowIndex) {
  if (rowIndex === -1) return { error: 'row not found - upsert has not been saved yet' };
  return { ok: true };
}

// Mirrors Code.gs's checkLoginCredentials (task #28 v3, the office
// email+password fallback login). hashFn is injected so this mirror never
// needs Apps Script's Utilities.computeDigest - real hashing behavior
// isn't what's under test here, only the accept/reject decision.
function checkLoginCredentials(auth, configuredEmail, configuredHash, hashFn) {
  if (!auth || !auth.email || !auth.password) return false;
  if (!configuredHash) return false;
  if (String(auth.email).trim().toLowerCase() !== String(configuredEmail).trim().toLowerCase()) return false;
  return hashFn(auth.password) === configuredHash;
}

// Mirrors Code.gs's validatePasswordReset (task #28 v4, self-service
// "forgot password"). `now` and the stored code/expiry are passed in
// rather than read from PropertiesService, so this is testable without
// any Apps Script service.
function validatePasswordReset(payload, configuredEmail, storedCode, storedExpires, now) {
  if (!payload || !payload.email || !payload.code || !payload.newPassword) {
    return { ok: false, error: 'invalid request' };
  }
  if (String(payload.email).trim().toLowerCase() !== String(configuredEmail).trim().toLowerCase()) {
    return { ok: false, error: 'invalid code' };
  }
  if (!storedCode || !storedExpires) return { ok: false, error: 'invalid code' };
  if (Number(storedExpires) < now) return { ok: false, error: 'code expired' };
  if (String(payload.code) !== String(storedCode)) return { ok: false, error: 'invalid code' };
  if (String(payload.newPassword).length < 8) return { ok: false, error: 'password too short' };
  return { ok: true };
}

// Mirrors Code.gs's buildErrorLogRow (SPEC.md section 17): one ErrorLog
// row per report - every value text and length-capped, a leading = + - @
// defused so a report can never become a formula in the Sheet.
function buildErrorLogRow(entry, serverTime) {
  const text = (value, max) => {
    const s = value == null ? '' : String(value).slice(0, max);
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  };
  const e = entry || {};
  return [
    serverTime,
    text(e.code, 12),
    text(e.action, 60),
    text(e.message, 500),
    text(e.stack, 1000),
    text(e.member, 60),
    text(e.device, 300),
    text(e.app_version, 40),
    text(e.occurred_at, 40),
    Math.max(1, Math.min(Number(e.count) || 1, 100000)),
  ];
}

// Mirrors Code.gs's anyDriveFileId (SPEC.md 23.3).
function anyDriveFileId(url) {
  if (typeof url !== 'string') return null;
  const match = /[?&]id=([\w-]+)/.exec(url) || /\/d\/([\w-]+)/.exec(url);
  return match ? match[1] : null;
}

export {
  anyDriveFileId,
  buildErrorLogRow,
  findRowIndex,
  driveThumbnailUrl,
  configValueExists,
  rowToItem,
  planImageUrlFixes,
  planUploadImageResult,
  checkLoginCredentials,
  validatePasswordReset,
  extractDriveFileId,
};
