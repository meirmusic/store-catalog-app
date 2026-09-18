// TC-BE-001..008 from TEST_PLAN.md. Pure Node - no browser needed.
import { test, expect } from '@playwright/test';
import {
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
} from '../../apps-script/logic.js';

const CLIENT_ID = '123-abc.apps.googleusercontent.com';
const FAKE_HASH = (password) => 'hash:' + password;
const RESET_EMAIL = 'office@yossibittonart.com';

test.describe('TC-BE: Apps Script pure logic', () => {
  test('TC-BE-006 (REG-002 regression): empty sheet does not crash findRowIndex', () => {
    expect(findRowIndex([], 'ABC123')).toBe(-1);
  });

  test('TC-BE-002: findRowIndex locates an existing row_id', () => {
    expect(findRowIndex(['AAA', 'BBB', 'CCC'], 'BBB')).toBe(1);
  });

  test('TC-BE-002b: findRowIndex returns -1 for a row_id that is not present (new item path)', () => {
    expect(findRowIndex(['AAA', 'BBB'], 'ZZZ')).toBe(-1);
  });

  test('TC-BE-004: driveThumbnailUrl uses the reliable thumbnail format, not uc?export=view', () => {
    const url = driveThumbnailUrl('FILE123');
    expect(url).toBe('https://drive.google.com/thumbnail?id=FILE123&sz=w1000');
    expect(url).not.toContain('uc?export=view');
  });

  test('TC-BE-005: config dedup check is case-insensitive', () => {
    const existing = [['type', 'מקורי'], ['location', 'גלריה']];
    expect(configValueExists(existing, 'type', 'מקורי')).toBe(true);
    expect(configValueExists(existing, 'location', 'חיים')).toBe(false);
  });

  test('TC-BE-001: rowToItem coerces is_deleted to a real boolean and blanks to null', () => {
    const header = ['row_id', 'name', 'is_deleted', 'price'];
    const item = rowToItem(header, ['R1', 'שם', 'TRUE', '']);
    expect(item).toEqual({ row_id: 'R1', name: 'שם', is_deleted: true, price: null });
  });

  test('TC-BE-001b: rowToItem treats a real false correctly (not just falsy)', () => {
    const header = ['row_id', 'is_deleted'];
    expect(rowToItem(header, ['R1', false]).is_deleted).toBe(false);
    expect(rowToItem(header, ['R1', 'FALSE']).is_deleted).toBe(false);
  });

  test('TC-BE-007 (REG-003 regression): oversized leftover cell is cleared, never rewritten verbatim', () => {
    const oversized = 'data:image/jpeg;base64,' + 'A'.repeat(60_000);
    const fixes = planImageUrlFixes([oversized, 'https://drive.google.com/uc?export=view&id=XYZ', null, '']);
    expect(fixes).toEqual([
      { index: 0, action: 'clear' },
      { index: 1, action: 'rewrite', value: 'https://drive.google.com/thumbnail?id=XYZ&sz=w1000' },
    ]);
    // The oversized value itself must never appear in what gets written back.
    const rewrittenValues = fixes.filter((f) => f.action === 'rewrite').map((f) => f.value);
    expect(rewrittenValues.join('')).not.toContain('A'.repeat(1000));
  });

  test('TC-BE-007b: an already-correct thumbnail URL is left untouched', () => {
    const fixes = planImageUrlFixes(['https://drive.google.com/thumbnail?id=ABC&sz=w1000']);
    expect(fixes).toEqual([]);
  });

  // TC-BE-007c/d (REG-015 real user report): a photo showed broken on the
  // very device that had uploaded it, but fine elsewhere - the sheet cell
  // held a lh3.googleusercontent.com/d/FILEID=...?authuser=N link (tied to
  // a specific Google account session), not our own thumbnail?id= format.
  test('TC-BE-007c (REG-015): an lh3.googleusercontent.com/d/ link is rewritten to our thumbnail URL', () => {
    const fixes = planImageUrlFixes(['https://lh3.googleusercontent.com/d/1bUu5NEZKKOj5fg9AugZYQtarn1Czi_F4=w1000?authuser=0']);
    expect(fixes).toEqual([
      { index: 0, action: 'rewrite', value: 'https://drive.google.com/thumbnail?id=1bUu5NEZKKOj5fg9AugZYQtarn1Czi_F4&sz=w1000' },
    ]);
  });

  test('TC-BE-007d: an lh3.googleusercontent.com/d/ link with no size/authuser suffix is still rewritten', () => {
    const fixes = planImageUrlFixes(['https://lh3.googleusercontent.com/d/1bUu5NEZKKOj5fg9AugZYQtarn1Czi_F4']);
    expect(fixes).toEqual([
      { index: 0, action: 'rewrite', value: 'https://drive.google.com/thumbnail?id=1bUu5NEZKKOj5fg9AugZYQtarn1Czi_F4&sz=w1000' },
    ]);
  });

  test('TC-BE-008 (REG-012 regression): uploadImage refuses a row that does not exist yet', () => {
    expect(planUploadImageResult(-1)).toEqual({ error: 'row not found - upsert has not been saved yet' });
  });

  test('TC-BE-008b: uploadImage proceeds once the row exists', () => {
    expect(planUploadImageResult(5)).toEqual({ ok: true });
  });

  // TC-BE-009* (task #28): real Google Sign-In - the email is trusted only
  // once every check on the token passes.
  test('TC-BE-009: a genuine, verified token for the right app yields the email', () => {
    const tokenInfo = { aud: CLIENT_ID, email_verified: 'true', email: 'dov881@gmail.com' };
    expect(extractVerifiedEmail(tokenInfo, CLIENT_ID)).toBe('dov881@gmail.com');
  });

  test('TC-BE-009b: no token at all is rejected', () => {
    expect(extractVerifiedEmail(null, CLIENT_ID)).toBeNull();
  });

  test('TC-BE-009c: a token issued for a different OAuth client is rejected', () => {
    const tokenInfo = { aud: 'someone-elses-client-id', email_verified: 'true', email: 'dov881@gmail.com' };
    expect(extractVerifiedEmail(tokenInfo, CLIENT_ID)).toBeNull();
  });

  test('TC-BE-009d: an unverified email is rejected even with the right aud', () => {
    const tokenInfo = { aud: CLIENT_ID, email_verified: 'false', email: 'dov881@gmail.com' };
    expect(extractVerifiedEmail(tokenInfo, CLIENT_ID)).toBeNull();
  });

  // TC-BE-010* (task #28 v3): the office email+password fallback login -
  // not every phone has the shared Google account signed in, so this is a
  // second, independent way in, checked with the same server-side rigor.
  test('TC-BE-010: matching email and password (by hash) is accepted', () => {
    const auth = { email: 'office@yossibittonart.com', password: 'correct-horse' };
    expect(checkLoginCredentials(auth, 'office@yossibittonart.com', FAKE_HASH('correct-horse'), FAKE_HASH)).toBe(true);
  });

  test('TC-BE-010b: email comparison is case/whitespace-insensitive', () => {
    const auth = { email: '  OFFICE@yossibittonart.com  ', password: 'correct-horse' };
    expect(checkLoginCredentials(auth, 'office@yossibittonart.com', FAKE_HASH('correct-horse'), FAKE_HASH)).toBe(true);
  });

  test('TC-BE-010c: wrong password is rejected', () => {
    const auth = { email: 'office@yossibittonart.com', password: 'wrong-guess' };
    expect(checkLoginCredentials(auth, 'office@yossibittonart.com', FAKE_HASH('correct-horse'), FAKE_HASH)).toBe(false);
  });

  test('TC-BE-010d: wrong email is rejected even with the right password', () => {
    const auth = { email: 'someone-else@gmail.com', password: 'correct-horse' };
    expect(checkLoginCredentials(auth, 'office@yossibittonart.com', FAKE_HASH('correct-horse'), FAKE_HASH)).toBe(false);
  });

  test('TC-BE-010e: no password has been set up yet (configuredHash is null) always fails closed', () => {
    const auth = { email: 'office@yossibittonart.com', password: 'anything' };
    expect(checkLoginCredentials(auth, 'office@yossibittonart.com', null, FAKE_HASH)).toBe(false);
  });

  test('TC-BE-010f: missing auth object entirely is rejected', () => {
    expect(checkLoginCredentials(null, 'office@yossibittonart.com', FAKE_HASH('x'), FAKE_HASH)).toBe(false);
  });

  // TC-BE-011* (task #28 v4): self-service "forgot password" - a one-time
  // code emailed to the office inbox, then exchanged for a new password.
  test('TC-BE-011: correct email, correct unexpired code, and a valid new password is accepted', () => {
    const payload = { email: RESET_EMAIL, code: '123456', newPassword: 'a-new-strong-password' };
    const result = validatePasswordReset(payload, RESET_EMAIL, '123456', String(Date.now() + 60_000), Date.now());
    expect(result).toEqual({ ok: true });
  });

  test('TC-BE-011b: wrong code is rejected', () => {
    const payload = { email: RESET_EMAIL, code: '999999', newPassword: 'a-new-strong-password' };
    const result = validatePasswordReset(payload, RESET_EMAIL, '123456', String(Date.now() + 60_000), Date.now());
    expect(result).toEqual({ ok: false, error: 'invalid code' });
  });

  test('TC-BE-011c: expired code is rejected even if it matches', () => {
    const payload = { email: RESET_EMAIL, code: '123456', newPassword: 'a-new-strong-password' };
    const result = validatePasswordReset(payload, RESET_EMAIL, '123456', String(Date.now() - 1000), Date.now());
    expect(result).toEqual({ ok: false, error: 'code expired' });
  });

  test('TC-BE-011d: wrong email is rejected even with the right code', () => {
    const payload = { email: 'someone-else@gmail.com', code: '123456', newPassword: 'a-new-strong-password' };
    const result = validatePasswordReset(payload, RESET_EMAIL, '123456', String(Date.now() + 60_000), Date.now());
    expect(result).toEqual({ ok: false, error: 'invalid code' });
  });

  test('TC-BE-011e: no reset was ever requested (no stored code) is rejected', () => {
    const payload = { email: RESET_EMAIL, code: '123456', newPassword: 'a-new-strong-password' };
    const result = validatePasswordReset(payload, RESET_EMAIL, null, null, Date.now());
    expect(result).toEqual({ ok: false, error: 'invalid code' });
  });

  test('TC-BE-011f: a too-short new password is rejected even with a valid code', () => {
    const payload = { email: RESET_EMAIL, code: '123456', newPassword: 'short' };
    const result = validatePasswordReset(payload, RESET_EMAIL, '123456', String(Date.now() + 60_000), Date.now());
    expect(result).toEqual({ ok: false, error: 'password too short' });
  });

  test('TC-BE-011g: a request missing a field entirely is rejected', () => {
    const payload = { email: RESET_EMAIL, code: '123456' }; // no newPassword
    const result = validatePasswordReset(payload, RESET_EMAIL, '123456', String(Date.now() + 60_000), Date.now());
    expect(result).toEqual({ ok: false, error: 'invalid request' });
  });

  // TC-BE-012* (REG-014): a retried uploadImage - the client's own
  // confirmation of an earlier attempt got lost in transit, even though
  // that attempt already succeeded server-side - must replace the
  // previous Drive file, not just pile up an orphaned copy of it.
  test('TC-BE-012: our own thumbnail URL yields its file id', () => {
    expect(extractDriveFileId('https://drive.google.com/thumbnail?id=ABC123&sz=w1000')).toBe('ABC123');
  });

  test('TC-BE-012b: the old uc?export=view format is not recognized - never trash a file we cannot be sure is ours', () => {
    expect(extractDriveFileId('https://drive.google.com/uc?export=view&id=ABC123')).toBeNull();
  });

  test('TC-BE-012c: a blank cell yields nothing to trash', () => {
    expect(extractDriveFileId('')).toBeNull();
  });

  test('TC-BE-012d: a non-string value (e.g. Sheets returning an empty cell as "") is handled without throwing', () => {
    expect(extractDriveFileId(null)).toBeNull();
    expect(extractDriveFileId(undefined)).toBeNull();
  });
});
