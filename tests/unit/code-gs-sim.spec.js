// The real apps-script/Code.gs, run against an in-memory imitation of
// Google's services (Sheet, Drive, Properties, Lock, Content). Code.gs can't
// run outside Google, and it's deployed by hand - this checks the whole file
// end to end before each deployment (SPEC.md 27.3 / 28.1). TEST_PLAN TC-GS-*.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const SOURCE = fs.readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8');
const OLD_HEADER = ['row_id', 'serial_number', 'sku', 'name', 'size', 'type', 'location', 'physical_status', 'availability_status', 'price', 'notes', 'image_url', 'is_deleted', 'last_modified_by', 'last_modified_at'];

function makeSheet(rows, maxColumns) {
  const data = rows.map((r) => [...r]);
  const sheet = {
    maxColumns: maxColumns ?? Math.max(...rows.map((r) => r.length)),
    cell(r, c) { return (data[r - 1] || [])[c - 1] ?? ''; },
    put(r, c, v) {
      if (c > sheet.maxColumns) throw new Error('Range out of bounds');
      while (data.length < r) data.push([]);
      data[r - 1][c - 1] = v;
    },
    getMaxColumns: () => sheet.maxColumns,
    insertColumnsAfter: (after, n) => { sheet.maxColumns += n; },
    getLastRow: () => data.length,
    getRange(r, c, nr = 1, nc = 1) {
      if (c + nc - 1 > sheet.maxColumns) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sheet.cell(r + i, c + j))),
        getValue: () => sheet.cell(r, c),
        setValues: (vals) => vals.forEach((row, i) => row.forEach((v, j) => sheet.put(r + i, c + j, v))),
        setValue: (v) => sheet.put(r, c, v),
      };
    },
    getDataRange() {
      const width = Math.max(...data.map((r) => r.length));
      return { getValues: () => data.map((row) => Array.from({ length: width }, (_, j) => row[j] ?? '')) };
    },
    appendRow(row) {
      if (row.length > sheet.maxColumns) sheet.maxColumns = row.length; // Google widens the sheet
      data.push([...row]);
    },
    data,
  };
  return sheet;
}

function google({ itemsHeader = OLD_HEADER, maxColumns, files = {} } = {}) {
  const items = makeSheet([itemsHeader, ['R1', '112345', 'SKU-1', 'זריחה', '91X132', 'מקורי', 'גלריה', '', 'available', 2500, '', 'https://drive.google.com/thumbnail?id=FILE1&sz=w1000', false, 'דב', 'then']], maxColumns);
  const config = makeSheet([['list_name', 'value'], ['type', 'מקורי']]);
  const props = {};
  const sandbox = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => ({ Items: items, Config: config }[n] || null), insertSheet: () => makeSheet([[]]) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b + 256) % 256)).toString('base64'),
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
    },
    DriveApp: {
      getFileById: (id) => {
        if (!files[id]) throw new Error('No item with the given ID could be found');
        return { getBlob: () => ({ getBytes: () => files[id], getContentType: () => 'image/jpeg' }), setTrashed() {} };
      },
    },
    MailApp: { sendEmail() {}, getRemainingDailyQuota: () => 100 },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  props.LOGIN_PASSWORD_HASH = sandbox.hashPassword('secret-pass');
  const call = (action, payload, auth = { email: 'office@yossibittonart.com', password: 'secret-pass' }) =>
    JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action, auth, payload }) } }).text);
  return { call, items };
}

test.describe('Code.gs in a simulated Google', () => {
  test('TC-GS-001: a Sheet with exactly 15 columns - getAll works, column P "name_en" is added by itself, the app is told it can store it', () => {
    const g = google({ maxColumns: 15 });
    const res = g.call('getAll');
    expect(res.error).toBeUndefined();
    expect(res.items).toHaveLength(1);
    expect(res.items[0].row_id).toBe('R1');
    expect(res.features).toEqual(['name_en']);
    expect(g.items.data[0][15]).toBe('name_en');
  });

  test('TC-GS-002: the English name is saved; a save from an older app version (no name_en) keeps it', () => {
    const g = google({ maxColumns: 15 });
    g.call('getAll');
    expect(g.call('upsert', { row_id: 'R1', name: 'זריחה', name_en: 'Sunrise', last_modified_by: 'שרה' }).name_en).toBe('Sunrise');
    expect(g.items.data[1][15]).toBe('Sunrise');
    g.call('upsert', { row_id: 'R1', name: 'זריחה 2', notes: 'x', last_modified_by: 'דב' });
    expect(g.items.data[1][15]).toBe('Sunrise');
    expect(g.items.data[1][3]).toBe('זריחה 2');
    expect(g.call('getAll').items[0].name_en).toBe('Sunrise');
  });

  test('TC-GS-003: a new artwork is added as a full row', () => {
    const g = google();
    g.call('upsert', { row_id: 'NEW1', name: 'חדשה', name_en: null, price: 900, is_deleted: false, last_modified_by: 'שרה' });
    const row = g.items.data.find((r) => r[0] === 'NEW1');
    expect(row).toHaveLength(16);
    expect(row[3]).toBe('חדשה');
    expect(row[14]).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  test('TC-GS-004: column P already holds someone else\'s column - not written over, and the app is not offered the field', () => {
    const g = google({ itemsHeader: [...OLD_HEADER, 'הערות שלי'] });
    expect(g.call('getAll').features).toEqual([]);
    g.items.data[1][15] = 'לא לגעת';
    g.call('upsert', { row_id: 'R1', name: 'זריחה', name_en: 'Sunrise' });
    expect(g.items.data[1][15]).toBe('לא לגעת');
    expect(g.items.data[0][15]).toBe('הערות שלי');
  });

  test('TC-GS-005: getImage sends the photo file; a missing file or row is a clear error, not a crash', () => {
    const g = google({ files: { FILE1: [1, 2, 3, -1] } });
    const res = g.call('getImage', { row_id: 'R1' });
    expect(res).toEqual({ mime: 'image/jpeg', data: Buffer.from([1, 2, 3, 255]).toString('base64') });
    expect(g.call('getImage', { row_id: 'NOPE' }).error).toBe('row not found');
    expect(google().call('getImage', { row_id: 'R1' }).error).toMatch(/No item with the given ID/);
  });

  test('TC-GS-006: every action the app uses is known; no sign-in - forbidden; everything answers JSON', () => {
    const g = google({ files: { FILE1: [1] } });
    for (const [action, payload] of [['getAll'], ['upsert', { row_id: 'R1', name: 'x' }], ['softDelete', { row_id: 'R1' }], ['addConfigOption', { list_name: 'type', value: 'הדפס' }], ['getImage', { row_id: 'R1' }], ['logErrors', { entries: [] }]]) {
      expect(String(g.call(action, payload).error || ''), action).not.toMatch(/unknown action/);
    }
    expect(g.call('requestPasswordReset', { email: 'someone@else' })).toEqual({ ok: true });
    expect(g.call('getAll', null, { email: 'office@yossibittonart.com', password: 'wrong' })).toEqual({ error: 'forbidden' });
    expect(g.call('noSuchAction').error).toBe('unknown action: noSuchAction');
  });
});
