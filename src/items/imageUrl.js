// SPEC.md section 10: Drive stores each photo at up to 1600px, but each
// place asks Drive for only the size it needs - the stored Sheet URL keeps
// its format, only its sz= parameter is swapped here.
export const THUMB_IMAGE_WIDTH = 400;
export const FULL_IMAGE_WIDTH = 1600;

export function sizedImageUrl(url, width) {
  if (typeof url !== 'string') return url;
  return url.replace(/^(https:\/\/drive\.google\.com\/thumbnail\?id=[^&]+&sz=w)\d+$/, `$1${width}`);
}

// A saved photo that hasn't reached the server yet is shown in place of the
// item's current one until the upload succeeds (SPEC.md section 10).
export function displayImage(item) {
  return item?.pending_image || item?.image_url || null;
}
