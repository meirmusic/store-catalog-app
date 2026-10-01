import { db } from '../db/db.js';
import { getAll, upsertItem, softDeleteItem, addConfigOption, uploadImage, logErrors, AuthError, TimeoutError } from '../api/client.js';
import { reportError, flushErrorLog } from '../errors/errorReporting.js';
import { APPS_SCRIPT_URL } from '../api/config.js';

// See SPEC.md "מדיניות כשלים": a change that keeps failing stays queued
// and retried, but after enough failures the UI should show a visible
// "sync problem" indicator rather than failing silently forever.
export const FAILURE_THRESHOLD = 5;

// A single quick in-cycle retry for a transient failure (REG-014, a real
// user report) - Apps Script's own response mechanism (a redirect to a
// temporary script.googleusercontent.com URL) occasionally 404s even
// though the request already succeeded server-side. Without this, the
// user's only recourse was waiting out the full ~45s poll interval (or
// manually refreshing) to find out the next attempt was fine all along.
// One short retry turns most of these into an invisible blip. Every
// operation this wraps (getAll, and every pushOne op) is safe to retry
// immediately - upsert/softDelete/addConfigOption are naturally
// idempotent, and uploadImage's retries no longer pile up duplicate
// Drive files either (see Code.gs's trashPreviousDriveFile).
const QUICK_RETRY_DELAY_MS = 600;

async function withQuickRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthError) throw err; // retrying can't fix a rejected sign-in
    // Another full wait right away rarely helps (REG-030) - the next cycle retries.
    if (err instanceof TimeoutError) throw err;
    await new Promise((resolve) => setTimeout(resolve, QUICK_RETRY_DELAY_MS));
    return fn();
  }
}

async function pushOne(change) {
  if (change.op === 'upsert') {
    const item = await db.items.get(change.row_id);
    if (item) {
      // pending_image is local-only (a photo waiting for its own
      // 'uploadImage') - never ship it with the row.
      const { pending_image: _localOnly, ...toSend } = item;
      const result = await upsertItem(toSend);
      if (result) {
        // The server is authoritative for last_modified_at/last_modified_by
        // (SPEC.md section 6) - adopt exactly those, nothing else: a new
        // item's upsert echoes image_url empty, which must not stomp a
        // Drive URL 'uploadImage' already wrote (REG-011). A field-level
        // update, not a put of the copy read above, so anything written
        // to the item meanwhile (e.g. a just-queued pending_image) stays.
        await db.items.update(change.row_id, {
          last_modified_at: result.last_modified_at,
          last_modified_by: result.last_modified_by,
        });
      }
    }
  } else if (change.op === 'softDelete') {
    await softDeleteItem(change.row_id, change.payload?.last_modified_by);
  } else if (change.op === 'addConfigOption') {
    await addConfigOption(change.payload.list_name, change.payload.value);
  } else if (change.op === 'uploadImage') {
    const result = await uploadImage(change.row_id, change.payload.image);
    if (result && result.image_url) {
      await db.transaction('rw', db.items, async () => {
        const item = await db.items.get(change.row_id);
        if (!item) return;
        const updates = { image_url: result.image_url };
        // Stop showing it as pending - unless a newer photo was picked
        // meanwhile, which stays pending until its own upload lands.
        if (item.pending_image === change.payload.image) updates.pending_image = undefined;
        await db.items.update(change.row_id, updates);
      });
    }
  }
}

// `shouldStop`: a cycle that was declared stuck and replaced by a new one
// stops before its next change (SPEC.md section 9). `onProgress` marks each
// change finished, success or failure - how a stuck cycle is told apart
// from a long but healthy one.
export async function pushPending({ shouldStop = () => false, onProgress = () => {} } = {}) {
  // No explicit orderBy: Dexie iterates by primary key (insertion order)
  // by default, which keeps an item's 'upsert' change ahead of its
  // 'uploadImage' change even when both are queued in the same tick.
  const pending = await db.pendingChanges.toArray();
  let pushed = 0;
  for (const change of pending) {
    if (shouldStop()) break;
    try {
      // The list above is a snapshot: a change can be cancelled while this
      // cycle runs (e.g. removing a photo cancels its queued upload), so
      // check it's still queued right before each attempt, retry included -
      // otherwise the cancelled upload would still go out and bring the
      // removed photo back.
      const sent = await withQuickRetry(async () => {
        if (!(await db.pendingChanges.get(change.id))) return false;
        await pushOne(change);
        return true;
      });
      if (!sent) continue;
      await db.pendingChanges.delete(change.id);
      pushed++;
    } catch (err) {
      // A rejected sign-in isn't this change's fault, and every other
      // change would be rejected too - stop here, leave the queue exactly
      // as it is (no attempt counted, so it never trips the "sync problem"
      // indicator for the wrong reason), and let syncNow report it.
      if (err instanceof AuthError) throw err;
      // SPEC.md section 17: logged (repeats counted, not re-logged); a
      // failure while simply offline isn't a malfunction, so not logged.
      reportError(`sync-push:${change.op}`, err, { log: navigator.onLine });
      await db.pendingChanges.update(change.id, {
        attempts: (change.attempts || 0) + 1,
        lastError: String(err && err.message ? err.message : err),
      });
    } finally {
      onProgress();
    }
  }
  return pushed;
}

// Google Sheets stores an all-digit SKU or serial number (3022, 112345) as a
// number, so getAll returns it as one - but the app treats these fields as
// text (REG-028: trimming a numeric SKU made every save of such an item
// fail). Normalize text fields at the boundary, as the data arrives.
const TEXT_FIELDS = ['name', 'size', 'sku', 'serial_number', 'type', 'location', 'physical_status', 'notes', 'image_url', 'last_modified_by'];

export function normalizeItem(item) {
  const out = { ...item };
  TEXT_FIELDS.forEach((field) => {
    if (out[field] != null && typeof out[field] !== 'string') out[field] = String(out[field]);
  });
  return out;
}

export async function pullLatest() {
  const data = await getAll();
  if (!data) return;
  if (Array.isArray(data.items)) {
    data.items = data.items.map(normalizeItem);
    // REG-017: never overwrite an item that still has a queued change -
    // if its push just failed, the server's copy is the older version,
    // and adopting it would make the next push send that older version
    // back, silently losing the user's edit.
    await db.transaction('rw', db.items, db.pendingChanges, async () => {
      const pendingRowIds = new Set((await db.pendingChanges.toArray()).map((c) => c.row_id));
      await db.items.bulkPut(data.items.filter((it) => !pendingRowIds.has(it.row_id)));
      // SPEC.md section 11: the server stops returning an item once it's
      // deleted anywhere, so an item it no longer returns was deleted on
      // another device - remove it here too (it used to stay forever).
      // Items with queued changes are kept (e.g. a new item not sent yet).
      // An entirely empty answer while this device has items is treated as
      // a server problem, not a wiped catalog, and removes nothing.
      const localIds = await db.items.toCollection().primaryKeys();
      if (data.items.length === 0 && localIds.length > 0) return;
      const serverIds = new Set(data.items.map((it) => it.row_id));
      const gone = localIds.filter((id) => !serverIds.has(id) && !pendingRowIds.has(id));
      if (gone.length) await db.items.bulkDelete(gone);
    });
  }
  if (data.config) {
    // A value added on this device whose addConfigOption hasn't reached the
    // server yet must survive the pull (SPEC.md section 13) - otherwise it
    // vanished from the list until the send finally succeeded.
    await db.transaction('rw', db.config, db.pendingChanges, async () => {
      const pendingValues = (await db.pendingChanges.toArray())
        .filter((c) => c.op === 'addConfigOption' && c.payload)
        .map((c) => c.payload);
      const merged = { ...data.config };
      pendingValues.forEach(({ list_name, value }) => {
        const list = merged[list_name] || [];
        if (!list.some((v) => String(v).toLowerCase() === String(value).toLowerCase())) {
          merged[list_name] = [...list, value];
        }
      });
      await db.config.bulkPut(Object.entries(merged).map(([list_name, values]) => ({ list_name, values })));
    });
  }
}

// SPEC.md section 9: a local write kicks off a sync right away instead of
// waiting up to a full poll interval. Deferred with setTimeout so the
// listener never runs inside the caller's Dexie transaction zone.
const syncRequestListeners = new Set();

export function requestSync() {
  setTimeout(() => syncRequestListeners.forEach((fn) => fn()), 0);
}

export function onSyncRequested(fn) {
  syncRequestListeners.add(fn);
  return () => syncRequestListeners.delete(fn);
}

// Push-then-pull, per SPEC.md section 4: local changes go out first so
// they "win" with the server's timestamp before a pull could overwrite
// them with a stale snapshot from a concurrent poll.
export async function syncNow({ shouldStop = () => false, onProgress = () => {} } = {}) {
  if (!APPS_SCRIPT_URL) {
    // No backend configured yet - nothing to do but leave the queue as-is.
    return { ok: false, reason: 'not-configured', pushed: 0 };
  }
  let pushed;
  try {
    pushed = await pushPending({ shouldStop, onProgress });
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, reason: 'auth', pushed: 0 };
    throw err;
  }
  if (shouldStop()) return { ok: false, reason: 'superseded', pushed };
  await flushErrorLog(logErrors);
  onProgress();
  if (shouldStop()) return { ok: false, reason: 'superseded', pushed };
  try {
    await withQuickRetry(() => pullLatest());
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, reason: 'auth', pushed };
    // SPEC.md section 4: a failed pull keeps showing the last data that
    // did load successfully, with a "not updated since HH:MM" indicator -
    // never a blocking error screen. Local changes already pushed above
    // are not affected either way.
    // The "not updated since" chip shows this reason when tapped (SPEC 17).
    const pullError = reportError('sync-pull', err, { log: navigator.onLine });
    return { ok: false, reason: 'pull-failed', pushed, pullError };
  }
  return { ok: true, pushed };
}

// What the red "sync problem" chip explains when clicked (SPEC.md
// section 9): a readable name per stuck change, deduplicated (an item's
// upsert and its photo upload are one thing to the user).
export async function getStuckChangeLabels() {
  const stuck = await db.pendingChanges.filter((c) => (c.attempts || 0) >= FAILURE_THRESHOLD).toArray();
  const labels = [];
  for (const change of stuck) {
    const label = change.op === 'addConfigOption'
      ? change.payload?.value
      : (await db.items.get(change.row_id))?.name;
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

export async function hasSyncProblem() {
  const stuck = await db.pendingChanges.filter((c) => (c.attempts || 0) >= FAILURE_THRESHOLD).count();
  return stuck > 0;
}
