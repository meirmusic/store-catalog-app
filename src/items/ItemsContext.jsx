import { createContext, useContext, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addConfigValue as dbAddConfigValue } from '../db/db.js';
import { requestSync } from '../sync/syncEngine.js';
import { CONFIG_SEED } from '../config/seed.js';
import { useTeamMember } from '../identity/TeamMemberContext.jsx';

const ItemsContext = createContext(null);

function uid() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
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

  const items = useLiveQuery(
    () => db.items.filter((it) => !it.is_deleted).toArray(),
    [],
    [],
  );
  const configRows = useLiveQuery(() => db.config.toArray(), [], []);
  const pendingCount = useLiveQuery(() => db.pendingChanges.count(), [], 0);

  const config = useMemo(() => {
    const out = { location: [], type: [], physical_status: [] };
    (configRows || []).forEach((row) => {
      out[row.list_name] = row.values;
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

  async function softDeleteItem(rowId) {
    await db.transaction('rw', db.items, db.pendingChanges, async () => {
      const existing = await db.items.get(rowId);
      if (!existing) return;
      await db.items.put({
        ...existing,
        is_deleted: true,
        last_modified_by: member,
        last_modified_at: new Date().toISOString(),
      });
      await enqueue(rowId, 'softDelete');
    });
    requestSync();
  }

  async function addConfigValueAndQueue(listName, rawValue) {
    const value = await dbAddConfigValue(listName, rawValue);
    if (value) {
      await enqueue(null, 'addConfigOption', { list_name: listName, value });
      requestSync();
    }
    return value;
  }

  const value = useMemo(
    () => ({
      items: items || [],
      config,
      pendingCount: pendingCount || 0,
      saveItem,
      softDeleteItem,
      addConfigValue: addConfigValueAndQueue,
      queueImageUpload,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, config, pendingCount, member],
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems() {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItems must be used within an ItemsProvider');
  return ctx;
}
