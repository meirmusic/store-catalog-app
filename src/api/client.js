import { APPS_SCRIPT_URL, SHARED_SECRET } from './config';

// See SPEC.md "דרישות טכניות קריטיות למימוש ה-API": Apps Script can't
// handle a CORS preflight, so the request body must be sent as
// text/plain (a CORS-safelisted type) even though it's JSON underneath.
// The Apps Script side does JSON.parse(e.postData.contents) itself.
async function callApi(action, payload) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_URL not configured yet');
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, secret: SHARED_SECRET, payload }),
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
