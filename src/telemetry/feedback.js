// SPEC.md 29.8: "💡 a suggestion or problem" - written by a team member and
// sent under their name (the only thing in section 29 kept with a name: the
// person chose to send it). Without internet it waits here and goes out
// with a later sync, like the error log.
import { APP_VERSION } from '../errors/errorReporting.js';
import { deviceKind, recentScreens } from './usage.js';

const QUEUE_KEY = 'gallery_feedback_queue';
export const FEEDBACK_MAX_LENGTH = 1000;
const RETRY_AFTER_MS = 10 * 60 * 1000;

function loadQueue() {
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveQueue(list) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-20)));
}

export function pendingFeedbackCount() {
  return loadQueue().length;
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Kept on the device first (throws only if even that fails), then sent.
// Resolves to 'sent' or 'queued' - the second with the reason it wasn't sent.
export async function submitFeedback(text, member, send) {
  const entry = {
    id: newId(),
    text: String(text).trim().slice(0, FEEDBACK_MAX_LENGTH),
    screens: recentScreens(),
    version: APP_VERSION,
    kind: deviceKind(),
    member: member || '',
    at: new Date().toISOString(),
  };
  saveQueue([...loadQueue(), entry]);
  try {
    await send([entry]);
  } catch (error) {
    return { result: 'queued', error };
  }
  saveQueue(loadQueue().filter((e) => e.id !== entry.id));
  return { result: 'sent' };
}

// What's still waiting, sent with a sync. Silent; never rejects.
let flushing = false;
let retryAt = 0;
export async function flushFeedback(send) {
  if (flushing || Date.now() < retryAt) return;
  const queue = loadQueue();
  if (!queue.length) return;
  flushing = true;
  try {
    await send(queue);
    const sent = new Set(queue.map((e) => e.id));
    saveQueue(loadQueue().filter((e) => !sent.has(e.id)));
    retryAt = 0;
  } catch {
    const backoff = typeof window !== 'undefined' && window.__testUsageRetryMs != null ? window.__testUsageRetryMs : RETRY_AFTER_MS;
    retryAt = Date.now() + backoff;
  } finally {
    flushing = false;
  }
}
