import { APPS_SCRIPT_URL } from './config';
import { getAuthFields } from './authToken.js';

// See SPEC.md "דרישות טכניות קריטיות למימוש ה-API": Apps Script can't
// handle a CORS preflight, so the request body must be sent as
// text/plain (a CORS-safelisted type) even though it's JSON underneath.
// The Apps Script side does JSON.parse(e.postData.contents) itself.
//
// A real credential (not a static shared secret) is what actually protects
// this endpoint now - see task #28. getAuthFields() supplies either a
// Google id_token or an { auth: {email, password} } pair, whichever the
// signed-in identity currently is; Code.gs verifies either one server-side
// on every request, so a request with neither is rejected regardless of
// what the website does.
async function callApi(action, payload) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_URL not configured yet');
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...getAuthFields(), payload }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

export function getAll() {
  return callApi('getAll');
}

export function upsertItem(item) {
  return callApi('upsert', item);
}

export function softDeleteItem(rowId) {
  return callApi('softDelete', { row_id: rowId });
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
