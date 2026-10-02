// SPEC.md section 17: every failure gets a short code and is queued for the
// ErrorLog tab in the Sheet (sent with the next sync - see syncEngine).
// Plain module, no React: the crash screen and the sync engine use it too.
// Privacy: only the action name, the error's own text and device details
// are recorded - never passwords, reset codes, photos or item data.

const QUEUE_KEY = 'gallery_error_log_queue';
// SPEC.md 21.4: the last few failures, kept on the device even after the
// queue above was sent - for "info and support".
const RECENT_KEY = 'gallery_recent_errors';
const MAX_RECENT = 10;

// Every failure the user was shown (SPEC.md 22.7) - also those not sent to
// the ErrorLog (e.g. while offline), marked logged: false.
function rememberRecent(code, action, message, logged = true) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const text = String(message).slice(0, 300);
    const list = (raw ? JSON.parse(raw) : []).filter((e) => e && !(e.action === action && e.message === text));
    list.unshift({ code: code || '', action, message: text, at: new Date().toISOString(), logged });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // storage unavailable - the on-screen report still works
  }
}

export function getRecentErrors() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
const MAX_QUEUE = 30;
const DEDUP_WINDOW_MS = 10 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// eslint-disable-next-line no-undef
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

function makeCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `E-${code}`;
}

export function describeError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === 'object' && error.message) return String(error.message);
  return String(error);
}

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // storage unavailable or full - the on-screen report still works
  }
}

function currentMember() {
  try {
    return localStorage.getItem('gallery_team_member') || '';
  } catch {
    return '';
  }
}

// Returns { code, details } for showing on screen. `log: false` skips the
// ErrorLog (e.g. a network failure while the device is simply offline).
export function reportError(action, error, { log = true } = {}) {
  const details = describeError(error);
  console.error(`[${action}]`, error);
  if (!log) {
    rememberRecent(null, action, details, false);
    return { code: null, details };
  }

  const queue = loadQueue();
  const now = Date.now();
  // The same failure repeating in the same action is one entry with a count.
  const repeat = queue.find((e) => e.action === action && e.message === details && now - e.first_at < DEDUP_WINDOW_MS);
  if (repeat) {
    repeat.count += 1;
    saveQueue(queue);
    rememberRecent(repeat.code, action, details);
    return { code: repeat.code, details };
  }

  const entry = {
    code: makeCode(),
    action,
    message: details,
    stack: error instanceof Error && error.stack ? String(error.stack).slice(0, 1000) : '',
    member: currentMember(),
    device: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
    app_version: APP_VERSION,
    occurred_at: new Date(now).toISOString(),
    first_at: now,
    count: 1,
  };
  queue.push(entry);
  saveQueue(queue.slice(-MAX_QUEUE));
  rememberRecent(entry.code, action, details);
  return { code: entry.code, details };
}

// Sends what's queued; a failure is silent and retried no sooner than
// RETRY_AFTER_MS (SPEC.md 18.6 - e.g. before the server knows logErrors,
// it must not cost an extra failing request every cycle). Never two sends
// at once. Repeats counted while a send is in flight stay queued, as the
// difference, for the next send - nothing is lost.
const RETRY_AFTER_MS = 10 * 60 * 1000;
let flushing = false;
let retryAt = 0;

export async function flushErrorLog(send) {
  if (flushing || Date.now() < retryAt) return;
  const queue = loadQueue();
  if (!queue.length) return;
  flushing = true;
  try {
    await send(queue.map(({ first_at: _local, ...entry }) => entry));
    const sentCount = new Map(queue.map((e) => [e.code, e.count]));
    saveQueue(loadQueue().flatMap((e) => {
      if (!sentCount.has(e.code)) return [e];
      const more = e.count - sentCount.get(e.code);
      return more > 0 ? [{ ...e, count: more }] : [];
    }));
    retryAt = 0;
  } catch {
    // keep for later
    const backoff = typeof window !== 'undefined' && window.__testErrorLogRetryMs != null ? window.__testErrorLogRetryMs : RETRY_AFTER_MS;
    retryAt = Date.now() + backoff;
  } finally {
    flushing = false;
  }
}

// SPEC.md 18.2: the browser's own words for "the request never got an
// answer it could read" - no connection, or (before REG-031) a server error
// page. iPhone: "Load failed"; Chrome: "Failed to fetch"; Firefox: "NetworkError...".
export function isNetworkError(details) {
  return /Load failed|Failed to fetch|NetworkError|network connection was lost|Network request failed/i.test(String(details || ''));
}
