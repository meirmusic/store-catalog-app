import { createContext, useContext, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addConfigValue as dbAddConfigValue } from '../db/db.js';
import { CONFIG_SEED } from '../config/seed.js';
import { useIdentity } from '../identity/IdentityContext.jsx';

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
  const { user } = useIdentity();

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

  async function saveItem(fields, existingRowId) {
    const row_id = existingRowId || uid();
    const now = new Date().toISOString();
    const existing = existingRowId ? await db.items.get(existingRowId) : null;
    const item = {
      ...(existing || { row_id, is_deleted: false }),
      ...fields,
      row_id,
      last_modified_by: user,
      last_modified_at: now,
    };
    await db.items.put(item);
    await enqueue(row_id, 'upsert');
    return row_id;
  }

  // A freshly-captured photo is a data: URL living only on this device -
  // it's queued as its own change so the sync engine can upload it to
  // Drive (see api/client.js uploadImage) and get back a real, small,
  // shareable URL instead of shipping the raw image bytes through the
  // Sheet's image_url column.
  async function queueImageUpload(row_id, dataUrl) {
    await enqueue(row_id, 'uploadImage', { image: dataUrl });
  }

  async function softDeleteItem(rowId) {
    const existing = await db.items.get(rowId);
    if (!existing) return;
    await db.items.put({
      ...existing,
      is_deleted: true,
      last_modified_by: user,
      last_modified_at: new Date().toISOString(),
    });
    await enqueue(rowId, 'softDelete');
  }

  async function addConfigValueAndQueue(listName, rawValue) {
    const value = await dbAddConfigValue(listName, rawValue);
    if (value) await enqueue(null, 'addConfigOption', { list_name: listName, value });
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
    [items, config, pendingCount, user],
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems() {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItems must be used within an ItemsProvider');
  return ctx;
}
