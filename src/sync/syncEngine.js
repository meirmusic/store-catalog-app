import { db } from '../db/db.js';
import { getAll, upsertItem, softDeleteItem, addConfigOption, uploadImage } from '../api/client.js';
import { APPS_SCRIPT_URL } from '../api/config.js';

// See SPEC.md "מדיניות כשלים": a change that keeps failing stays queued
// and retried, but after enough failures the UI should show a visible
// "sync problem" indicator rather than failing silently forever.
export const FAILURE_THRESHOLD = 5;

async function pushOne(change) {
  if (change.op === 'upsert') {
    const item = await db.items.get(change.row_id);
    if (item) {
      // The server is authoritative for last_modified_at/last_modified_by
      // (see SPEC.md section 6, conflict resolution) - adopt whatever it
      // echoes back instead of keeping the client's own guessed values.
      // Deliberately narrow: do NOT adopt the rest of the echoed row
      // (image_url in particular) - a brand-new item's upsert always
      // carries image_url: null (the real photo goes out separately as
      // its own 'uploadImage' change - see ItemForm's isNewPhoto split),
      // so blanket-adopting the echo here can stomp a real Drive URL
      // that 'uploadImage' already wrote locally, if this upsert's
      // response lands after it (overlapping sync cycles - REG-011).
      const result = await upsertItem(item);
      if (result) {
        await db.items.put({
          ...item,
          last_modified_at: result.last_modified_at,
          last_modified_by: result.last_modified_by,
        });
      }
    }
  } else if (change.op === 'softDelete') {
    await softDeleteItem(change.row_id);
  } else if (change.op === 'addConfigOption') {
    await addConfigOption(change.payload.list_name, change.payload.value);
  } else if (change.op === 'uploadImage') {
    const result = await uploadImage(change.row_id, change.payload.image);
    if (result && result.image_url) {
      const item = await db.items.get(change.row_id);
      if (item) await db.items.put({ ...item, image_url: result.image_url });
    }
  }
}

export async function pushPending() {
  // No explicit orderBy: Dexie iterates by primary key (insertion order)
  // by default, which keeps an item's 'upsert' change ahead of its
  // 'uploadImage' change even when both are queued in the same tick.
  const pending = await db.pendingChanges.toArray();
  let pushed = 0;
  for (const change of pending) {
    try {
      await pushOne(change);
      await db.pendingChanges.delete(change.id);
      pushed++;
    } catch (err) {
      console.error('[sync] push failed for change', change, err);
      await db.pendingChanges.update(change.id, {
        attempts: (change.attempts || 0) + 1,
        lastError: String(err && err.message ? err.message : err),
      });
    }
  }
  return pushed;
}

export async function pullLatest() {
  const data = await getAll();
  if (!data) return;
  if (Array.isArray(data.items)) {
    await db.items.bulkPut(data.items);
  }
  if (data.config) {
    await db.config.bulkPut(
      Object.entries(data.config).map(([list_name, values]) => ({ list_name, values })),
    );
  }
}

// Push-then-pull, per SPEC.md section 4: local changes go out first so
// they "win" with the server's timestamp before a pull could overwrite
// them with a stale snapshot from a concurrent poll.
export async function syncNow() {
  if (!APPS_SCRIPT_URL) {
    // No backend configured yet - nothing to do but leave the queue as-is.
    return { ok: false, reason: 'not-configured' };
  }
  await pushPending();
  try {
    await pullLatest();
  } catch (err) {
    // SPEC.md section 4: a failed pull keeps showing the last data that
    // did load successfully, with a "not updated since HH:MM" indicator -
    // never a blocking error screen. Local changes already pushed above
    // are not affected either way.
    console.error('[sync] pull failed', err);
    return { ok: false, reason: 'pull-failed' };
  }
  return { ok: true };
}

export async function hasSyncProblem() {
  const stuck = await db.pendingChanges.filter((c) => (c.attempts || 0) >= FAILURE_THRESHOLD).count();
  return stuck > 0;
}
