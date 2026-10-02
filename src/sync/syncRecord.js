import { useSyncExternalStore } from 'react';

// SPEC.md 22.6-22.7: what the app knows about its connection to the server,
// kept on the device (it survives closing the app) - when fresh data last
// arrived, when a change last reached the server, and how the server
// answered the most recent request.
const KEYS = { pull: 'gallery_last_pull_ok', push: 'gallery_last_push_ok', server: 'gallery_server_status', since: 'gallery_tracking_since' };
const listeners = new Set();

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// When this device started keeping these times (SPEC.md 22.7 *): with no
// time recorded, the app says "none since <date>", never a false "never".
function trackingSince() {
  const existing = read(KEYS.since);
  if (existing) return existing;
  const now = new Date().toISOString();
  try {
    localStorage.setItem(KEYS.since, JSON.stringify(now));
  } catch {
    // storage unavailable
  }
  return now;
}

let snapshot = { lastPullAt: read(KEYS.pull), lastPushAt: read(KEYS.push), server: read(KEYS.server), since: trackingSince() };

function write(key, value, field) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable - still shown for this session
  }
  snapshot = { ...snapshot, [field]: value };
  listeners.forEach((fn) => fn());
}

export function recordPullOk() {
  write(KEYS.pull, new Date().toISOString(), 'lastPullAt');
}

export function recordPushOk() {
  write(KEYS.push, new Date().toISOString(), 'lastPushAt');
}

// state: 'ok' (answered), 'error' (answered with an error), 'unreachable'
// (no usable answer: no connection, timeout, an HTTP error).
export function recordServerAnswer(state, message = '') {
  write(KEYS.server, { at: new Date().toISOString(), state, message: String(message).slice(0, 200) }, 'server');
}

export function getSyncRecord() {
  return snapshot;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSyncRecord() {
  return useSyncExternalStore(subscribe, getSyncRecord);
}
