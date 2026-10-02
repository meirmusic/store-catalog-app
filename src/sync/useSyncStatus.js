import { useEffect, useState, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { syncNow, hasSyncProblem, onSyncRequested } from './syncEngine.js';
import { useToast } from '../toast/ToastContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { reportError } from '../errors/errorReporting.js';
import { useSyncRecord } from './syncRecord.js';

const POLL_MS = 45000; // SPEC.md section 4: auto-refresh every 30-60s
// SPEC.md section 9 (REG-030): a cycle with no progress for longer than the
// longest allowed step - a 2-minute photo upload plus its one quick retry -
// is stuck, and a new sync request replaces it instead of waiting forever.
const STUCK_MS = 5 * 60 * 1000;

function stuckAfterMs() {
  // Test-only override (tests/integration/request-timeout.spec.js).
  return (typeof window !== 'undefined' && window.__testStuckSyncMs) || STUCK_MS;
}

export function useSyncStatus() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [syncProblem, setSyncProblem] = useState(false);
  const [stale, setStale] = useState(false);
  const [staleError, setStaleError] = useState(null); // { code, details } of the last failed pull
  const [authExpired, setAuthExpired] = useState(false);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);
  const cycleRef = useRef(0); // id of the current cycle; a replaced cycle sees it change
  const progressAtRef = useRef(0); // when the current cycle last finished a step
  const tRef = useRef(t);
  tRef.current = t;

  const pendingCount = useLiveQuery(() => db.pendingChanges.count(), [], 0);

  // Never two cycles at once (SPEC.md section 9): overlapping cycles would
  // push the same queued change twice. A request that arrives mid-cycle -
  // e.g. a save while a poll is running - runs one more cycle right after,
  // so the new change still goes out immediately rather than next poll.
  const runSync = useCallback(async () => {
    if (!navigator.onLine) return;
    // SPEC.md 22.8א: nothing while the app isn't on screen - coming back
    // starts a cycle right away (the visibilitychange listener below).
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (inFlightRef.current) {
      if (Date.now() - progressAtRef.current < stuckAfterMs()) {
        rerunRef.current = true;
        return;
      }
      // Stuck: start over. The old cycle stops before its next step, and
      // whatever it still reports is ignored.
    }
    const cycle = ++cycleRef.current;
    const isCurrent = () => cycleRef.current === cycle;
    const markProgress = () => { if (isCurrent()) progressAtRef.current = Date.now(); };
    inFlightRef.current = true;
    markProgress();
    setSyncing(true);
    try {
      do {
        rerunRef.current = false;
        const result = await syncNow({
          shouldStop: () => !isCurrent(),
          onProgress: markProgress,
          onPushed: () => showToast(tRef.current('sync.synced'), { background: true }),
        });
        if (!isCurrent()) return;
        if (result.reason === 'auth') {
          setAuthExpired(true);
          break; // every further attempt would be rejected too, until the user signs in again
        }
        setAuthExpired(false);
        if (result.ok) {
          setStale(false);
          setStaleError(null);
        } else if (result.reason === 'pull-failed') {
          setStale(true);
          setStaleError(result.pullError || null);
        }
      } while (rerunRef.current && navigator.onLine);
    } catch (err) {
      // SPEC.md 18.6: e.g. the device's storage failing. Logged (repeats
      // counted), never a new error message every 45 seconds.
      reportError('sync', err);
    } finally {
      if (isCurrent()) {
        inFlightRef.current = false;
        setSyncing(false);
        setSyncProblem(await hasSyncProblem().catch(() => false));
      }
    }
  }, [showToast]);

  useEffect(() => onSyncRequested(runSync), [runSync]);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); runSync(); };
    const onOffline = () => setIsOnline(false);
    // SPEC.md section 9: back in the app (screen unlocked, switched back
    // from another app) - catch up right away instead of within 45s.
    const onVisible = () => { if (document.visibilityState === 'visible') runSync(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [runSync]);

  useEffect(() => {
    runSync();
    const id = setInterval(runSync, POLL_MS);
    return () => clearInterval(id);
  }, [runSync]);

  // SPEC.md 22.6: when fresh data last arrived - kept on the device.
  const { lastPullAt } = useSyncRecord();
  const lastSyncedAt = lastPullAt ? new Date(lastPullAt) : null;

  return {
    isOnline,
    syncing,
    lastSyncedAt,
    pendingCount: pendingCount || 0,
    syncProblem,
    stale,
    staleError,
    authExpired,
    refresh: runSync,
  };
}
