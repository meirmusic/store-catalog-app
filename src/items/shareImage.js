import { getImage } from '../api/client.js';
import { sizedImageUrl, FULL_IMAGE_WIDTH } from './imageUrl.js';

// SPEC.md 23.3: the photo file for sharing. A photo not uploaded yet is
// taken from the device; an uploaded one comes from the server (Drive can't
// be read from the page) and is kept on the device for the next share of
// the same photo.
const CACHE = 'share-images-v1';

function dataUrlToFile(dataUrl, name) {
  const [head, b64] = dataUrl.split(',');
  const mime = (/data:([^;]+)/.exec(head) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

// A plain English name: some browsers refuse a Hebrew file name and save
// the photo as "download", with no extension (found in testing).
function fileName() {
  return 'Yossi-Bitton-Fine-Art.jpg';
}

async function fromCache(key) {
  try {
    if (typeof caches === 'undefined') return null;
    const res = await (await caches.open(CACHE)).match(key);
    return res ? res.blob() : null;
  } catch {
    return null;
  }
}

async function toCache(key, blob) {
  try {
    if (typeof caches === 'undefined') return;
    await (await caches.open(CACHE)).put(key, new Response(blob, { headers: { 'Content-Type': blob.type } }));
  } catch {
    // storage full or unavailable - next share fetches again
  }
}

// One download per photo at a time: opening the window again while it's
// still downloading waits for the same download instead of starting another.
const inFlight = new Map();

// SPEC.md 28.1: if the server can't send it (e.g. its Apps Script isn't
// updated yet), try Drive directly - Google may or may not allow a page to
// read its pictures. Two addresses of the same photo: Google's picture
// server, and Drive's own thumbnail link (which redirects there).
export function driveCandidates(url) {
  if (typeof url !== 'string') return [];
  const match = /[?&]id=([\w-]+)/.exec(url) || /\/d\/([\w-]+)/.exec(url);
  if (!match) return [];
  return [`https://lh3.googleusercontent.com/d/${match[1]}=w${FULL_IMAGE_WIDTH}`, sizedImageUrl(url, FULL_IMAGE_WIDTH)];
}

async function fromDrive(item) {
  let lastError = new Error('no Drive address for this photo');
  for (const url of driveCandidates(item.image_url)) {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error(`Drive answered ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error(`Drive sent ${blob.type || 'no type'}, not a picture`);
      return blob;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// The server answered that it doesn't know getImage: its Apps Script is an
// older deployment (SPEC.md 28.1) - said in plain words, not as a fault.
export function isServerNotUpdated(error) {
  return /unknown action: getImage/.test(String(error?.message || error));
}

async function loadBlob(item, key) {
  const cached = await fromCache(key);
  if (cached) return cached;
  let blob;
  try {
    const res = await getImage(item.row_id);
    if (!res || !res.data) throw new Error('the server returned no photo');
    blob = dataUrlToFile(`data:${res.mime || 'image/jpeg'};base64,${res.data}`, fileName(item));
  } catch (serverError) {
    try {
      blob = await fromDrive(item);
    } catch {
      throw serverError;
    }
  }
  await toCache(key, blob);
  return blob;
}

// Resolves to a File, or null when the item has no photo. Throws if the
// photo exists but couldn't be prepared.
export async function prepareShareImage(item) {
  if (item.pending_image) return dataUrlToFile(item.pending_image, fileName(item));
  if (!item.image_url) return null;
  const key = `https://share-image.local/${encodeURIComponent(item.row_id)}?v=${encodeURIComponent(item.image_url)}`;
  if (!inFlight.has(key)) {
    inFlight.set(key, loadBlob(item, key).finally(() => inFlight.delete(key)));
  }
  const blob = await inFlight.get(key);
  return new File([blob], fileName(item), { type: blob.type || 'image/jpeg' });
}
