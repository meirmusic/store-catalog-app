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

// SPEC.md 33.2: asked outside React (the sync engine) - e.g. "can this
// server take only the changed fields?". An older server: no.
export function hasServerFeature(name) {
  try {
    return JSON.parse(read()).includes(name);
  } catch {
    return false;
  }
}

// SPEC.md 33.10: the version the server says it runs ('' - an older server
// that doesn't say), and the newest one this app knows of.
const VERSION_KEY = 'gallery_server_version';
// eslint-disable-next-line no-undef
export const LATEST_SERVER_VERSION = typeof __SERVER_VERSION__ !== 'undefined' ? __SERVER_VERSION__ : '';

function readVersion() {
  try {
    return localStorage.getItem(VERSION_KEY);
  } catch {
    return null;
  }
}

export function setServerVersion(version) {
  const next = typeof version === 'string' ? version : '';
  if (next === readVersion()) return;
  try {
    localStorage.setItem(VERSION_KEY, next);
  } catch {
    // storage blocked - shown as unknown
  }
  listeners.forEach((fn) => fn());
}

// null - not known yet (no answer from the server since this was added)
export function useServerVersion() {
  return useSyncExternalStore(subscribe, readVersion);
}
