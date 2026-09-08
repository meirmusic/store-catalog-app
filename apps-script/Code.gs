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
  var contentType = match[1];
  var base64 = match[2];
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, contentType, payload.row_id + '.jpg');

  var folder = getOrCreateImageFolder();
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var imageUrl = driveThumbnailUrl(file.getId());

  var sheet = getItemsSheet();
  var rowIndex = findRowIndexByRowId(sheet, payload.row_id);
  if (rowIndex !== -1) {
    var imageUrlCol = ITEM_COLUMNS.indexOf('image_url') + 1;
    sheet.getRange(rowIndex, imageUrlCol).setValue(imageUrl);
  }
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
  var changed = 0;
  for (var i = 0; i < values.length; i++) {
    var url = values[i][0];
    if (typeof url !== 'string') continue;
    var match = /drive\.google\.com\/uc\?export=view&id=([^&]+)/.exec(url);
    if (match) {
      values[i][0] = driveThumbnailUrl(match[1]);
      changed++;
    }
  }
  if (changed) range.setValues(values);
  return 'fixed ' + changed + ' of ' + values.length + ' rows';
}
