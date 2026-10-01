// SPEC.md section 17: every failure gets a short code and is queued for the
// ErrorLog tab in the Sheet (sent with the next sync - see syncEngine).
// Plain module, no React: the crash screen and the sync engine use it too.
// Privacy: only the action name, the error's own text and device details
// are recorded - never passwords, reset codes, photos or item data.

const QUEUE_KEY = 'gallery_error_log_queue';
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
  if (!log) return { code: null, details };

  const queue = loadQueue();
  const now = Date.now();
  // The same failure repeating in the same action is one entry with a count.
  const repeat = queue.find((e) => e.action === action && e.message === details && now - e.first_at < DEDUP_WINDOW_MS);
  if (repeat) {
    repeat.count += 1;
    saveQueue(queue);
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
  return { code: entry.code, details };
}

// Sends what's queued; a failure is silent and simply retried next sync
// (reporting it would only loop).
export async function flushErrorLog(send) {
  const queue = loadQueue();
  if (!queue.length) return;
  try {
    await send(queue.map(({ first_at: _local, ...entry }) => entry));
    const sent = new Set(queue.map((e) => e.code));
    saveQueue(loadQueue().filter((e) => !sent.has(e.code)));
  } catch {
    // keep for the next sync
  }
}
