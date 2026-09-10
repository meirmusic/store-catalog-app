/**
 * Gallery Catalog - Apps Script backend
 *
 * How to install (see SPEC.md tasks #1-#3):
 * 1. Open the Google Sheet, then Extensions > Apps Script.
 * 2. Delete whatever is in the default Code.gs and paste this whole file in.
 * 3. Change SHARED_SECRET below to any random string of your own.
 * 4. Deploy > New deployment > type "Web app" > Execute as "Me",
 *    Who has access "Anyone" > Deploy. Copy the Web App URL.
 * 5. Put that URL (and the same secret) into the app's environment as
 *    VITE_APPS_SCRIPT_URL and VITE_SHARED_SECRET.
 *
 * Whenever you edit this file afterwards, you must create a new
 * deployment VERSION of the *same* deployment (Deploy > Manage
 * deployments > edit > new version) - not a brand new deployment,
 * or the URL will change.
 *
 * TESTING: this file can't run outside Google's servers, so its pure logic
 * (no SpreadsheetApp/DriveApp calls) is mirrored in apps-script/logic.js
 * and unit-tested there - see TEST_PLAN.md section 3. If you change
 * findRowIndexByRowId, driveThumbnailUrl, the config dedup check, or
 * rowToItem here, update the matching function in logic.js too.
 */

// Not real security - just a deterrent against casual/automated access
// to the URL, since it's necessarily visible in the app's client code.
// See SPEC.md "הגנה קלה על ה-URL".
var SHARED_SECRET = 'CHANGE_ME_TO_SOME_RANDOM_STRING';

var ITEMS_SHEET_NAME = 'Items';
var CONFIG_SHEET_NAME = 'Config';
var DRIVE_FOLDER_NAME = 'Gallery Catalog Images';

var ITEM_COLUMNS = [
  'row_id', 'serial_number', 'sku', 'name', 'size', 'type', 'location',
  'physical_status', 'availability_status', 'price', 'notes', 'image_url',
  'is_deleted', 'last_modified_by', 'last_modified_at',
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SHARED_SECRET) {
      return jsonResponse({ error: 'forbidden' });
    }
    var result;
    switch (body.action) {
      case 'getAll':
        result = handleGetAll();
        break;
      case 'upsert':
        result = handleUpsert(body.payload);
        break;
      case 'softDelete':
        result = handleSoftDelete(body.payload);
        break;
      case 'addConfigOption':
        result = handleAddConfigOption(body.payload);
        break;
      case 'uploadImage':
        result = handleUploadImage(body.payload);
        break;
      default:
        return jsonResponse({ error: 'unknown action: ' + body.action });
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getItemsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ITEMS_SHEET_NAME);
}

function getConfigSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET_NAME);
}

function rowToItem(headerRow, row) {
  var item = {};
  headerRow.forEach(function (key, i) {
    var value = row[i];
    if (key === 'is_deleted') {
      value = value === true || value === 'TRUE' || value === 'true';
    }
    item[key] = value === '' || value === undefined ? null : value;
  });
  return item;
}

function handleGetAll() {
  var sheet = getItemsSheet();
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

  return { items: items, config: config };
}

function findRowIndexByRowId(sheet, rowId) {
  if (sheet.getLastRow() < 2) return -1; // only the header row exists so far
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === rowId) return i + 2; // 1-indexed, +1 for header row
  }
  return -1;
}

function handleUpsert(payload) {
  var sheet = getItemsSheet();
  var now = new Date().toISOString();
  var item = {};
  ITEM_COLUMNS.forEach(function (key) { item[key] = payload[key] != null ? payload[key] : ''; });
  item.row_id = payload.row_id;
  item.last_modified_at = now;
  item.last_modified_by = payload.last_modified_by || '';
  item.is_deleted = !!payload.is_deleted;

  var rowValues = ITEM_COLUMNS.map(function (key) { return item[key]; });
  var rowIndex = findRowIndexByRowId(sheet, item.row_id);
  if (rowIndex === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(rowIndex, 1, 1, ITEM_COLUMNS.length).setValues([rowValues]);
  }
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
  var exists = values.some(function (row) {
    return row[0] === payload.list_name &&
      String(row[1]).toLowerCase() === String(payload.value).toLowerCase();
  });
  if (!exists) {
    sheet.appendRow([payload.list_name, payload.value]);
  }
  return { ok: true };
}

function getOrCreateImageFolder() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
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

  var folder = getOrCreateImageFolder();
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var imageUrl = driveThumbnailUrl(file.getId());

  var imageUrlCol = ITEM_COLUMNS.indexOf('image_url') + 1;
  sheet.getRange(rowIndex, imageUrlCol).setValue(imageUrl);
  return { image_url: imageUrl };
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
    var match = /drive\.google\.com\/uc\?export=view&id=([^&]+)/.exec(url);
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
