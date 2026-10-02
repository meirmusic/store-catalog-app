import { getImage } from '../api/client.js';

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

async function loadBlob(item, key) {
  const cached = await fromCache(key);
  if (cached) return cached;
  const res = await getImage(item.row_id);
  if (!res || !res.data) throw new Error('the server returned no photo');
  const blob = dataUrlToFile(`data:${res.mime || 'image/jpeg'};base64,${res.data}`, fileName(item));
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
