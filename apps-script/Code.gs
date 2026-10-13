/**
 * Gallery Catalog - Apps Script backend
 *
 * How to install (see SPEC.md tasks #1-#3):
 * 1. Open the Google Sheet, then Extensions > Apps Script.
 * 2. Delete whatever is in the default Code.gs and paste this whole file in.
 * 3. (Removed - Google Sign-In was dropped, SPEC.md section 15 / REG-036.)
 * 4. Change LOGIN_EMAIL below to the office email staff will type into the
 *    app's password login form - the app's only way in.
 * 5. Deploy > New deployment > type "Web app" > Execute as "Me",
 *    Who has access "Anyone" > Deploy. Copy the Web App URL.
 * 6. Put that URL into the app's environment as VITE_APPS_SCRIPT_URL.
 * 7. Set the shared password once: reload the Sheet's own browser tab (this
 *    runs onOpen below, adding a "קטלוג הגלריה" menu to the Sheet), then use
 *    that menu's "הגדרת סיסמת כניסה משותפת" item - a dialog asks for the
 *    password. It's hashed and stored in this script's Properties, never in
 *    the Sheet or in this file. (Running promptSetLoginPassword directly
 *    from this editor's own Run button does NOT work - SpreadsheetApp.getUi()
 *    only works when genuinely triggered from the Sheet's own UI.)
 *
 * Self-service password reset (task #28 v4): the app's own "שכחתי סיסמה"
 * (forgot password) link emails a one-time code to LOGIN_EMAIL via
 * MailApp - no extra setup needed for this beyond steps 1-7 above, since
 * MailApp sends as the script owner's own Google account. Staff can change
 * the shared password themselves from there without anyone running
 * promptSetLoginPassword by hand.
 *
 * Continuous-improvement loop (SPEC.md 29): set REPORT_EMAIL below, then
 * run installTriggers() once from this editor - an hourly self-check and a
 * weekly report by email every Sunday morning. Run weeklyReport() by hand
 * to get a report right away.
 *
 * Whenever you edit this file afterwards, you must create a new
 * deployment VERSION of the *same* deployment (Deploy > Manage
 * deployments > edit > new version) - not a brand new deployment,
 * or the URL will change.
 *
 * TESTING: this file can't run outside Google's servers, so its pure logic
 * (no SpreadsheetApp/DriveApp calls) is mirrored in apps-script/logic.js
 * and unit-tested there - see TEST_PLAN.md section 3. If you change
 * findRowIndexByRowId, driveThumbnailUrl, the config dedup check,
 * rowToItem or checkLoginCredentials here, update
 * the matching function in logic.js too.
 */

// Real end-to-end protection (task #28): every request must carry the
// fixed office email plus the shared password, hashed and compared against
// Script Properties (see checkLoginCredentials) - checked here server-side
// on every single request, not just gating the website's login screen.
// Google Sign-In used to be a second way in; it was removed (SPEC.md
// section 15, REG-036): for the one person using it every request failed,
// it needed an extra call to Google per request and lasted only an hour.
// A request carrying only a Google token is now rejected as 'forbidden'.
var LOGIN_EMAIL = 'office@yossibittonart.com';
// Not a secret by itself (it only widens the search space for anyone who
// already has the password) - just mixed into the hash so the stored
// value in Script Properties isn't a bare, precomputed-lookup-able hash.
var PASSWORD_SALT = 'gallery-catalog-v1';

var ITEMS_SHEET_NAME = 'Items';
var CONFIG_SHEET_NAME = 'Config';
var DRIVE_FOLDER_NAME = 'Gallery Catalog Images';

var ITEM_COLUMNS = [
  'row_id', 'serial_number', 'sku', 'name', 'size', 'type', 'location',
  'physical_status', 'availability_status', 'price', 'notes', 'image_url',
  'is_deleted', 'last_modified_by', 'last_modified_at',
  // SPEC.md 27.3 - added at the end (column P), so existing rows stay as they are.
  'name_en',
];

// The columns the Sheet has had from the start. Columns added after them
// (name_en...) are only used where the Sheet really has them (see below).
var ORIGINAL_COLUMN_COUNT = 15;

// The Items columns this server can safely use, after making sure the Sheet
// has room for them (SPEC.md 27.3):
// - a Sheet made from an Excel import may have exactly 15 columns - reading
//   a 16th would fail every request, so missing columns are added;
// - a new column's header is written the first time (no manual step);
// - if that column of the Sheet is already used for something else (a
//   header with another name), it is left alone and not written to.
function prepareItemColumns(sheet) {
  if (sheet.getMaxColumns() < ITEM_COLUMNS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), ITEM_COLUMNS.length - sheet.getMaxColumns());
  }
  var headerRow = sheet.getRange(1, 1, 1, ITEM_COLUMNS.length).getValues()[0];
  var columns = usableItemColumns(headerRow, ITEM_COLUMNS, ORIGINAL_COLUMN_COUNT);
  missingHeaderCells(headerRow, columns).forEach(function (cell) {
    sheet.getRange(1, cell.col).setValue(cell.name);
  });
  return columns;
}

// Mirrors logic.js: ITEM_COLUMNS up to the first added column whose header
// cell holds a different name.
function usableItemColumns(headerRow, columns, originalCount) {
  for (var i = originalCount; i < columns.length; i++) {
    if (headerRow[i] && headerRow[i] !== columns[i]) return columns.slice(0, i);
  }
  return columns;
}

// What this server can store - the app shows a field only once the server
// behind it keeps it (SPEC.md 27.3).
function serverFeatures(columns) {
  return columns.indexOf('name_en') !== -1 ? ['name_en'] : [];
}

// Mirrors logic.js: header cells (1-based column) that are blank where
// ITEM_COLUMNS expects a name.
function missingHeaderCells(headerRow, columns) {
  var missing = [];
  columns.forEach(function (name, i) {
    if (!headerRow[i]) missing.push({ col: i + 1, name: name });
  });
  return missing;
}

// Mirrors logic.js: the row to write for an upsert. A field the app didn't
// send keeps what the Sheet already has - an app version that doesn't know
// a newer field (e.g. name_en) must not erase it.
function buildUpsertRow(columns, payload, existingRow, now) {
  return columns.map(function (key, i) {
    if (key === 'row_id') return payload.row_id;
    if (key === 'last_modified_at') return now;
    if (key === 'last_modified_by') return payload.last_modified_by || '';
    if (key === 'is_deleted') return !!payload.is_deleted;
    if (!(key in payload)) return existingRow ? existingRow[i] : '';
    return payload[key] != null ? payload[key] : '';
  });
}

// Only these actions write to the Sheet and need the exclusive script
// lock (to stop two concurrent writes from corrupting each other's
// findRowIndex + write). 'getAll' is read-only, and as real multi-device
// usage grows, making every single poll queue up behind that same lock -
// including other devices' writes - was adding real, avoidable latency
// and timeout risk to something that never needed it.
var WRITE_ACTIONS = ['upsert', 'softDelete', 'addConfigOption', 'uploadImage'];

// SPEC.md section 18.1 (REG-031): EVERYTHING is inside the guard - reading
// the request, the sign-in check and waiting for the lock included. Any
// uncaught exception makes Apps Script answer with its own HTML error page,
// which has no CORS header - so the browser refuses it and iPhones report
// only "TypeError: Load failed", hiding the real reason.
function doPost(e) {
  try {
    return jsonResponse(handleRequest(e));
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

function handleRequest(e) {
  var body = JSON.parse(e.postData.contents);
  // These two actions are how someone recovers WITHOUT already having
  // valid credentials, so they can't sit behind the normal auth gate
  // below - each validates itself instead (matching email, a
  // short-lived one-time code sent to LOGIN_EMAIL's own inbox). Neither
  // touches the Sheet, so neither needs the write lock either.
  if (body.action === 'requestPasswordReset') return handleRequestPasswordReset(body.payload);
  if (body.action === 'resetPassword') return handleResetPassword(body.payload);
  if (!resolveAuthenticatedEmail(body)) return { error: 'forbidden' };
  var needsLock = WRITE_ACTIONS.indexOf(body.action) !== -1;
  var lock = needsLock ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(10000)) {
    // Another save holds the Sheet - an ordinary failed attempt, retried
    // by the app's next sync cycle.
    return { error: 'server busy - another save is in progress' };
  }
  try {
    switch (body.action) {
      case 'getAll':
        return handleGetAll();
      case 'upsert':
        return handleUpsert(body.payload);
      case 'softDelete':
        return handleSoftDelete(body.payload);
      case 'addConfigOption':
        return handleAddConfigOption(body.payload);
      case 'uploadImage':
        return handleUploadImage(body.payload);
      case 'getImage':
        return handleGetImage(body.payload);
      case 'logErrors':
        return handleLogErrors(body.payload);
      case 'logUsage':
        return handleLogUsage(body.payload);
      case 'sendFeedback':
        return handleSendFeedback(body.payload);
      default:
        return { error: 'unknown action: ' + body.action };
    }
  } finally {
    if (lock) lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// The office password login - the only way in (SPEC.md section 15).
// Returns the authenticated email on success, null otherwise; the caller
// only cares whether this is truthy.
function resolveAuthenticatedEmail(body) {
  if (body.auth) {
    if (checkLoginCredentials(body.auth, LOGIN_EMAIL, getStoredPasswordHash(), hashPassword)) {
      return LOGIN_EMAIL;
    }
    return null;
  }
  return null;
}

// Pure decision logic for the office password login - mirrored in logic.js
// for unit testing, with hashFn injected so the mirror doesn't need
// Apps Script's Utilities. `configuredHash` is null until
// promptSetLoginPassword has been run once; until then this path always
// fails closed rather than accepting any password.
function checkLoginCredentials(auth, configuredEmail, configuredHash, hashFn) {
  if (!auth || !auth.email || !auth.password) return false;
  if (!configuredHash) return false;
  if (String(auth.email).trim().toLowerCase() !== String(configuredEmail).trim().toLowerCase()) return false;
  return hashFn(auth.password) === configuredHash;
}

function getStoredPasswordHash() {
  return PropertiesService.getScriptProperties().getProperty('LOGIN_PASSWORD_HASH');
}

function hashPassword(password) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + PASSWORD_SALT);
  return bytesToHex(bytes);
}

function bytesToHex(bytes) {
  return bytes
    .map(function (b) {
      var v = (b + 256) % 256;
      return (v < 16 ? '0' : '') + v.toString(16);
    })
    .join('');
}

// Simple trigger - runs automatically whenever the Sheet is opened/reloaded
// (no deployment needed for this, unlike doPost). Exists only so
// promptSetLoginPassword can be launched from an actual in-Sheet menu
// click: SpreadsheetApp.getUi() throws "Cannot call ... from this
// context" when a function is run directly from the Apps Script editor's
// own Run button - it only works when the call genuinely originates from
// the Sheet's UI, such as a menu item.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('קטלוג הגלריה')
    .addItem('הגדרת סיסמת כניסה משותפת', 'promptSetLoginPassword')
    .addToUi();
}

// One-time (or whenever it needs to change) setup: in the Sheet itself
// (not the script editor), use the menu "קטלוג הגלריה" >
// "הגדרת סיסמת כניסה משותפת" (added by onOpen above) - a dialog appears
// asking for the new shared password. Typing it here, in a Google-native
// prompt, is deliberate: the password itself never has to appear in this
// file or get committed anywhere.
function promptSetLoginPassword() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'הגדרת סיסמת כניסה משותפת',
    'הקלד/י את הסיסמה החדשה לכל הצוות:',
    ui.ButtonSet.OK_CANCEL,
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  var password = result.getResponseText();
  if (!password) {
    ui.alert('לא הוזנה סיסמה - לא בוצע שינוי.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('LOGIN_PASSWORD_HASH', hashPassword(password));
  ui.alert('הסיסמה עודכנה בהצלחה.');
}

// Self-service "forgot password" (task #28 v4) - staff shouldn't need
// someone to run promptSetLoginPassword by hand every time. Emails a
// short-lived one-time code to LOGIN_EMAIL's own inbox; the response is
// deliberately the same {ok:true} whether or not the submitted email
// matched, so this can't be used to probe what the configured email is.
var PW_RESET_CODE_TTL_MS = 15 * 60 * 1000;
var PW_RESET_MIN_RESEND_MS = 60 * 1000;

function handleRequestPasswordReset(payload) {
  var email = payload && payload.email;
  if (!email || String(email).trim().toLowerCase() !== LOGIN_EMAIL.toLowerCase()) {
    return { ok: true };
  }
  var props = PropertiesService.getScriptProperties();
  var lastSent = Number(props.getProperty('PW_RESET_LAST_SENT') || 0);
  var now = Date.now();
  if (now - lastSent < PW_RESET_MIN_RESEND_MS) {
    return { ok: true }; // already sent one very recently - don't spam the inbox
  }
  var code = generateResetCode();
  // Send first, and only then record the code and the "last sent" time -
  // otherwise a failed send (e.g. MailApp not authorized yet) would make
  // every retry within the next minute report success without sending.
  MailApp.sendEmail(
    LOGIN_EMAIL,
    'קוד לאיפוס סיסמת קטלוג הגלריה',
    'קוד האיפוס שלך: ' + code + '\nהקוד תקף ל-15 דקות. אם לא ביקשת זאת, אפשר להתעלם מהמייל.'
  );
  props.setProperty('PW_RESET_CODE', code);
  props.setProperty('PW_RESET_EXPIRES', String(now + PW_RESET_CODE_TTL_MS));
  props.setProperty('PW_RESET_LAST_SENT', String(now));
  return { ok: true };
}

// One-off: run this from the Apps Script editor (select it next to Run)
// after deploying, to grant the "send email" permission the forgot-password
// flow needs. It sends nothing - just checks today's remaining mail quota,
// which requires the same permission.
function authorizeMail() {
  return 'mail quota left today: ' + MailApp.getRemainingDailyQuota();
}

function generateResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function handleResetPassword(payload) {
  var props = PropertiesService.getScriptProperties();
  var check = validatePasswordReset(
    payload,
    LOGIN_EMAIL,
    props.getProperty('PW_RESET_CODE'),
    props.getProperty('PW_RESET_EXPIRES'),
    Date.now(),
  );
  if (!check.ok) return { error: check.error };
  props.setProperty('LOGIN_PASSWORD_HASH', hashPassword(payload.newPassword));
  props.deleteProperty('PW_RESET_CODE');
  props.deleteProperty('PW_RESET_EXPIRES');
  return { ok: true };
}

// Pure decision logic for handleResetPassword - mirrored in logic.js.
// `now` and the stored code/expiry are passed in (not read from
// PropertiesService directly) so this can be unit-tested without Apps
// Script's services.
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

// handleAddConfigOption's dedup check - a case-insensitive
// (list_name, value) membership test.
function configValueExists(existingRows, listName, value) {
  return existingRows.some(function (row) {
    return row[0] === listName && String(row[1]).toLowerCase() === String(value).toLowerCase();
  });
}

function getItemsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ITEMS_SHEET_NAME);
}

function getConfigSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET_NAME);
}

// SPEC.md section 17: the app's error reports, one row each, in a tab that's
// created on first use. appendRow per row (atomic on its own), so this needs
// no lock - and must never hold one up for a real save.
var ERROR_LOG_SHEET_NAME = 'ErrorLog';
var ERROR_LOG_HEADER = ['זמן (שרת)', 'קוד', 'פעולה', 'הודעה', 'פרטים', 'חבר צוות', 'מכשיר', 'גרסה', 'מתי קרה במכשיר', 'כמה פעמים'];
var ERROR_LOG_MAX_ENTRIES = 30;

function getOrCreateErrorLogSheet() {
  return getOrCreateSheet(ERROR_LOG_SHEET_NAME, ERROR_LOG_HEADER);
}

// A tab the server keeps for itself (ErrorLog, Usage, Feedback, Health,
// Goals - SPEC.md 17 / 29.10): created with its header on first use.
function getOrCreateSheet(name, header) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(name);
  if (sheet) return sheet;
  // First use only: two devices reporting at the same moment must not both
  // try to create the tab (SPEC.md 18.6).
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('server busy - another save is in progress');
  try {
    sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
      sheet.appendRow(header);
      sheet.setFrozenRows(1);
    }
    return sheet;
  } finally {
    lock.releaseLock();
  }
}

function handleLogErrors(payload) {
  var entries = (payload && payload.entries) || [];
  if (!entries.length) return { ok: true, logged: 0 };
  var sheet = getOrCreateErrorLogSheet();
  var now = new Date().toISOString();
  var rows = entries.slice(0, ERROR_LOG_MAX_ENTRIES).map(function (entry) { return buildErrorLogRow(entry, now); });
  // One write for the whole batch (SPEC.md 18.6), not one per row.
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, logged: rows.length };
}

// Keep in sync with logic.js's buildErrorLogRow. Every value is text, cut
// to a safe length - and a leading = + - @ is defused, so a report can never
// turn into a formula in the Sheet.
function buildErrorLogRow(entry, serverTime) {
  function text(value, max) {
    var s = value == null ? '' : String(value).slice(0, max);
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }
  var e = entry || {};
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

function rowToItem(headerRow, row) {
  var item = {};
  headerRow.forEach(function (key, i) {
    var value = row[i];
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

function handleGetAll() {
  var sheet = getItemsSheet();
  var columns = prepareItemColumns(sheet);
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var items = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[0]) continue; // skip blank trailing rows
    var item = rowToItem(header, row);
    if (!item.is_deleted) items.push(item);
  }

  var configSheet = getConfigSheet();
  var configValues = configSheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < configValues.length; i++) {
    var listName = configValues[i][0];
    var value = configValues[i][1];
    if (!listName || !value) continue;
    if (!config[listName]) config[listName] = [];
    config[listName].push(value);
  }

  return { items: items, config: config, features: serverFeatures(columns) };
}

function findRowIndexByRowId(sheet, rowId) {
  if (sheet.getLastRow() < 2) return -1; // only the header row exists so far
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    // As text (SPEC.md 18.5, REG-034): the Sheet turns an all-digit id into a number.
    if (String(ids[i][0]) === String(rowId)) return i + 2; // 1-indexed, +1 for header row
  }
  return -1;
}

function handleUpsert(payload) {
  var sheet = getItemsSheet();
  var columns = prepareItemColumns(sheet);
  var now = new Date().toISOString();
  var rowIndex = findRowIndexByRowId(sheet, payload.row_id);
  var existingRow = rowIndex === -1 ? null : sheet.getRange(rowIndex, 1, 1, columns.length).getValues()[0];
  var rowValues = buildUpsertRow(columns, payload, existingRow, now);
  if (rowIndex === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(rowIndex, 1, 1, columns.length).setValues([rowValues]);
  }
  var item = {};
  columns.forEach(function (key, i) { item[key] = rowValues[i]; });
  return item;
}

function handleSoftDelete(payload) {
  var sheet = getItemsSheet();
  var rowIndex = findRowIndexByRowId(sheet, payload.row_id);
  if (rowIndex === -1) return { error: 'row not found' };
  var isDeletedCol = ITEM_COLUMNS.indexOf('is_deleted') + 1;
  var lastModByCol = ITEM_COLUMNS.indexOf('last_modified_by') + 1;
  var lastModAtCol = ITEM_COLUMNS.indexOf('last_modified_at') + 1;
  sheet.getRange(rowIndex, isDeletedCol).setValue(true);
  sheet.getRange(rowIndex, lastModByCol).setValue(payload.last_modified_by || '');
  sheet.getRange(rowIndex, lastModAtCol).setValue(new Date().toISOString());
  return { ok: true };
}

function handleAddConfigOption(payload) {
  var sheet = getConfigSheet();
  var values = sheet.getDataRange().getValues();
  if (!configValueExists(values, payload.list_name, payload.value)) {
    sheet.appendRow([payload.list_name, payload.value]);
  }
  return { ok: true };
}

function getOrCreateImageFolder() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

// SPEC.md 23.3 / 28.1: the photo file itself, for the designed share card -
// the app can't read it from Drive directly (Drive doesn't allow it from a
// web page). Read-only, so no lock. A very large original (old migrated
// photos) is refused, and the app says the card can't be made.
var MAX_SHARE_IMAGE_BYTES = 8 * 1024 * 1024;

function handleGetImage(payload) {
  var sheet = getItemsSheet();
  var rowIndex = findRowIndexByRowId(sheet, payload && payload.row_id);
  if (rowIndex === -1) return { error: 'row not found' };
  var imageUrl = sheet.getRange(rowIndex, ITEM_COLUMNS.indexOf('image_url') + 1).getValue();
  var fileId = anyDriveFileId(imageUrl);
  if (!fileId) return { error: 'this item has no Drive photo' };
  var blob = DriveApp.getFileById(fileId).getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > MAX_SHARE_IMAGE_BYTES) return { error: 'photo too large to share as a file' };
  return { mime: blob.getContentType() || 'image/jpeg', data: Utilities.base64Encode(bytes) };
}

// Keep in sync with logic.js's anyDriveFileId: the Drive file id in any of
// the photo link formats the Sheet holds (thumbnail, old uc?export=view,
// lh3.googleusercontent.com/d/, /file/d/).
function anyDriveFileId(url) {
  if (typeof url !== 'string') return null;
  var match = /[?&]id=([\w-]+)/.exec(url) || /\/d\/([\w-]+)/.exec(url);
  return match ? match[1] : null;
}

function handleUploadImage(payload) {
  var match = /^data:(image\/\w+);base64,(.*)$/.exec(payload.image);
  if (!match) return { error: 'invalid image data' };

  // Check the row exists BEFORE uploading anything to Drive: the client
  // queues an item's 'upsert' (row creation) and 'uploadImage' as two
  // independent changes (see syncEngine.js pushOne), and one failing does
  // not block the other from being attempted. If 'upsert' hasn't landed
  // yet (still retrying) and we uploaded the file anyway, silently
  // returning success here (as this used to) would leave a real Drive
  // file with no Sheet row pointing to it - the photo the client just
  // "successfully" set locally, but that will vanish on the next pull
  // once the client is corrected. See TEST_PLAN.md REG-012.
  var sheet = getItemsSheet();
  var rowIndex = findRowIndexByRowId(sheet, payload.row_id);
  if (rowIndex === -1) return { error: 'row not found - upsert has not been saved yet' };

  var contentType = match[1];
  var base64 = match[2];
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, contentType, payload.row_id + '.jpg');

  var imageUrlCol = ITEM_COLUMNS.indexOf('image_url') + 1;
  var previousUrl = sheet.getRange(rowIndex, imageUrlCol).getValue();

  var folder = getOrCreateImageFolder();
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var imageUrl = driveThumbnailUrl(file.getId());

  sheet.getRange(rowIndex, imageUrlCol).setValue(imageUrl);
  trashPreviousDriveFile(previousUrl, file.getId());
  return { image_url: imageUrl };
}

// Best-effort cleanup (REG-014): a request can succeed here on the server
// while its response to the browser gets lost in transit (a real,
// user-reported failure mode - Apps Script Web App responses go through
// a redirect to a temporary script.googleusercontent.com URL, which can
// occasionally 404 even though this function already ran to completion).
// When that happens the client never learns it worked, so the sync
// engine retries the same photo - which used to leave the previous
// attempt's file orphaned in Drive forever.
// Now every successful upload trashes whatever file the *previous*
// image_url pointed to, whether that previous upload was a real earlier
// photo or just an earlier retry of this same one - so retries replace
// instead of accumulating. Never lets a cleanup failure fail the request
// itself - the new photo is already saved in the Sheet either way.
function trashPreviousDriveFile(previousUrl, newFileId) {
  var previousId = extractDriveFileId(previousUrl);
  if (!previousId || previousId === newFileId) return;
  try {
    DriveApp.getFileById(previousId).setTrashed(true);
  } catch (err) {
    // Already gone, not one of ours, or some other transient issue - not
    // worth failing the upload itself over.
  }
}

// Pure - mirrored in logic.js. Only recognizes our own thumbnail URL
// format (driveThumbnailUrl's own output); anything else (the old
// uc?export=view links, blank, garbage) is left alone rather than
// guessed at.
function extractDriveFileId(url) {
  if (typeof url !== 'string') return null;
  var match = /^https:\/\/drive\.google\.com\/thumbnail\?id=([^&]+)&sz=w1000$/.exec(url);
  return match ? match[1] : null;
}

// 'uc?export=view' is Drive's classic hotlink format, but it's unreliable
// for embedding as an <img src> - Drive often serves an HTML interstitial
// instead of the raw bytes. This 'thumbnail' endpoint is the format Drive
// itself relies on for previews and renders consistently.
function driveThumbnailUrl(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
}

// One-off cleanup: run this once from the Apps Script editor (select it in
// the function dropdown next to the Run button, then click Run) to rewrite
// every existing image_url from the old uc?export=view format to the
// reliable thumbnail format, without re-uploading any images.
function fixImageUrls() {
  var sheet = getItemsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'no data rows';
  var imageUrlCol = ITEM_COLUMNS.indexOf('image_url') + 1;
  var range = sheet.getRange(2, imageUrlCol, lastRow - 1, 1);
  var values = range.getValues();
  var fixed = 0;
  var cleared = 0;
  for (var i = 0; i < values.length; i++) {
    var url = values[i][0];
    if (typeof url !== 'string') continue;
    // Two known-unreliable formats, both replaced by the same reliable
    // thumbnail URL: the old uc?export=view hotlink, and (REG-015) an
    // lh3.googleusercontent.com/d/FILEID=...?authuser=N link - that one
    // is tied to whichever Google account session (authuser slot)
    // generated it, so it renders for some signed-in browsers and not
    // others, even though the file's own "anyone with the link" sharing
    // is fine. This turned up in a real item whose photo showed broken
    // for the very person who'd uploaded it.
    var match =
      /drive\.google\.com\/uc\?export=view&id=([^&]+)/.exec(url) ||
      /lh3\.googleusercontent\.com\/d\/([^=?]+)/.exec(url);
    if (match) {
      // Only write the one cell that actually changed - never re-write
      // the whole range, since that would also re-send any oversized
      // leftover value below and hit the same 50,000-character limit.
      sheet.getRange(2 + i, imageUrlCol).setValue(driveThumbnailUrl(match[1]));
      fixed++;
    } else if (url.length > 2000) {
      // Stray raw image data that should never have landed in this cell
      // (a leftover from before the upload-wiring fix) - clear it instead
      // of leaving it in place, since Sheets rejects writing anything
      // over 50,000 characters, even re-writing what's already there.
      sheet.getRange(2 + i, imageUrlCol).setValue('');
      cleared++;
    }
  }
  return 'fixed ' + fixed + ', cleared ' + cleared + ' bad cell(s), out of ' + values.length + ' rows';
}


// One-off correction (see the gallery owner's note): 105 items were given
// a substitute image from the marketing catalog PDF, and 105 items were
// given a made-up serial number, during the first migration pass. Every
// piece is a one-of-a-kind original, so a catalog photo of "this design"
// is not a photo of the specific physical item - and staff want to assign
// serial numbers themselves, not have them invented. This clears both
// back to blank for exactly the affected row_ids (computed by re-checking
// the original Excel), leaving every other row untouched. Run once from
// the Apps Script editor's function dropdown.
var ROW_IDS_TO_CLEAR_IMAGE = [
  'DJGXUC', 'MJ6P9D', '8XQ7X7', 'AZ28S9', '9UK6CX', 'Y2GK8Q', 'X8PRWH', 'FK76P6', 'Z6F9M2',
  'R8WARN', 'TWKLM7', 'ZZWCZ7', 'KXS26Y', 'UXUWCY', 'XHUS23', '96MH85', 'VY6EXW', 'KUBZ4B',
  'QGSMNE', 'Y6WQHV', 'XDPD52', 'LAEBCK', 'BHKZZE', 'AQC3S3', 'GNRMH3', 'SNND42', '6QWW4J',
  '738AT7', 'C5R579', 'F9NT3A', 'VTJDRB', '5ALE2U', 'FE4UDN', 'VHA4Q2', 'GXWA54', '7HNZ3T',
  'F2PHHK', 'MKCBTP', 'ST6J92', 'GQCFF7', 'CSDMSQ', 'FHV6VJ', '4N3BQ8', 'DYK25P', '87274U',
  'ZL9P2F', '8MXPYM', 'ZFFVFH', 'MM9WG7', 'P3N6HD', 'JKHPZW', 'N7X6W7', '764HW6', 'FGPXBV',
  'H6C3SC', 'CFC9SQ', 'VUKVM4', 'FEQ68X', '4H8QV3', 'ZVN5EA', 'QLRDQW', 'VT5V5Q', 'KBAX49',
  'M65DMD', 'PEAF9R', 'WR6W3Y', '3WR4LW', '5C85QP', 'V3JLBS', 'YDBGE2', '9QMPAK', 'NQWKB8',
  'PYMBJU', 'W3VVWT', '6ZKZ87', 'PYNDQG', 'SC5FTT', 'YT325X', 'E9JYB6', 'N7NMJE', 'S62QEU',
  'FAB5QV', 'PULZY2', 'X9QVY6', 'ZRFTXR', 'EHKLVD', 'EYUDX8', 'RNPEMY', 'J2QTGS', '6SKLW2',
  '8XXEAY', 'XS5FGJ', 'HB2QYH', 'SPPHG2', 'J795Z7', 'KTNP68', 'EZN22B', '3YDWGD', 'H6JAQ4',
  'UCGL4P', 'NRGRB3', '8UADCJ', 'QXB426', 'CDRFM8', 'AKVKN9',
];

var ROW_IDS_TO_CLEAR_SERIAL = [
  'DJGXUC', 'MJ6P9D', '8XQ7X7', 'AZ28S9', 'X8PRWH', 'FK76P6', 'R8WARN', 'TWKLM7', 'ZZWCZ7',
  'PW2FZV', 'KXS26Y', 'UXUWCY', 'XHUS23', '96MH85', 'KUBZ4B', 'Y6WQHV', 'XDPD52', 'BHKZZE',
  'AQC3S3', 'GNRMH3', 'SNND42', 'C5R579', 'F9NT3A', '5ALE2U', 'FE4UDN', 'VHA4Q2', 'GXWA54',
  '7HNZ3T', 'MKCBTP', 'GQCFF7', 'CSDMSQ', 'FHV6VJ', '4N3BQ8', 'DYK25P', '87274U', 'ZL9P2F',
  'EFKSCK', '8MXPYM', 'ZFFVFH', 'P3N6HD', 'JKHPZW', 'N7X6W7', 'FGPXBV', 'H6C3SC', 'CFC9SQ',
  'VUKVM4', '4H8QV3', 'ZVN5EA', 'VT5V5Q', 'KBAX49', 'M65DMD', 'PEAF9R', 'WR6W3Y', '3WR4LW',
  'YDBGE2', '9QMPAK', 'NQWKB8', 'PYMBJU', '6ZKZ87', 'PYNDQG', 'SC5FTT', 'YT325X', 'E9JYB6',
  'N7NMJE', 'PULZY2', 'ZRFTXR', 'EHKLVD', '6SKLW2', '8XXEAY', 'SPPHG2', 'J795Z7', 'KTNP68',
  'EZN22B', 'UCGL4P', 'NRGRB3', '8UADCJ', 'QXB426', 'CDRFM8', 'AKVKN9', '8DVT9R', 'BFGSMA',
  'GAFGMG', '8ZR595', 'R8U2AE', 'YZHTTH', '5FWTKQ', 'P7X94L', 'AV4ZUA', '4HCPRK', 'YE25RA',
  '6MJHDC', 'EV3UVR', 'ZYLD6Y', 'BMHVGX', '2LZMSV', 'UJ8XNJ', 'C93Q5B', '9L9875', '6CPN4H',
  'WYMKLB', '4RTJKW', '7CQXQ8', 'LNEQ5A', 'JDKLJT', '99H7UL',
];

function fixMigratedFields() {
  var sheet = getItemsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'no data rows';
  var idCol = 1;
  var serialCol = ITEM_COLUMNS.indexOf('serial_number') + 1;
  var imageUrlCol = ITEM_COLUMNS.indexOf('image_url') + 1;
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  var imageSet = {};
  ROW_IDS_TO_CLEAR_IMAGE.forEach(function (id) { imageSet[id] = true; });
  var serialSet = {};
  ROW_IDS_TO_CLEAR_SERIAL.forEach(function (id) { serialSet[id] = true; });

  var clearedImages = 0;
  var clearedSerials = 0;
  for (var i = 0; i < ids.length; i++) {
    var rowId = ids[i][0];
    var sheetRow = 2 + i;
    if (imageSet[rowId]) {
      sheet.getRange(sheetRow, imageUrlCol).setValue('');
      clearedImages++;
    }
    if (serialSet[rowId]) {
      sheet.getRange(sheetRow, serialCol).setValue('');
      clearedSerials++;
    }
  }
  return 'cleared ' + clearedImages + ' image(s), ' + clearedSerials + ' serial number(s)';
}


// =====================================================================
// SPEC.md 29 - the continuous-improvement loop: usage counts from the app,
// suggestions from the team, a weekly catalog health scan, an hourly
// self-check and a weekly report by email. Privacy (29.2): counts and
// times only - never an artwork's name, price, SKU, serial number, notes,
// photo or anything typed; no person is identified (a random device code).
// Tested end to end in tests/unit/code-gs-sim.spec.js (TC-GS-1xx), which
// runs this file itself - so these functions are not mirrored in logic.js.
// =====================================================================

// ⚠️ Who gets the weekly report and the alerts. Put the address in quotes,
// e.g. var REPORT_EMAIL = 'name@example.com'; - by default the office email.
var REPORT_EMAIL = LOGIN_EMAIL;

var USAGE_SHEET_NAME = 'Usage';
var USAGE_HEADER = ['יום', 'מכשיר (קוד אקראי)', 'סוג מכשיר', 'מותקן', 'גרסה', 'נתונים', 'התקבל'];
var FEEDBACK_SHEET_NAME = 'Feedback';
var FEEDBACK_HEADER = ['זמן', 'הצעה / בעיה', 'מסכים אחרונים', 'גרסה', 'סוג מכשיר', 'שולח', 'טופל', 'מזהה'];
var HEALTH_SHEET_NAME = 'Health';
var HEALTH_HEADER = ['בעיה', 'מספר סידורי', 'שם', 'row_id', 'נבדק'];
var GOALS_SHEET_NAME = 'Goals';
var GOALS_HEADER = ['שיפור שאושר', 'מדד', 'מתאריך', 'ערך לפני', 'הערות'];

// The only names the app may count (keep in step with src/telemetry/usage.js -
// TC-USE-010 compares the two). Anything else is dropped here as well.
var USAGE_COUNTS = [
  'form-open', 'form-quick-close', 'form-error-name', 'form-error-price', 'form-error-serial',
  'draft-restored', 'draft-discarded', 'leave-unsaved', 'undo-delete',
  'new-open', 'new-saved',
  'share-open', 'share-ready', 'share-sent', 'share-cancel', 'share-failed',
  'search', 'search-empty', 'search-open',
  'offline', 'sync-ok', 'sync-fail',
];
var USAGE_TIMES = ['open', 'sync', 'upload', 'card', 'form', 'new-time', 'pending'];
var USAGE_TAP_NAME = /^(rage|dead):[a-z0-9-]{1,30}$/;
var DEVICE_KINDS = ['iphone', 'ipad', 'android', 'computer', 'other'];
var MAX_TIME_MS = 30 * 60 * 1000;
// A change can wait for days on a device that was offline - kept, not dropped.
var MAX_WAIT_MS = 14 * 24 * 60 * 60 * 1000;

// One row per device per day. Everything is checked against the lists
// above, so nothing else can reach the Sheet even from a modified app.
function cleanUsageDay(day) {
  var d = day || {};
  if (!/^\d{4}-\d\d-\d\d$/.test(String(d.day))) return null;
  if (!/^[a-z0-9]{6,16}$/.test(String(d.device_id))) return null;
  var counts = {};
  Object.keys(d.counts || {}).forEach(function (name) {
    var n = Math.floor(Number(d.counts[name]));
    if ((USAGE_COUNTS.indexOf(name) !== -1 || USAGE_TAP_NAME.test(name)) && n > 0) counts[name] = Math.min(n, 100000);
  });
  var times = {};
  Object.keys(d.times || {}).forEach(function (name) {
    if (USAGE_TIMES.indexOf(name) === -1 || !Array.isArray(d.times[name])) return;
    var max = name === 'pending' || name === 'upload' ? MAX_WAIT_MS : MAX_TIME_MS;
    var list = d.times[name].slice(0, 100).map(Number).filter(function (ms) { return ms >= 0 && ms <= max; })
      .map(function (ms) { return Math.round(ms / 100) * 100; });
    if (list.length) times[name] = list;
  });
  return [
    String(d.day),
    String(d.device_id),
    DEVICE_KINDS.indexOf(d.kind) !== -1 ? d.kind : 'other',
    d.installed ? 'כן' : 'לא',
    /^[\w.-]{1,40}$/.test(String(d.version)) ? String(d.version) : '?',
    JSON.stringify({ c: counts, t: times }),
  ];
}

function handleLogUsage(payload) {
  var days = ((payload && payload.days) || []).slice(0, 14);
  var now = new Date().toISOString();
  var rows = [];
  days.forEach(function (day) {
    var row = cleanUsageDay(day);
    if (row) rows.push(row.concat([now]));
  });
  if (!rows.length) return { ok: true, logged: 0 };
  var sheet = getOrCreateSheet(USAGE_SHEET_NAME, USAGE_HEADER);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, logged: rows.length };
}

// SPEC.md 29.8: a suggestion or problem, sent by a team member under their
// own name (the one place in section 29 a name is kept - they chose to send it).
// The same entry sent twice (an answer lost on the way) is kept once.
function handleSendFeedback(payload) {
  function text(value, max) {
    var s = value == null ? '' : String(value).slice(0, max);
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }
  var entries = ((payload && payload.entries) || []).slice(0, 20).filter(function (e) {
    return e && e.id && e.text && String(e.text).trim();
  });
  if (!entries.length) return { ok: true, saved: 0 };
  var sheet = getOrCreateSheet(FEEDBACK_SHEET_NAME, FEEDBACK_HEADER);
  var idCol = FEEDBACK_HEADER.length;
  var last = sheet.getLastRow();
  var known = last < 2 ? [] : sheet.getRange(2, idCol, last - 1, 1).getValues().map(function (r) { return String(r[0]); });
  var now = new Date().toISOString();
  var rows = [];
  entries.forEach(function (e) {
    var id = text(e.id, 40);
    if (known.indexOf(id) !== -1) return;
    known.push(id);
    rows.push([
      now,
      text(String(e.text).trim(), 2000),
      text((Array.isArray(e.screens) ? e.screens : []).join(' ← '), 200),
      text(e.version, 40),
      DEVICE_KINDS.indexOf(e.kind) !== -1 ? e.kind : 'other',
      text(e.member, 60),
      '',
      id,
    ]);
  });
  if (rows.length) sheet.getRange(last + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, saved: rows.length };
}

// ---- 29.6 Catalog health (weekly, from the Sheet - not about people) ----

var DAY_MS = 24 * 60 * 60 * 1000;
var UNTOUCHED_DAYS = 182; // about 6 months

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

// Pure: what's missing, from the items themselves. `knownIds` - the ids seen
// at the previous scan (null on the first one: "new this week" is unknown).
function scanCatalogHealth(items, knownIds, nowMs) {
  var problems = [];
  var counts = {
    total: 0, no_photo: 0, no_price: 0, no_serial: 0, no_location: 0, no_name_en: 0,
    new_week: knownIds ? 0 : null, new_incomplete: knownIds ? 0 : null,
    untouched: 0, dup_names: 0, dup_serials: 0,
  };
  var known = {};
  (knownIds || []).forEach(function (id) { known[id] = true; });
  var byName = {};
  var bySerial = {};
  items.forEach(function (it) {
    counts.total++;
    var add = function (key, label) {
      counts[key]++;
      problems.push([label, it]);
    };
    if (isBlank(it.image_url)) add('no_photo', 'בלי תמונה');
    if (isBlank(it.price)) add('no_price', 'בלי מחיר');
    if (isBlank(it.serial_number)) add('no_serial', 'בלי מספר סידורי');
    if (isBlank(it.location)) add('no_location', 'בלי מיקום');
    if (isBlank(it.name_en)) counts.no_name_en++; // a count only - most artworks don't have one yet
    if (knownIds && !known[it.row_id]) {
      counts.new_week++;
      if (isBlank(it.image_url) || isBlank(it.price)) add('new_incomplete', 'חדשה השבוע - נשמרה חסרה');
    }
    var at = Date.parse(it.last_modified_at);
    if (!isNaN(at) && nowMs - at > UNTOUCHED_DAYS * DAY_MS) add('untouched', 'לא עודכנה יותר מ-6 חודשים');
    if (!isBlank(it.name)) {
      var n = String(it.name).trim().toLowerCase();
      (byName[n] = byName[n] || []).push(it);
    }
    if (!isBlank(it.serial_number)) {
      var s = String(it.serial_number).trim().toLowerCase();
      (bySerial[s] = bySerial[s] || []).push(it);
    }
  });
  [[byName, 'dup_names', 'שם כפול'], [bySerial, 'dup_serials', 'מספר סידורי כפול']].forEach(function (group) {
    Object.keys(group[0]).forEach(function (key) {
      var list = group[0][key];
      if (list.length < 2) return;
      list.forEach(function (it) {
        counts[group[1]]++;
        problems.push([group[2], it]);
      });
    });
  });
  return { counts: counts, problems: problems };
}

function readLiveItems() {
  var sheet = getItemsSheet();
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var items = [];
  for (var r = 1; r < values.length; r++) {
    if (!values[r][0]) continue;
    var item = rowToItem(header, values[r]);
    if (!item.is_deleted) items.push(item);
  }
  return items;
}

// Script Properties hold up to 9KB per value - a long list is kept in parts.
function setLongProperty(props, key, value) {
  var size = 8000;
  var parts = Math.max(1, Math.ceil(value.length / size));
  for (var i = 0; i < parts; i++) props.setProperty(key + '_' + i, value.slice(i * size, (i + 1) * size));
  props.setProperty(key + '_parts', String(parts));
}

function getLongProperty(props, key) {
  var parts = Number(props.getProperty(key + '_parts') || 0);
  if (!parts) return null;
  var out = '';
  for (var i = 0; i < parts; i++) out += props.getProperty(key + '_' + i) || '';
  return out;
}

// Scans the catalog, rewrites the Health tab (the list of artworks to look
// at) and returns the numbers for the report.
function catalogHealth() {
  var props = PropertiesService.getScriptProperties();
  var items = readLiveItems();
  var knownRaw = getLongProperty(props, 'HEALTH_KNOWN_IDS');
  var result = scanCatalogHealth(items, knownRaw === null ? null : knownRaw.split(',').filter(String), Date.now());
  var sheet = getOrCreateSheet(HEALTH_SHEET_NAME, HEALTH_HEADER);
  sheet.clearContents();
  var checked = new Date().toISOString();
  var rows = [HEALTH_HEADER].concat(result.problems.map(function (p) {
    function text(v) {
      var s = v == null ? '' : String(v);
      return /^[=+\-@]/.test(s) ? "'" + s : s;
    }
    return [p[0], text(p[1].serial_number), text(p[1].name), text(p[1].row_id), checked];
  }));
  sheet.getRange(1, 1, rows.length, HEALTH_HEADER.length).setValues(rows);
  setLongProperty(props, 'HEALTH_KNOWN_IDS', items.map(function (it) { return String(it.row_id); }).join(','));
  return result.counts;
}

// ---- 29.7 Hourly self-check ----

var ALERT_REPEAT_MS = 6 * 60 * 60 * 1000;

// Runs every hour (installTriggers). Reads the Sheet and Drive like a real
// request would; a failure - an email right away (not again for the same
// failure within 6 hours). Also: app errors jumping to 3 times the usual.
function selfCheck() {
  var props = PropertiesService.getScriptProperties();
  var problems = [];
  try {
    var items = getItemsSheet();
    if (!items) throw new Error('the Items tab was not found');
    items.getRange(1, 1, 1, 1).getValues();
  } catch (err) {
    problems.push('גיליון: ' + err);
  }
  try {
    getOrCreateImageFolder().getName();
  } catch (err) {
    problems.push('דרייב: ' + err);
  }
  var tally = JSON.parse(props.getProperty('SELF_CHECK_WEEK') || '{"ok":0,"fail":0}');
  tally[problems.length ? 'fail' : 'ok']++;
  props.setProperty('SELF_CHECK_WEEK', JSON.stringify(tally));
  var now = Date.now();
  if (problems.length) {
    var text = problems.join('\n');
    var lastText = props.getProperty('SELF_CHECK_ALERT_TEXT');
    var lastAt = Number(props.getProperty('SELF_CHECK_ALERT_AT') || 0);
    if (text !== lastText || now - lastAt > ALERT_REPEAT_MS) {
      sendMail('⚠️ קטלוג הגלריה: השרת לא עובד כרגע',
        '<p>הבדיקה העצמית של השרת נכשלה:</p><pre dir="ltr">' + escapeHtml(text) + '</pre>' +
        '<p>האפליקציה ממשיכה לעבוד על המכשירים, והשינויים נשמרים בהם עד שהשרת חוזר.</p>');
      props.setProperty('SELF_CHECK_ALERT_TEXT', text);
      props.setProperty('SELF_CHECK_ALERT_AT', String(now));
    }
  } else {
    props.deleteProperty('SELF_CHECK_ALERT_TEXT');
  }
  var spike = errorSpike(readErrorLogTimes(), now);
  var lastSpike = Number(props.getProperty('SPIKE_ALERT_AT') || 0);
  if (spike.spike && now - lastSpike > DAY_MS) {
    sendMail('⚠️ קטלוג הגלריה: קפיצה בתקלות',
      '<p>ב-24 השעות האחרונות היו <b>' + spike.last24 + '</b> תקלות, לעומת ממוצע של ' + spike.average +
      ' ביום בשבוע שלפני. הפירוט בלשונית ErrorLog בגיליון.</p>');
    props.setProperty('SPIKE_ALERT_AT', String(now));
  }
  return problems.length ? 'failed: ' + problems.join('; ') : 'ok';
}

// [{ at: ms, count }] from the ErrorLog tab.
function readErrorLogTimes() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ERROR_LOG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, ERROR_LOG_HEADER.length).getValues().map(function (r) {
    return { at: Date.parse(r[0]), count: Number(r[9]) || 1, action: String(r[2]), message: String(r[3]) };
  });
}

// Pure: the last 24 hours against the daily average of the 7 days before.
function errorSpike(entries, nowMs) {
  var last24 = 0;
  var before = 0;
  entries.forEach(function (e) {
    var age = nowMs - e.at;
    if (age >= 0 && age < DAY_MS) last24 += e.count;
    else if (age >= DAY_MS && age < 8 * DAY_MS) before += e.count;
  });
  var average = Math.round((before / 7) * 10) / 10;
  return { last24: last24, average: average, spike: last24 >= 5 && last24 >= 3 * Math.max(average, 1) };
}

// ---- 29.9 The weekly report ----

function percentile(list, p) {
  if (!list.length) return null;
  var sorted = list.slice().sort(function (a, b) { return a - b; });
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function dayString(ms) {
  return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// Pure: one week of Usage rows ([day, device, kind, installed, version,
// json]) added up. The same device and day sent twice counts once (the last).
function summarizeUsage(rows, days) {
  var latest = {};
  rows.forEach(function (r) {
    if (days.indexOf(String(r[0])) !== -1) latest[r[0] + '|' + r[1]] = r;
  });
  var counts = {};
  var times = {};
  var devices = {};
  Object.keys(latest).forEach(function (key) {
    var r = latest[key];
    var data;
    try {
      data = JSON.parse(r[5]);
    } catch (err) {
      return;
    }
    Object.keys(data.c || {}).forEach(function (k) { counts[k] = (counts[k] || 0) + Number(data.c[k]); });
    Object.keys(data.t || {}).forEach(function (k) { times[k] = (times[k] || []).concat(data.t[k]); });
    var dev = devices[r[1]];
    if (!dev || String(r[0]) >= dev.day) devices[r[1]] = { day: String(r[0]), kind: r[2], installed: r[3] === 'כן', version: String(r[4]) };
  });
  return { counts: counts, times: times, devices: devices };
}

// Pure: devices whose version is older than the newest one, when the newest
// has been out for more than 3 days by their last day of use.
function devicesBehind(devices, versionFirstSeen) {
  var versions = Object.keys(versionFirstSeen).sort();
  var newest = versions[versions.length - 1];
  var behind = 0;
  Object.keys(devices).forEach(function (id) {
    var d = devices[id];
    if (d.version !== newest && (Date.parse(d.day) - Date.parse(versionFirstSeen[newest])) / DAY_MS > 3) behind++;
  });
  return { newest: newest || '', behind: behind };
}

function readSheetRows(name, width) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
}

// Everything the report shows, for this week and the one before.
function collectReport(nowMs, health, lastHealth) {
  var thisDays = [];
  var prevDays = [];
  for (var i = 1; i <= 7; i++) {
    thisDays.push(dayString(nowMs - i * DAY_MS));
    prevDays.push(dayString(nowMs - (i + 7) * DAY_MS));
  }
  var usageRows = readSheetRows(USAGE_SHEET_NAME, USAGE_HEADER.length);
  var firstSeen = {};
  usageRows.forEach(function (r) {
    var v = String(r[4]);
    if (v !== '?' && (!firstSeen[v] || String(r[0]) < firstSeen[v])) firstSeen[v] = String(r[0]);
  });
  var inWeek = function (at, weeksBack) {
    var age = nowMs - at;
    return age >= weeksBack * 7 * DAY_MS && age < (weeksBack + 1) * 7 * DAY_MS;
  };
  var errors = readErrorLogTimes();
  var weekErrors = errors.filter(function (e) { return inWeek(e.at, 0); });
  var top = {};
  weekErrors.forEach(function (e) {
    var key = e.action + ' · ' + e.message.slice(0, 120);
    top[key] = (top[key] || 0) + e.count;
  });
  var feedback = readSheetRows(FEEDBACK_SHEET_NAME, FEEDBACK_HEADER.length);
  var usage = summarizeUsage(usageRows, thisDays);
  var tally = JSON.parse(PropertiesService.getScriptProperties().getProperty('SELF_CHECK_WEEK') || '{"ok":0,"fail":0}');
  return {
    from: thisDays[6],
    to: thisDays[0],
    usage: usage,
    prevUsage: summarizeUsage(usageRows, prevDays),
    behind: devicesBehind(usage.devices, firstSeen),
    errors: weekErrors.reduce(function (n, e) { return n + e.count; }, 0),
    prevErrors: errors.filter(function (e) { return inWeek(e.at, 1); }).reduce(function (n, e) { return n + e.count; }, 0),
    topErrors: Object.keys(top).sort(function (a, b) { return top[b] - top[a]; }).slice(0, 5).map(function (k) { return [k, top[k]]; }),
    feedback: feedback.filter(function (r) { return inWeek(Date.parse(r[0]), 0); }),
    prevFeedback: feedback.filter(function (r) { return inWeek(Date.parse(r[0]), 1); }).length,
    health: health,
    lastHealth: lastHealth,
    selfCheck: tally,
    goals: readSheetRows(GOALS_SHEET_NAME, GOALS_HEADER.length).filter(function (r) { return r[0] && r[1]; }),
  };
}

// Plain-language names for what the app counts (unknown names show as they are).
var USAGE_LABELS = {
  'form-quick-close': 'טופס שנפתח ונסגר תוך 3 שניות בלי שינוי',
  'form-error-name': 'שגיאה בטופס: שם חסר',
  'form-error-price': 'שגיאה בטופס: מחיר לא תקין',
  'form-error-serial': 'שגיאה בטופס: מספר סידורי כפול',
  'draft-restored': 'טיוטות ששוחזרו',
  'draft-discarded': 'טיוטות שנמחקו',
  'leave-unsaved': 'יציאה מטופס בלי שמירה',
  'undo-delete': '"ביטול" אחרי מחיקה',
  'share-cancel': 'חלון שיתוף שנסגר בלי שליחה',
  open: 'פתיחת האפליקציה',
  sync: 'סנכרון',
  upload: 'העלאת תמונה',
  card: 'הכנת כרטיס שיתוף',
  form: 'פתיחת טופס יצירה',
  'new-time': 'יצירה חדשה: מפתיחה עד שמירה',
  pending: 'שינוי שחיכה לשליחה',
  'rage:share': 'כפתור שיתוף', 'rage:zoom': 'זכוכית מגדלת', 'rage:save': 'כפתור שמירה',
  'rage:sync': 'כפתור סנכרון', 'rage:menu': 'תפריט ⚙', 'rage:filters': 'כפתור סינון',
  'rage:new-item': 'כפתור יצירה חדשה', 'rage:view': 'החלפת תצוגה', 'rage:send': 'שליחת שיתוף',
  'rage:card': 'כרטיס יצירה', 'rage:row': 'שורת יצירה', 'rage:other': 'כפתור אחר',
  'dead:header': 'הלוגו בפס העליון', 'dead:results': 'שורת התוצאות', 'dead:form-title': 'כותרת הטופס',
  'dead:share-preview': 'תצוגת הכרטיס בשיתוף', 'dead:other': 'אזור אחר',
};
var HEALTH_LABELS = [
  ['no_photo', 'בלי תמונה'], ['no_price', 'בלי מחיר'], ['no_serial', 'בלי מספר סידורי'],
  ['no_location', 'בלי מיקום'], ['no_name_en', 'בלי שם באנגלית'], ['new_week', 'יצירות חדשות השבוע'],
  ['new_incomplete', 'מתוכן נשמרו חסרות (תמונה / מחיר)'], ['untouched', 'לא עודכנו יותר מ-6 חודשים'],
  ['dup_names', 'יצירות עם שם כפול'], ['dup_serials', 'יצירות עם מספר סידורי כפול (מהעבר)'],
];
var SCREEN_LABELS = { catalog: 'קטלוג', 'form-new': 'יצירה חדשה', 'form-edit': 'עריכת יצירה', share: 'שיתוף' };
function screensLabel(text) {
  return String(text || '').split(' ← ').map(function (n) { return SCREEN_LABELS[n] || n; }).join(' ← ');
}
var KIND_LABELS = { iphone: 'אייפון', ipad: 'אייפד', android: 'אנדרואיד', computer: 'מחשב', other: 'אחר' };

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function label(name) {
  return USAGE_LABELS[name] || name;
}

function seconds(ms) {
  if (ms == null) return '-';
  if (ms >= 60 * 60 * 1000) return (Math.round(ms / 360000) / 10) + ' שעות';
  if (ms >= 60 * 1000) return (Math.round(ms / 6000) / 10) + ' דק\'';
  return (Math.round(ms / 100) / 10) + ' שנ\'';
}

// "12 (שבוע קודם: 8 ▲)"
function compare(now, before) {
  if (now == null) return '-';
  if (before == null) return String(now);
  var arrow = now > before ? ' ▲' : now < before ? ' ▼' : '';
  return now + ' <span style="color:#6E6C64">(שבוע קודם: ' + before + arrow + ')</span>';
}

// A goal's measure (Goals tab, column B): a count name ("form-error-price"),
// "p50:open" / "p90:open" for a time, "health:no_photo", or "errors".
function goalValue(metric, r, usage, health) {
  var m = String(metric).trim();
  if (m === 'errors') return r.errors;
  if (/^health:/.test(m)) return health ? health[m.slice(7)] : null;
  var t = /^p(50|90):(.+)$/.exec(m);
  if (t) {
    var v = percentile(usage.times[t[2]] || [], Number(t[1]));
    return v == null ? null : Math.round(v / 100) / 10;
  }
  return usage.counts[m] || 0;
}

function buildReportHtml(r) {
  var u = r.usage;
  var p = r.prevUsage;
  var c = function (k) { return u.counts[k] || 0; };
  var pc = function (k) { return p.counts[k] || 0; };
  var row = function (cells) { return '<tr>' + cells.map(function (x) { return '<td style="padding:4px 10px;border-bottom:1px solid #D9D6CF">' + x + '</td>'; }).join('') + '</tr>'; };
  var table = function (rows) { return '<table style="border-collapse:collapse;margin:6px 0 14px">' + rows.join('') + '</table>'; };
  var h = function (text) { return '<h3 style="margin:18px 0 4px;font-size:17px">' + text + '</h3>'; };
  var deviceIds = Object.keys(u.devices);
  var out = [];
  out.push('<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#1C1B18;max-width:680px">');
  out.push('<h2 style="margin:0 0 4px">דוח שבועי - קטלוג הגלריה</h2>');
  out.push('<div style="color:#6E6C64">' + r.from + ' עד ' + r.to + ' · בהשוואה לשבוע הקודם</div>');

  out.push(h('בקצרה'));
  out.push(table([
    row(['מכשירים פעילים', compare(deviceIds.length, Object.keys(p.devices).length)]),
    row(['תקלות', compare(r.errors, r.prevErrors)]),
    row(['הצעות מהצוות', compare(r.feedback.length, r.prevFeedback)]),
    row(['בדיקות שרת שעברו', r.selfCheck.ok + ' מתוך ' + (r.selfCheck.ok + r.selfCheck.fail)]),
  ]));

  out.push(h('הצעות ובעיות מהצוות'));
  out.push(r.feedback.length ? '<ul>' + r.feedback.map(function (f) {
    return '<li>' + escapeHtml(f[1]) + ' <span style="color:#6E6C64">- ' + escapeHtml(f[5] || '?') + ', ' + escapeHtml(screensLabel(f[2])) + '</span></li>';
  }).join('') + '</ul>' : '<p>אין השבוע.</p>');

  out.push(h('תקלות'));
  out.push(r.topErrors.length ? table(r.topErrors.map(function (e) {
    return row(['<span dir="ltr">' + escapeHtml(e[0]) + '</span>', e[1]]);
  })) : '<p>אין תקלות השבוע.</p>');

  out.push(h('איפה נתקעו'));
  var frustration = Object.keys(USAGE_LABELS).filter(function (k) {
    return /^(form-quick-close|form-error|draft|leave|undo|share-cancel)/.test(k);
  }).map(function (k) { return row([label(k), compare(c(k), pc(k))]); });
  var taps = Object.keys(u.counts).filter(function (k) { return USAGE_TAP_NAME.test(k); })
    .sort(function (a, b) { return u.counts[b] - u.counts[a]; }).slice(0, 8)
    .map(function (k) { return row([(k.indexOf('rage') === 0 ? 'הקשות חוזרות: ' : 'הקשה על משהו שלא לחיץ: ') + label(k), compare(c(k), pc(k))]); });
  out.push(table(frustration.concat(taps)));

  out.push(h('משפכים'));
  out.push(table([
    row(['יצירה חדשה', 'נפתחה ' + c('new-open') + ' ← נשמרה ' + c('new-saved') + ' · זמן (חציון) ' + seconds(percentile(u.times['new-time'] || [], 50))]),
    row(['שיתוף', 'נפתח ' + c('share-open') + ' ← כרטיס מוכן ' + c('share-ready') + ' ← נשלח ' + c('share-sent') + ' · בוטל ' + c('share-cancel') + ' · נכשל ' + c('share-failed')]),
    row(['חיפוש', 'בוצע ' + c('search') + ' ← בלי תוצאות ' + c('search-empty') + ' · נפתחה יצירה מהתוצאות ' + c('search-open')]),
  ]));

  out.push(h('מהירות (חציון / האיטי מתוך 10)'));
  out.push(table(USAGE_TIMES.filter(function (k) { return k !== 'new-time' && k !== 'pending'; }).map(function (k) {
    var list = u.times[k] || [];
    var prev = p.times[k] || [];
    return row([label(k), seconds(percentile(list, 50)) + ' / ' + seconds(percentile(list, 90)) +
      ' <span style="color:#6E6C64">(שבוע קודם: ' + seconds(percentile(prev, 50)) + ' / ' + seconds(percentile(prev, 90)) + ')</span>']);
  })));

  out.push(h('בריאות הקטלוג'));
  if (r.health) {
    out.push(table(HEALTH_LABELS.map(function (pair) {
      var now = r.health[pair[0]];
      return row([pair[1], now == null ? 'יימדד מהשבוע הבא' : compare(now, r.lastHealth ? r.lastHealth[pair[0]] : null)]);
    })));
    out.push('<p style="color:#6E6C64">רשימת היצירות עצמן - בלשונית Health בגיליון.</p>');
  } else {
    out.push('<p>הסריקה נכשלה השבוע.</p>');
  }

  out.push(h('טכני'));
  var kinds = {};
  deviceIds.forEach(function (id) {
    var d = u.devices[id];
    var key = (KIND_LABELS[d.kind] || d.kind) + (d.installed ? ' (מותקן)' : ' (דפדפן)');
    kinds[key] = (kinds[key] || 0) + 1;
  });
  var versions = {};
  deviceIds.forEach(function (id) { versions[u.devices[id].version] = (versions[u.devices[id].version] || 0) + 1; });
  var pending = u.times.pending || [];
  out.push(table([
    row(['מכשירים', Object.keys(kinds).map(function (k) { return k + ': ' + kinds[k]; }).join(' · ') || '-']),
    row(['גרסאות', Object.keys(versions).sort().reverse().map(function (v) { return '<span dir="ltr">' + escapeHtml(v) + '</span>: ' + versions[v]; }).join(' · ') || '-']),
    row(['לא התעדכנו יותר מ-3 ימים', String(r.behind.behind)]),
    row(['שינויים שחיכו לשליחה (חציון / הכי ארוך)', seconds(percentile(pending, 50)) + ' / ' + seconds(pending.length ? Math.max.apply(null, pending) : null)]),
    row(['פעמים שמכשיר היה מנותק', compare(c('offline'), pc('offline'))]),
    row(['סנכרונים שנכשלו', compare(c('sync-fail'), pc('sync-fail'))]),
  ]));

  if (r.goals.length) {
    out.push(h('מה השתנה אחרי שיפורים שאושרו'));
    out.push(table([row(['<b>שיפור</b>', '<b>מדד</b>', '<b>לפני</b>', '<b>השבוע</b>'])].concat(r.goals.map(function (g) {
      var value = goalValue(g[1], r, u, r.health);
      return row([escapeHtml(g[0]), '<span dir="ltr">' + escapeHtml(g[1]) + '</span>', escapeHtml(g[3]), value == null ? '-' : String(value)]);
    }))));
  }

  out.push('<p style="margin-top:22px;color:#6E6C64">לניתוח ולהצעות שיפור: להעביר את המייל לשיחה ולבקש "תנתח את הדוח של השבוע".' +
    ' שום שינוי לא נכנס בלי אישור.</p></div>');
  return out.join('\n');
}

function sendMail(subject, html) {
  MailApp.sendEmail({ to: REPORT_EMAIL, subject: subject, htmlBody: html, body: html.replace(/<[^>]+>/g, ' ') });
}

// Every Sunday morning (installTriggers), or by hand from this editor.
function weeklyReport() {
  var props = PropertiesService.getScriptProperties();
  var lastHealth = JSON.parse(props.getProperty('LAST_HEALTH') || 'null');
  var health = null;
  try {
    health = catalogHealth();
  } catch (err) {
    // the rest of the report still goes out
  }
  var r = collectReport(Date.now(), health, lastHealth);
  sendMail('דוח שבועי - קטלוג הגלריה (' + r.from + ' עד ' + r.to + ')', buildReportHtml(r));
  if (health) props.setProperty('LAST_HEALTH', JSON.stringify(health));
  props.setProperty('SELF_CHECK_WEEK', '{"ok":0,"fail":0}');
  return 'sent to ' + REPORT_EMAIL;
}

// One-off: run once from this editor (select it next to Run). Sets up the
// hourly self-check and the Sunday-morning report; running it again
// replaces them, never doubles them.
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['selfCheck', 'weeklyReport'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('selfCheck').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(7).create();
  getOrCreateSheet(GOALS_SHEET_NAME, GOALS_HEADER);
  return 'installed: hourly self-check, weekly report on Sunday at 7:00 to ' + REPORT_EMAIL;
}
