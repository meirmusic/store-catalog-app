// SPEC.md 29: how the app is used, counted on this device and sent once a
// day as one summary per day (like the error log, never per action).
// Privacy (29.2): only the fixed names below and times in milliseconds -
// never an artwork's name, price, SKU, serial number, notes, a photo or
// anything typed; not per team member (a random device code, nothing else).
// Plain module, no React: the sync engine uses it too.
import { APP_VERSION } from '../errors/errorReporting.js';
import { currentDevice } from '../settings/deviceInfo.js';
import { LATEST_SERVER_VERSION } from '../sync/serverFeatures.js';

// Keep in step with USAGE_COUNTS / USAGE_TIMES in apps-script/Code.gs
// (TC-USE-010 compares them) - the server drops anything else too.
export const USAGE_COUNTS = [
  'form-open', 'form-quick-close', 'form-error-name', 'form-error-price', 'form-error-serial',
  'draft-restored', 'draft-discarded', 'leave-unsaved', 'undo-delete',
  'new-open', 'new-saved',
  'share-open', 'share-ready', 'share-sent', 'share-cancel', 'share-failed',
  'search', 'search-empty', 'search-open',
  'offline', 'sync-ok', 'sync-fail',
];
export const USAGE_TIMES = ['open', 'sync', 'upload', 'card', 'form', 'new-time', 'pending'];
const TAP_NAME = /^(rage|dead):[a-z0-9-]{1,30}$/;

const STORE_KEY = 'gallery_usage';
const DEVICE_KEY = 'gallery_usage_device';
const MAX_SAMPLES = 100; // per time, per day
const MAX_DAYS = 14; // a device offline for long keeps two weeks at most
const RETRY_AFTER_MS = 10 * 60 * 1000;

function today() {
  if (typeof window !== 'undefined' && window.__testUsageDay) return window.__testUsageDay;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function save(data) {
  try {
    const days = Object.keys(data).sort();
    days.slice(0, Math.max(0, days.length - MAX_DAYS)).forEach((d) => delete data[d]);
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable - counting is never worth an error
  }
}

function todayEntry(data) {
  const day = today();
  if (!data[day]) data[day] = { counts: {}, times: {} };
  return data[day];
}

export function countUsage(name) {
  if (!USAGE_COUNTS.includes(name) && !TAP_NAME.test(name)) return;
  const data = load();
  const entry = todayEntry(data);
  entry.counts[name] = (entry.counts[name] || 0) + 1;
  save(data);
}

export function timeUsage(name, ms) {
  if (!USAGE_TIMES.includes(name) || !(ms >= 0)) return;
  const data = load();
  const entry = todayEntry(data);
  const list = entry.times[name] || (entry.times[name] = []);
  const value = Math.round(ms);
  if (list.length < MAX_SAMPLES) list.push(value);
  else list[Math.floor(Math.random() * MAX_SAMPLES)] = value; // keeps a fair sample of a busy day
  save(data);
}

// Something that takes a while, measured from start to end (e.g. the share
// window opening until its card is ready). Ending one that wasn't started
// records nothing.
const started = new Map();
export function startTimer(name) {
  started.set(name, performance.now());
}
export function endTimer(name) {
  if (!started.has(name)) return;
  timeUsage(name, performance.now() - started.get(name));
  started.delete(name);
}
export function cancelTimer(name) {
  started.delete(name);
}

// "Opening the app until the catalog shows" - once per load, and not when
// the sign-in screen came first (that time is typing, not waiting).
let openMeasured = false;
export function markSignInShown() {
  openMeasured = true;
}
export function markCatalogShown() {
  if (openMeasured) return;
  openMeasured = true;
  timeUsage('open', performance.now());
}

// The screens seen last - sent with a suggestion (SPEC.md 29.8), fixed names only.
const screens = [];
export function noteScreen(name) {
  if (screens[screens.length - 1] === name) return;
  screens.push(name);
  if (screens.length > 4) screens.shift();
}
export function recentScreens() {
  return [...screens];
}

function randomCode() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// A random code for this device - not linked to anyone - so devices can be
// counted (how many on each version).
export function deviceCode() {
  try {
    let code = localStorage.getItem(DEVICE_KEY);
    if (!/^[a-z0-9]{6,16}$/.test(code || '')) {
      code = randomCode();
      localStorage.setItem(DEVICE_KEY, code);
    }
    return code;
  } catch {
    return 'unknown000';
  }
}

export function deviceKind(device = currentDevice()) {
  if (device.device === 'iPhone' || device.device === 'iPod') return 'iphone';
  if (device.device === 'iPad') return 'ipad';
  if (/^Android/.test(device.device)) return 'android';
  if (device.device === 'Computer' || device.device === 'Mac') return 'computer';
  return 'other';
}

// What's waiting to be sent, for tests and "info & support".
export function getUsageData() {
  return load();
}

// Sends every finished day (today is still being counted) - so at most one
// send a day. A failure is silent and retried no sooner than 10 minutes
// (like flushErrorLog); nothing is lost meanwhile. Never rejects.
let flushing = false;
let retryAt = 0;
export async function flushUsage(send) {
  if (flushing || Date.now() < retryAt) return;
  const data = load();
  const days = Object.keys(data).filter((d) => d < today()).sort();
  if (!days.length) return;
  flushing = true;
  try {
    const device = currentDevice();
    await send(days.map((day) => ({
      day,
      device_id: deviceCode(),
      kind: deviceKind(device),
      installed: device.installed,
      version: APP_VERSION,
      server_expected: LATEST_SERVER_VERSION, // SPEC.md 33.10: the weekly report says if the server is behind
      counts: data[day].counts || {},
      times: data[day].times || {},
    })));
    const after = load();
    days.forEach((d) => delete after[d]);
    save(after);
    retryAt = 0;
  } catch {
    const backoff = typeof window !== 'undefined' && window.__testUsageRetryMs != null ? window.__testUsageRetryMs : RETRY_AFTER_MS;
    retryAt = Date.now() + backoff;
  } finally {
    flushing = false;
  }
}

// Taps (SPEC.md 29.4). Every element worth naming carries data-usage="name"
// (a fixed name, never its text); areas that look tappable but aren't carry
// data-dead="name".
// - 3 taps or more within a second on the same element: one "rage" tap.
// - a tap on a data-dead area, not on anything clickable inside it: one "dead" tap.
// Counted on pointerup, not click: a disabled button (e.g. "share" while the
// card is still being made) gets no click, and tapping it again and again is
// exactly the frustration to see. A touch that becomes a scroll ends in
// pointercancel, so scrolling is not counted.
const INTERACTIVE = 'button, a, input, select, textarea, label, summary, [role="button"], [role="menuitem"], [data-usage]';
const RAGE_TAPS = 3;
const RAGE_WINDOW_MS = 1000;
let lastTarget = null;
let tapTimes = [];
let rageCounted = false;

function onTap(e) {
  if (e.button > 0) return; // not a right-click
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const interactive = target.closest(INTERACTIVE);
  if (!interactive) {
    const dead = target.closest('[data-dead]');
    if (dead) countUsage(`dead:${dead.getAttribute('data-dead')}`);
    return;
  }
  const now = e.timeStamp || performance.now();
  if (interactive !== lastTarget) {
    lastTarget = interactive;
    tapTimes = [];
    rageCounted = false;
  }
  tapTimes = tapTimes.filter((t) => now - t < RAGE_WINDOW_MS);
  if (!tapTimes.length) rageCounted = false;
  tapTimes.push(now);
  if (tapTimes.length >= RAGE_TAPS && !rageCounted) {
    rageCounted = true;
    const named = interactive.closest('[data-usage]');
    countUsage(`rage:${named ? named.getAttribute('data-usage') : 'other'}`);
  }
}

// SPEC.md 30: time in the background isn't waiting - whatever was being
// timed when the app went away is dropped, not counted as slow.
let lastHiddenAt = -1;
export function wasHiddenSince(time) {
  return lastHiddenAt >= time;
}
function onVisibility() {
  if (document.visibilityState !== 'hidden') return;
  lastHiddenAt = performance.now();
  started.clear();
  openMeasured = true; // opening the app didn't finish while it was in view
}

let installed = false;
export function installUsageTracking() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerup', onTap, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('offline', () => countUsage('offline'));
}
