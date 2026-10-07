import { useSyncExternalStore } from 'react';

// SPEC.md 27.3: what the server behind the app can store, as it says in each
// getAll answer. A field the server doesn't keep yet (an older Apps Script
// deployment) stays hidden - typing into it would be lost on the next sync.
const KEY = 'gallery_server_features';
const listeners = new Set();

function read() {
  try {
    return localStorage.getItem(KEY) || '[]';
  } catch {
    return '[]';
  }
}

export function setServerFeatures(features) {
  const next = JSON.stringify(Array.isArray(features) ? [...features].sort() : []);
  if (next === read()) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // storage blocked - the field just stays hidden
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useServerFeature(name) {
  const json = useSyncExternalStore(subscribe, read);
  try {
    return JSON.parse(json).includes(name);
  } catch {
    return false;
  }
}
