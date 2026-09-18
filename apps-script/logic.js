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

// Mirrors Code.gs's extractVerifiedEmail (task #28, real Google Sign-In).
// Pure decision given an already-fetched tokeninfo response - the actual
// network call to Google (fetchGoogleTokenInfo) can't run outside Apps
// Script, but the decision logic itself can be tested here: `aud` must
// match this app's own OAuth Client ID (else a token meant for some other
// Google app would pass), and Google must have verified the email itself.
function extractVerifiedEmail(tokenInfo, expectedAud) {
  if (!tokenInfo) return null;
  if (tokenInfo.aud !== expectedAud) return null;
  if (tokenInfo.email_verified !== 'true' && tokenInfo.email_verified !== true) return null;
  return tokenInfo.email || null;
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

export {
  findRowIndex,
  driveThumbnailUrl,
  configValueExists,
  rowToItem,
  planImageUrlFixes,
  planUploadImageResult,
  extractVerifiedEmail,
  checkLoginCredentials,
  validatePasswordReset,
  extractDriveFileId,
};
