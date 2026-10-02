import { APPS_SCRIPT_URL } from './config';
import { getAuthFields } from './authToken.js';
import { recordServerAnswer } from '../sync/syncRecord.js';

// See SPEC.md "דרישות טכניות קריטיות למימוש ה-API": Apps Script can't
// handle a CORS preflight, so the request body must be sent as
// text/plain (a CORS-safelisted type) even though it's JSON underneath.
// The Apps Script side does JSON.parse(e.postData.contents) itself.
//
// A real credential (not a static shared secret) is what actually protects
// this endpoint now - see task #28. getAuthFields() supplies the office
// { auth: {email, password} } pair (the only way in since Google Sign-In
// was removed - SPEC.md section 15); Code.gs verifies it server-side on
// every request, so a request without it is rejected regardless of what
// the website does.
// Code.gs answers 'forbidden' only when the credential itself is rejected
// (the office password changed elsewhere) - kept
// distinct so the sync engine can ask the user to sign in again instead
// of counting it as an ordinary push failure (SPEC.md section 9).
export class AuthError extends Error {
  constructor() {
    super('forbidden');
    this.name = 'AuthError';
  }
}

// SPEC.md section 9, REG-030: every request gets a time limit. On iPhone,
// locking the screen mid-request can leave it never settling at all - and
// the sync cycle waited on it forever, silently freezing all syncing.
export class TimeoutError extends Error {
  constructor(seconds) {
    super(`no answer from the server after ${seconds}s`);
    this.name = 'TimeoutError';
  }
}

const TIMEOUT_MS = 30 * 1000;
const UPLOAD_TIMEOUT_MS = 2 * 60 * 1000; // a photo is the largest request

function timeoutFor(action) {
  // Test-only override (tests/integration/request-timeout.spec.js), like
  // __testSlowSave: lets a test hit the limit without waiting 30 seconds.
  if (typeof window !== 'undefined' && window.__testApiTimeoutMs) return window.__testApiTimeoutMs;
  return action === 'uploadImage' ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS;
}

async function callApi(action, payload) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_URL not configured yet');
  }
  const ms = timeoutFor(action);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  // SPEC.md 22.7: how the server answered, for "info & support". The error
  // log's own sends don't count (before Apps Script knows logErrors, they
  // would make a healthy server look broken).
  const record = action === 'logErrors' ? () => {} : recordServerAnswer;
  let res;
  let data;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, ...getAuthFields(), payload }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    data = await res.json(); // reading the answer counts toward the limit too
  } catch (err) {
    const failure = timedOut ? new TimeoutError(Math.round(ms / 1000)) : err;
    record('unreachable', failure && failure.message ? `${failure.name}: ${failure.message}` : String(failure));
    throw failure;
  } finally {
    clearTimeout(timer);
  }
  record(data && data.error && data.error !== 'forbidden' ? 'error' : 'ok', data && data.error ? data.error : '');
  if (data && data.error === 'forbidden') throw new AuthError();
  if (data && data.error) throw new Error(data.error);
  return data;
}

export function getAll() {
  return callApi('getAll');
}

export function upsertItem(item) {
  return callApi('upsert', item);
}

export function softDeleteItem(rowId, lastModifiedBy) {
  return callApi('softDelete', { row_id: rowId, last_modified_by: lastModifiedBy || '' });
}

// SPEC.md section 17: queued error reports, for the Sheet's ErrorLog tab.
export function logErrors(entries) {
  return callApi('logErrors', { entries });
}

export function addConfigOption(listName, value) {
  return callApi('addConfigOption', { list_name: listName, value });
}

export function uploadImage(rowId, dataUrl) {
  return callApi('uploadImage', { row_id: rowId, image: dataUrl });
}

// Both below are how someone recovers WITHOUT valid credentials yet, so
// they intentionally work with whatever getAuthFields() currently has (most
// likely nothing) - Code.gs handles them before its normal auth gate (task
// #28 v4).
export function requestPasswordReset(email) {
  return callApi('requestPasswordReset', { email });
}

export function resetPassword(email, code, newPassword) {
  return callApi('resetPassword', { email, code, newPassword });
}
