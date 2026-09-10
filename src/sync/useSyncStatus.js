import { useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { syncNow, hasSyncProblem } from './syncEngine.js';

const POLL_MS = 45000; // SPEC.md section 4: auto-refresh every 30-60s

export function useSyncStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncProblem, setSyncProblem] = useState(false);
  const [stale, setStale] = useState(false);

  const pendingCount = useLiveQuery(() => db.pendingChanges.count(), [], 0);

  const runSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const result = await syncNow();
      if (result.ok) {
        setLastSyncedAt(new Date());
        setStale(false);
      } else if (result.reason === 'pull-failed') {
        setStale(true);
      }
    } finally {
      setSyncing(false);
      setSyncProblem(await hasSyncProblem());
    }
  }, []);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); runSync(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [runSync]);

  useEffect(() => {
    runSync();
    const id = setInterval(runSync, POLL_MS);
    return () => clearInterval(id);
  }, [runSync]);

  return {
    isOnline,
    syncing,
    lastSyncedAt,
    pendingCount: pendingCount || 0,
    syncProblem,
    stale,
    refresh: runSync,
  };
}
