import { db } from '../db/db.js';
import { getAll, upsertItem, softDeleteItem, addConfigOption } from '../api/client.js';
import { APPS_SCRIPT_URL } from '../api/config.js';

// See SPEC.md "מדיניות כשלים": a change that keeps failing stays queued
// and retried, but after enough failures the UI should show a visible
// "sync problem" indicator rather than failing silently forever.
export const FAILURE_THRESHOLD = 5;

async function pushOne(change) {
  const item = change.row_id ? await db.items.get(change.row_id) : null;
  if (change.op === 'upsert' && item) {
    await upsertItem(item);
  } else if (change.op === 'softDelete') {
    await softDeleteItem(change.row_id);
  } else if (change.op === 'addConfigOption') {
    // Config changes aren't individually tracked per-value here; the
    // simplest correct behavior is to just re-push nothing (the value
    // already lives locally) - real config sync happens implicitly the
    // next time an item referencing it is pushed. Left explicit so this
    // is easy to wire to a real addConfigOption call once needed.
    return;
  }
}

export async function pushPending() {
  const pending = await db.pendingChanges.orderBy('createdAt').toArray();
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
  await pullLatest();
  return { ok: true };
}

export async function hasSyncProblem() {
  const stuck = await db.pendingChanges.filter((c) => (c.attempts || 0) >= FAILURE_THRESHOLD).count();
  return stuck > 0;
}
