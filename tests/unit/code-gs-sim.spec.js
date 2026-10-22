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
    clearContents: () => { data.length = 0; },
    setFrozenRows() {},
    appendRow(row) {
      if (row.length > sheet.maxColumns) sheet.maxColumns = row.length; // Google widens the sheet
      data.push([...row]);
    },
    data,
  };
  return sheet;
}

function google({ itemsHeader = OLD_HEADER, maxColumns, files = {}, itemRows, driveFails = false } = {}) {
  const firstRow = ['R1', '112345', 'SKU-1', 'זריחה', '91X132', 'מקורי', 'גלריה', '', 'available', 2500, '', 'https://drive.google.com/thumbnail?id=FILE1&sz=w1000', false, 'דב', 'then'];
  const items = makeSheet([itemsHeader, ...(itemRows || [firstRow])], maxColumns);
  const config = makeSheet([['list_name', 'value'], ['type', 'מקורי']]);
  const sheets = { Items: items, Config: config };
  const props = {};
  const cache = {};
  const mails = [];
  const triggers = [];
  const spreadsheet = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = makeSheet([], 30); return sheets[n]; },
  };
  const sandbox = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = String(v); }, remove: (k) => { delete cache[k]; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b + 256) % 256)).toString('base64'),
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
      getUuid: () => crypto.randomUUID(),
      formatDate: (date, tz) => date.toLocaleDateString('en-CA', { timeZone: tz }),
    },
    DriveApp: {
      getFileById: (id) => {
        if (!files[id]) throw new Error('No item with the given ID could be found');
        return { getBlob: () => ({ getBytes: () => files[id], getContentType: () => 'image/jpeg' }), setTrashed() {} };
      },
      getFoldersByName: () => {
        if (driveFails) throw new Error('Drive is not available');
        return { hasNext: () => true, next: () => ({ getName: () => 'Gallery Catalog Images' }) };
      },
    },
    MailApp: { sendEmail(msg) { mails.push(msg); }, getRemainingDailyQuota: () => 100 },
    ScriptApp: {
      WeekDay: { SUNDAY: 'SUNDAY' },
      getProjectTriggers: () => [...triggers],
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => {
        const t = { fn, getHandlerFunction: () => fn };
        const b = { timeBased: () => b, everyHours: (n) => { t.hours = n; return b; }, onWeekDay: (d) => { t.day = d; return b; }, atHour: (h) => { t.hour = h; return b; }, create: () => { triggers.push(t); return t; } };
        return b;
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  props.LOGIN_PASSWORD_HASH = sandbox.hashPassword('secret-pass');
  const call = (action, payload, auth = { email: 'office@yossibittonart.com', password: 'secret-pass' }) =>
    JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action, auth, payload }) } }).text);
  return { call, items, sheets, props, mails, triggers, cache, run: (fn) => sandbox[fn](), gs: sandbox };
}

test.describe('Code.gs in a simulated Google', () => {
  test('TC-GS-001: a Sheet with exactly 15 columns - getAll works, column P "name_en" is added by itself, the app is told it can store it', () => {
    const g = google({ maxColumns: 15 });
    const res = g.call('getAll');
    expect(res.error).toBeUndefined();
    expect(res.items).toHaveLength(1);
    expect(res.items[0].row_id).toBe('R1');
    expect(res.features).toContain('name_en');
    expect(res.features).toEqual(expect.arrayContaining(['partial_save', 'device_key', 'serial_check'])); // SPEC.md 33
    expect(res.server_version).toMatch(/^\d{4}-\d\d-\d\d$/);
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
    expect(g.call('getAll').features).not.toContain('name_en');
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
    for (const [action, payload] of [['getAll'], ['upsert', { row_id: 'R1', name: 'x' }], ['softDelete', { row_id: 'R1' }], ['addConfigOption', { list_name: 'type', value: 'הדפס' }], ['getImage', { row_id: 'R1' }], ['logErrors', { entries: [] }], ['logUsage', { days: [] }], ['sendFeedback', { entries: [] }], ['issueDeviceKey', { kind: 'iphone', member: 'שרה' }]]) {
      expect(String(g.call(action, payload).error || ''), action).not.toMatch(/unknown action/);
    }
    expect(g.call('requestPasswordReset', { email: 'someone@else' })).toEqual({ ok: true });
    expect(g.call('getAll', null, { email: 'office@yossibittonart.com', password: 'wrong' })).toEqual({ error: 'forbidden' });
    expect(g.call('noSuchAction').error).toBe('unknown action: noSuchAction');
  });

  // ---- SPEC.md 29: the improvement loop ----
  const DAY = 24 * 60 * 60 * 1000;
  const usageDay = (g, daysAgo, extra = {}) => ({
    day: g.gs.dayString(Date.now() - daysAgo * DAY), device_id: 'dev123abc', kind: 'iphone', installed: true, version: '2026-10-13-abc1234',
    counts: { 'share-open': 2, 'share-sent': 1 }, times: { open: [1200, 900] }, ...extra,
  });

  test('TC-GS-101: logUsage - a row per device and day in a Usage tab it creates; only the known names, only numbers', () => {
    const g = google();
    const res = g.call('logUsage', { days: [usageDay(g, 1, {
      counts: { 'share-open': 3, 'rage:share': 2, 'זריחה': 5, 'SKU-1': 1, 'rage:זריחה': 1, 'form-error-price': -4 },
      times: { open: [1234, 'x', 99999999, 800], card: [2000], pending: [2 * DAY], 'זריחה': [1] },
    }), { day: 'not a day', device_id: 'dev123abc' }, { ...usageDay(g, 1), device_id: 'זריחה 2500' }] });
    expect(res).toEqual({ ok: true, logged: 1 });
    const tab = g.sheets.Usage;
    expect(tab.data[0][0]).toBe('יום');
    expect(tab.data).toHaveLength(2);
    const [day, device, kind, installed, version, json] = tab.data[1];
    expect([day, device, kind, installed, version]).toEqual([g.gs.dayString(Date.now() - DAY), 'dev123abc', 'iphone', 'כן', '2026-10-13-abc1234']);
    expect(JSON.parse(json)).toEqual({ c: { 'share-open': 3, 'rage:share': 2 }, t: { open: [1200, 800], card: [2000], pending: [2 * DAY] } }); // a long wait is kept
    expect(JSON.stringify(tab.data)).not.toMatch(/זריחה|SKU|2500/);
  });

  test('TC-GS-102: sendFeedback - saved with the sender\'s name, the screens and the version; sent twice - kept once; never a formula', () => {
    const g = google();
    const entry = { id: 'fb1', text: 'הכפתור של השיתוף קטן מדי', screens: ['catalog', 'share'], version: 'v9', kind: 'android', member: 'שרה' };
    expect(g.call('sendFeedback', { entries: [entry, { id: 'fb2', text: '=HYPERLINK("x")', member: 'דב' }, { id: 'fb3', text: '   ' }] })).toEqual({ ok: true, saved: 2 });
    expect(g.call('sendFeedback', { entries: [entry] })).toEqual({ ok: true, saved: 0 });
    const tab = g.sheets.Feedback;
    expect(tab.data).toHaveLength(3);
    expect(tab.data[1].slice(1)).toEqual(['הכפתור של השיתוף קטן מדי', 'catalog ← share', 'v9', 'android', 'שרה', '', 'fb1']);
    expect(tab.data[2][1]).toBe("'=HYPERLINK(\"x\")");
  });

  test('TC-GS-103: catalog health - what\'s missing, duplicates, untouched, and (from the second scan) new this week; the list in a Health tab', () => {
    const old = new Date(Date.now() - 200 * DAY).toISOString();
    const now = new Date().toISOString();
    const row = (id, serial, name, location, price, image, at) => [id, serial, '', name, '', '', location, '', 'available', price, '', image, false, '', at];
    const g = google({ itemRows: [
      row('A', '1', 'זריחה', 'גלריה', 100, 'img', now),
      row('B', '1', 'זריחה', '', '', '', old),
      row('C', '', 'שקיעה', 'גלריה', 300, 'img', now),
      [...row('D', '9', 'נמחקה', '', '', '', old).slice(0, 12), true, '', old],
    ] });
    const first = g.run('catalogHealth');
    expect(first).toMatchObject({ total: 3, no_photo: 1, no_price: 1, no_serial: 1, no_location: 1, no_name_en: 3, untouched: 1, dup_names: 2, dup_serials: 2, new_week: null });
    const health = g.sheets.Health.data;
    expect(health[0]).toEqual(['בעיה', 'מספר סידורי', 'שם', 'row_id', 'נבדק']);
    expect(health.filter((r) => r[3] === 'B').map((r) => r[0])).toEqual(['בלי תמונה', 'בלי מחיר', 'בלי מיקום', 'לא עודכנה יותר מ-6 חודשים', 'שם כפול', 'מספר סידורי כפול']);
    expect(health.some((r) => r[3] === 'D')).toBe(false); // deleted - not counted
    g.items.data.push(row('E', '5', 'חדשה', 'גלריה', '', 'img', now));
    const second = g.run('catalogHealth');
    expect(second).toMatchObject({ total: 4, new_week: 1, new_incomplete: 1 });
    expect(g.sheets.Health.data.filter((r) => r[0] === 'בלי מחיר').length).toBe(2); // rewritten, not added to
  });

  test('TC-GS-104: hourly self-check - quiet when fine; an email at once when Drive fails, not again for the same failure; an email when errors jump x3', () => {
    const ok = google();
    expect(ok.run('selfCheck')).toBe('ok');
    expect(ok.mails).toHaveLength(0);
    const g = google({ driveFails: true });
    expect(g.run('selfCheck')).toMatch(/^failed: דרייב/);
    expect(g.mails).toHaveLength(1);
    expect(g.mails[0].subject).toMatch(/השרת לא עובד/);
    expect(g.mails[0].to).toBe('office@yossibittonart.com');
    g.run('selfCheck');
    expect(g.mails).toHaveLength(1);
    expect(JSON.parse(g.props.SELF_CHECK_WEEK)).toEqual({ ok: 0, fail: 2 });

    const spike = google();
    spike.call('logErrors', { entries: [{ code: 'E-1', action: 'sync-push:upsert', message: 'x', count: 2 }] });
    spike.sheets.ErrorLog.data[1][0] = new Date(Date.now() - 3 * DAY).toISOString(); // the usual: 2 in a week
    spike.call('logErrors', { entries: [{ code: 'E-2', action: 'share', message: 'y', count: 6 }] });
    spike.run('selfCheck');
    expect(spike.mails.map((m) => m.subject)).toEqual(['⚠️ קטלוג הגלריה: קפיצה בתקלות']);
    spike.run('selfCheck');
    expect(spike.mails).toHaveLength(1); // once a day at most
  });

  test('TC-GS-105: the weekly report - this week against the last, from every source, by email; nothing about artworks except the health numbers', () => {
    const g = google();
    g.call('logUsage', { days: [
      usageDay(g, 1, { counts: { 'share-open': 5, 'share-sent': 3, 'form-error-price': 4, 'rage:share': 2, 'new-open': 2, 'new-saved': 1 }, times: { open: [1000, 2000, 3000], 'new-time': [60000] } }),
      usageDay(g, 2, { device_id: 'other999', kind: 'computer', installed: false, version: '2026-10-01-old0000', counts: {}, times: {} }),
      usageDay(g, 9, { counts: { 'form-error-price': 1 } }),
    ] });
    g.call('logUsage', { days: [usageDay(g, 1, { counts: { 'share-open': 5, 'share-sent': 3, 'form-error-price': 4, 'rage:share': 2, 'new-open': 2, 'new-saved': 1 }, times: { open: [1000, 2000, 3000], 'new-time': [60000] } })] }); // sent again
    g.call('logErrors', { entries: [{ code: 'E-AB', action: 'share', message: 'card failed', count: 3 }] });
    g.call('sendFeedback', { entries: [{ id: 'f1', text: 'חסר מיון לפי גודל', screens: ['catalog'], member: 'שרה', kind: 'iphone' }] });
    g.run('installTriggers');
    g.sheets.Goals.appendRow(['הודעת מחיר ברורה', 'form-error-price', '2026-10-01', '9', '']);
    g.run('selfCheck');
    expect(g.run('weeklyReport')).toBe('sent to office@yossibittonart.com');
    expect(g.mails).toHaveLength(1);
    const { subject, htmlBody, to } = g.mails[0];
    expect(to).toBe('office@yossibittonart.com');
    expect(subject).toMatch(/^דוח שבועי - קטלוג הגלריה/);
    expect(htmlBody).toContain('dir="rtl"');
    expect(htmlBody).toMatch(/מכשירים פעילים<\/td><td[^>]*>2 /);
    expect(htmlBody).toMatch(/תקלות<\/td><td[^>]*>3 /);
    expect(htmlBody).toContain('חסר מיון לפי גודל');
    expect(htmlBody).toContain('שרה');
    expect(htmlBody).toContain('- שרה, קטלוג</span>'); // the screen in plain words
    expect(htmlBody).toMatch(/מחיר לא תקין<\/td><td[^>]*>4 .*שבוע קודם: 1 ▲/);
    expect(htmlBody).toContain('הקשות חוזרות: כפתור שיתוף');
    expect(htmlBody).toContain('נפתח 5 ← כרטיס מוכן 0 ← נשלח 3');
    expect(htmlBody).toContain('נפתחה 2 ← נשמרה 1 · זמן (חציון) 1 דק\'');
    expect(htmlBody).toContain('פתיחת האפליקציה</td><td style="padding:4px 10px;border-bottom:1px solid #D9D6CF">2 שנ\'');
    expect(htmlBody).toContain('בדיקות שרת שעברו</td><td style="padding:4px 10px;border-bottom:1px solid #D9D6CF">1 מתוך 1');
    expect(htmlBody).toMatch(/הודעת מחיר ברורה.*form-error-price.*9<\/td><td[^>]*>4<\/td>/);
    expect(htmlBody).toMatch(/לא התעדכנו יותר מ-3 ימים<\/td><td[^>]*>1</);
    expect(htmlBody).not.toContain('זריחה'); // no artwork name - the Health tab holds the list
    expect(JSON.parse(g.props.SELF_CHECK_WEEK)).toEqual({ ok: 0, fail: 0 });
    expect(JSON.parse(g.props.LAST_HEALTH).total).toBe(1);
  });

  test('TC-GS-106: installTriggers - an hourly check and a Sunday 7:00 report; running it again replaces, never doubles', () => {
    const g = google();
    g.run('installTriggers');
    g.run('installTriggers');
    expect(g.triggers.map((t) => [t.fn, t.hours, t.day, t.hour])).toEqual([['selfCheck', 1, undefined, undefined], ['weeklyReport', undefined, 'SUNDAY', 7]]);
    expect(g.sheets.Goals.data[0]).toEqual(['שיפור שאושר', 'מדד', 'מתאריך', 'ערך לפני', 'הערות']);
  });

  // ---- SPEC.md 33: the server package (docs/ddd/002-server-package.md) ----
  const PW = { email: 'office@yossibittonart.com', password: 'secret-pass' };

  test('TC-GS-201: only the fields sent are written - two people editing different fields both keep their change', () => {
    const g = google();
    g.call('upsert', { row_id: 'R1', price: 3600, last_modified_by: 'שרה' });
    g.call('upsert', { row_id: 'R1', notes: 'נבדק במחסן', last_modified_by: 'דב' });
    const r = g.call('getAll').items[0];
    expect([r.name, r.serial_number, r.price, r.notes, r.last_modified_by]).toEqual(['זריחה', '112345', 3600, 'נבדק במחסן', 'דב']);
  });

  test('TC-GS-202: an artwork deleted meanwhile is not brought back by a save from an old form; "undo" (restore) does bring it back', () => {
    const g = google();
    g.call('softDelete', { row_id: 'R1', last_modified_by: 'שרה' });
    const res = g.call('upsert', { row_id: 'R1', notes: 'מטופס ישן', last_modified_by: 'דב' });
    expect(res).toEqual({ deleted: true, row_id: 'R1', name: 'זריחה', deleted_by: 'שרה' });
    expect(g.call('getAll').items).toHaveLength(0);
    expect(g.items.data[1][10]).toBe(''); // the old form's note was not written
    g.call('upsert', { row_id: 'R1', restore: true, name: 'זריחה', last_modified_by: 'שרה' });
    expect(g.call('getAll').items.map((i) => i.row_id)).toEqual(['R1']);
  });

  test('TC-GS-203: a serial number already taken - everything else is saved, the number is not, and the app is told whose it is', () => {
    const g = google();
    const res = g.call('upsert', { row_id: 'N1', name: 'חדשה', serial_number: ' 112345 ', price: 900, last_modified_by: 'דב' });
    expect(res.serial_taken).toEqual({ value: '112345', owner_name: 'זריחה', owner_row_id: 'R1' });
    expect(res.serial_number).toBe('');
    const saved = g.call('getAll').items.find((i) => i.row_id === 'N1');
    expect([saved.name, saved.price, saved.serial_number]).toEqual(['חדשה', 900, null]);
    // changing an existing artwork's number to a taken one keeps its own number
    g.call('upsert', { row_id: 'N1', serial_number: '777', last_modified_by: 'דב' });
    expect(g.call('upsert', { row_id: 'N1', serial_number: '112345', notes: 'x', last_modified_by: 'דב' }).serial_number).toBe('777');
    // an unchanged number is not checked (old duplicates from before 27.1 still save)
    g.items.data.push(['D2', '112345', '', 'כפולה ישנה', '', '', '', '', 'available', '', '', '', false, '', 'then', '']);
    expect(g.call('upsert', { row_id: 'D2', serial_number: '112345', notes: 'y', last_modified_by: 'דב' }).serial_taken).toBeUndefined();
    // a deleted artwork's number is free
    g.call('softDelete', { row_id: 'R1' });
    g.call('softDelete', { row_id: 'D2' });
    expect(g.call('upsert', { row_id: 'N2', name: 'עוד', serial_number: '112345' }).serial_taken).toBeUndefined();
  });

  test('TC-GS-204: a key for each phone - issued only with the password, works instead of it, listed in a Devices tab with the staff member; "בוטל" cancels that phone alone', () => {
    const g = google();
    expect(g.call('issueDeviceKey', { kind: 'iphone', member: 'שרה' }, { email: PW.email, device_key: 'x' }).error).toBe('forbidden');
    const { device_key: k1 } = g.call('issueDeviceKey', { kind: 'iphone', member: 'שרה' });
    const { device_key: k2 } = g.call('issueDeviceKey', { kind: 'android', member: 'דב' });
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    const byKey = (k, member) => g.call('getAll', null, { email: PW.email, device_key: k, member });
    expect(byKey(k1, 'שרה').items).toHaveLength(1);
    expect(byKey('wrong', 'שרה')).toEqual({ error: 'forbidden' });
    const tab = g.sheets.Devices.data;
    expect(tab[0]).toEqual(['טביעת המפתח (לא לשנות)', 'מכשיר', 'נוצר', 'נראה לאחרונה', 'איש צוות אחרון', 'בוטל']);
    expect(tab.slice(1).map((r) => [r[1], r[4], r[5]])).toEqual([['אייפון', 'שרה', ''], ['אנדרואיד', 'דב', '']]);
    expect(JSON.stringify(tab)).not.toContain(k1); // only a fingerprint is kept
    // another staff member on the same phone - shown as the last one
    Object.keys(g.cache).forEach((k) => delete g.cache[k]);
    byKey(k1, 'פיגי');
    expect(g.sheets.Devices.data[1][4]).toBe('פיגי');
    // Meir cancels the iPhone: it alone stops (once the 5-minute memory passes)
    g.sheets.Devices.data[1][5] = 'כן';
    Object.keys(g.cache).forEach((k) => delete g.cache[k]);
    expect(byKey(k1, 'שרה')).toEqual({ error: 'forbidden' });
    expect(byKey(k2, 'דב').items).toHaveLength(1);
  });

  test('TC-GS-205: changing the office password cancels every phone key at once; a code is cancelled after 5 wrong tries', () => {
    const g = google();
    const { device_key: k } = g.call('issueDeviceKey', { kind: 'iphone', member: 'שרה' });
    expect(g.call('getAll', null, { email: PW.email, device_key: k }).items).toHaveLength(1);
    g.call('requestPasswordReset', { email: PW.email });
    const code = g.props.PW_RESET_CODE;
    expect(g.call('resetPassword', { email: PW.email, code, newPassword: 'new-password-1' })).toEqual({ ok: true });
    expect(g.call('getAll', null, { email: PW.email, device_key: k })).toEqual({ error: 'forbidden' }); // at once, despite the memory
    expect(g.sheets.Devices.data[1][5]).toBe('כן - הוחלפה סיסמה');
    // 5 wrong codes - the code is gone, even the right one no longer works
    g.props.PW_RESET_LAST_SENT = '0';
    g.call('requestPasswordReset', { email: PW.email });
    const good = g.props.PW_RESET_CODE;
    for (let i = 0; i < 4; i++) expect(g.call('resetPassword', { email: PW.email, code: '000000', newPassword: 'whatever-123' }).error).toBe('invalid code');
    expect(g.call('resetPassword', { email: PW.email, code: '000000', newPassword: 'whatever-123' }).error).toBe('too many attempts');
    expect(g.call('resetPassword', { email: PW.email, code: good, newPassword: 'whatever-123' }).error).toBe('invalid code');
    // a new code starts the count again
    g.props.PW_RESET_LAST_SENT = '0';
    g.call('requestPasswordReset', { email: PW.email });
    expect(g.call('resetPassword', { email: PW.email, code: g.props.PW_RESET_CODE, newPassword: 'fresh-pass-99' })).toEqual({ ok: true });
  });

  test('TC-GS-206: many wrong passwords - one email, no lock-out (the team still gets in)', () => {
    const g = google();
    for (let i = 0; i < 25; i++) g.call('getAll', null, { email: PW.email, password: `wrong-${i}` });
    expect(g.mails.map((m) => m.subject)).toEqual(['⚠️ קטלוג הגלריה: הרבה ניסיונות כניסה שגויים']);
    expect(g.call('getAll').items).toHaveLength(1);
  });

  test('TC-GS-207: the weekly report says which server version runs, and whether the app already expects a newer one', () => {
    const g = google();
    const day = g.gs.dayString(Date.now() - DAY);
    g.call('logUsage', { days: [{ day, device_id: 'dev123abc', kind: 'iphone', version: 'v', counts: {}, times: {}, server_expected: '2099-01-01' }] });
    g.run('weeklyReport');
    expect(g.mails[0].htmlBody).toMatch(/גרסת השרת \(Apps Script\).*2026-\d\d-\d\d.*מצפה לעדכון מ-<span dir="ltr">2099-01-01/);
  });
});

