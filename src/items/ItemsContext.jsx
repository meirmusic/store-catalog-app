import { createContext, useContext, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addConfigValue as dbAddConfigValue } from '../db/db.js';
import { requestSync } from '../sync/syncEngine.js';
import { CONFIG_SEED, TEAM_NAMES } from '../config/seed.js';
import { useTeamMember } from '../identity/TeamMemberContext.jsx';

const ItemsContext = createContext(null);

// SPEC.md 18.5 (REG-034): always starts with a letter - an all-digit id
// (or one like 3E4567) would turn into a number in the Sheet and stop
// matching its own row. Not E, which reads as an exponent.
const ID_FIRST = 'ABCDFGHJKLMNPQRSTUVWXYZ';
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function uid() {
  let code = ID_FIRST[Math.floor(Math.random() * ID_FIRST.length)];
  for (let i = 1; i < 6; i++) code += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return code;
}

async function ensureConfigSeeded() {
  const count = await db.config.count();
  if (count === 0) {
    await db.config.bulkPut(
      Object.entries(CONFIG_SEED).map(([list_name, values]) => ({ list_name, values })),
    );
  }
}

export function ItemsProvider({ children }) {
  const { member } = useTeamMember();

  useEffect(() => {
    ensureConfigSeeded();
  }, []);

  // null until the first read from the device finishes - so the list can
  // say "loading", never "no items" / "0" (SPEC.md 22.2).
  const loadedItems = useLiveQuery(
    () => db.items.filter((it) => !it.is_deleted).toArray(),
    [],
    null,
  );
  const itemsLoaded = loadedItems !== null;
  const items = useMemo(() => loadedItems || [], [loadedItems]);
  const configRows = useLiveQuery(() => db.config.toArray(), [], []);
  const pendingCount = useLiveQuery(() => db.pendingChanges.count(), [], 0);

  // SPEC.md sections 13/15: every list sorted A-Z; the team list is the
  // built-in names plus any added in "manage lists" (add-only, like the rest).
  const config = useMemo(() => {
    const out = { location: [], type: [], physical_status: [], team: [] };
    (configRows || []).forEach((row) => {
      out[row.list_name] = row.values || [];
    });
    out.team = [...new Set([...TEAM_NAMES, ...out.team])];
    Object.keys(out).forEach((list) => {
      out[list] = [...out[list]].sort((a, b) => String(a).localeCompare(String(b), 'he'));
    });
    return out;
  }, [configRows]);

  async function enqueue(row_id, op, payload) {
    await db.pendingChanges.add({ row_id, op, payload: payload ?? null, createdAt: Date.now(), attempts: 0 });
  }

  async function saveItem(fields, existingRowId, { discardPendingPhoto = false } = {}) {
    const row_id = existingRowId || uid();
    const now = new Date().toISOString();
    // One transaction so a concurrent pull (which skips items with queued
    // changes - REG-017) can never land between the item write and its
    // queue entry.
    await db.transaction('rw', db.items, db.pendingChanges, async () => {
      const existing = existingRowId ? await db.items.get(existingRowId) : null;
      const next = {
        ...(existing || { row_id, is_deleted: false }),
        ...fields,
        row_id,
        last_modified_by: member,
        last_modified_at: now,
      };
      if (discardPendingPhoto) {
        delete next.pending_image;
        await db.pendingChanges.where('row_id').equals(row_id).and((c) => c.op === 'uploadImage').delete();
      }
      await db.items.put(next);
      await enqueue(row_id, 'upsert');
    });
    requestSync();
    return row_id;
  }

  // A freshly-captured photo is a data: URL living only on this device -
  // it's queued as its own change so the sync engine can upload it to
  // Drive (see api/client.js uploadImage) and get back a real, small,
  // shareable URL instead of shipping the raw image bytes through the
  // Sheet's image_url column.
  // Until the upload succeeds, the photo is also kept on the item as a
  // local-only `pending_image` so the card and form show it right away
  // (SPEC.md section 10). Never sent with the item - see syncEngine pushOne.
  async function queueImageUpload(row_id, dataUrl) {
    await db.transaction('rw', db.items, db.pendingChanges, async () => {
      await enqueue(row_id, 'uploadImage', { image: dataUrl });
      await db.items.update(row_id, { pending_image: dataUrl });
    });
    requestSync();
  }

  // Returns what "undo" needs (SPEC.md 18.3/18.4): the item exactly as it
  // was at the moment of deleting, and a photo still waiting to upload.
  async function softDeleteItem(rowId) {
    let undo = null;
    await db.transaction('rw', db.items, db.pendingChanges, async () => {
      const existing = await db.items.get(rowId);
      if (!existing) return;
      const queuedPhotos = await db.pendingChanges.where('row_id').equals(rowId).and((c) => c.op === 'uploadImage').toArray();
      undo = { snapshot: existing, pendingPhoto: queuedPhotos.length ? queuedPhotos[queuedPhotos.length - 1].payload?.image : null };
      const { pending_image: _cancelled, ...rest } = existing;
      await db.items.put({
        ...rest,
        is_deleted: true,
        last_modified_by: member,
        last_modified_at: new Date().toISOString(),
      });
      // No point uploading a photo for an item that's gone (SPEC.md 11).
      await db.pendingChanges.where('row_id').equals(rowId).and((c) => c.op === 'uploadImage').delete();
      // Who deleted travels with the change, so the Sheet records it.
      await enqueue(rowId, 'softDelete', { last_modified_by: member });
    });
    requestSync();
    return undo;
  }

  // Undo of a delete (SPEC.md section 11): works whether or not the delete
  // already reached the server - a queued delete is dropped, and a save of
  // the item (is_deleted: false) brings it back on the server either way.
  // `undo` is what softDeleteItem returned: the item comes back exactly as
  // it was when deleted, and a photo that hadn't uploaded yet is queued again.
  async function restoreItem({ snapshot, pendingPhoto }) {
    await db.transaction('rw', db.items, db.pendingChanges, async () => {
      await db.pendingChanges.where('row_id').equals(snapshot.row_id).and((c) => c.op === 'softDelete').delete();
      const { pending_image: _stale, ...rest } = snapshot;
      await db.items.put({
        ...rest,
        ...(pendingPhoto ? { pending_image: pendingPhoto } : {}),
        is_deleted: false,
        last_modified_by: member,
        last_modified_at: new Date().toISOString(),
      });
      await enqueue(snapshot.row_id, 'upsert');
      if (pendingPhoto) await enqueue(snapshot.row_id, 'uploadImage', { image: pendingPhoto });
    });
    requestSync();
  }

  // Returns { value, added } or null for empty input - see db.addConfigValue.
  async function addConfigValueAndQueue(listName, rawValue) {
    const result = await dbAddConfigValue(listName, rawValue);
    if (result?.added) {
      await enqueue(null, 'addConfigOption', { list_name: listName, value: result.value });
      requestSync();
    }
    return result;
  }

  const value = useMemo(
    () => ({
      items: items || [],
      config,
      pendingCount: pendingCount || 0,
      saveItem,
      itemsLoaded,
      softDeleteItem,
      restoreItem,
      addConfigValue: addConfigValueAndQueue,
      queueImageUpload,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, itemsLoaded, config, pendingCount, member],
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems() {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItems must be used within an ItemsProvider');
  return ctx;
}
