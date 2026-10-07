import { shareDetails } from './shareText.js';
import titleHebrew from './card-fonts/frank-ruhl-libre-hebrew-700-normal.woff2';
import titleLatin from './card-fonts/frank-ruhl-libre-latin-700-normal.woff2';
import textHebrew from './card-fonts/assistant-hebrew-400-normal.woff2';
import textLatin from './card-fonts/assistant-latin-400-normal.woff2';
import serif from './card-fonts/cormorant-garamond-latin-500-normal.woff2';
import serifItalic from './card-fonts/cormorant-garamond-latin-300-italic.woff2';

// SPEC.md 23.5: the designed share card, in the language of the 2025
// catalog - paper-grey page, the artwork with a soft shadow, the name, and
// the logo with the catalog's tagline. Drawn on the device: the photo goes
// nowhere but the destination the user picks.
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350; // 4:5 - what WhatsApp and Instagram show best
export const CARD_FILE_NAME = 'Yossi-Bitton-Fine-Art.jpg';
const TAGLINE = 'ART THAT SPEAKS TO YOUR SOUL';
const INSTAGRAM_HANDLE = '@yossibittonfineart';

const PAD_X = 76;
const PAD_TOP = 68;
const PAD_BOTTOM = 44;
const COLORS = { paper: '#F3F2F0', ink: '#1C1B18', dim: '#5F5D57', faint: '#6E6C64', line: '#D9D6CF' };
// A card that takes longer than this is given up on - the photo alone is sent.
const BUILD_TIMEOUT_MS = 8000;

// Own family names, so nothing in the app's own styles can change the card.
const TITLE = 'YB Card Title';
const TEXT = 'YB Card Text';
const SERIF = 'YB Card Serif';
const HEBREW = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const FONTS = [
  [TITLE, titleHebrew, HEBREW, '700', 'normal'],
  [TITLE, titleLatin, LATIN, '700', 'normal'],
  [TEXT, textHebrew, HEBREW, '400', 'normal'],
  [TEXT, textLatin, LATIN, '400', 'normal'],
  [SERIF, serif, LATIN, '500', 'normal'],
  [SERIF, serifItalic, LATIN, '300', 'italic'],
];

let fontsReady = null;
function loadFonts() {
  if (!fontsReady) {
    fontsReady = Promise.all(FONTS.map(([family, url, unicodeRange, weight, style]) => {
      const face = new FontFace(family, `url(${url})`, { unicodeRange, weight, style });
      document.fonts.add(face);
      return face.load();
    })).catch((error) => {
      fontsReady = null; // try again next time
      throw error;
    });
  }
  return fontsReady;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`couldn't read the image for the card: ${String(src).slice(0, 60)}`));
    img.src = src;
  });
}

let logoReady = null;
function loadLogo() {
  if (!logoReady) {
    logoReady = loadImage(`${import.meta.env.BASE_URL}logo-header.png`).catch((error) => {
      logoReady = null;
      throw error;
    });
  }
  return logoReady;
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function wrapWords(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(candidate).width <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// A long name moves to a second line; longer than that, the font gets a
// little smaller; longer still, the second line ends with "…".
function layoutName(ctx, name, maxWidth) {
  for (const size of [54, 48, 42]) {
    ctx.font = `700 ${size}px "${TITLE}"`;
    const lines = wrapWords(ctx, name, maxWidth);
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { size, lines };
  }
  const size = 42;
  ctx.font = `700 ${size}px "${TITLE}"`;
  const lines = wrapWords(ctx, name, maxWidth);
  const rest = lines.slice(1).join(' ');
  return { size, lines: [fitText(ctx, lines[0], maxWidth), ...(rest ? [fitText(ctx, rest, maxWidth)] : [])] };
}

// Letters drawn one by one, so the spaced-out tagline looks the same on
// browsers without canvas letter-spacing.
function spacedWidth(ctx, text, spacing) {
  return [...text].reduce((w, ch) => w + ctx.measureText(ch).width + spacing, -spacing);
}
function drawSpaced(ctx, text, x, y, spacing) {
  let at = x;
  for (const ch of text) {
    ctx.fillText(ch, at, y);
    at += ctx.measureText(ch).width + spacing;
  }
}

function drawCard(ctx, photo, logo, { name, nameEn, details, price }, lang) {
  const he = lang === 'he';
  const innerWidth = CARD_WIDTH - 2 * PAD_X;
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.textBaseline = 'middle';

  // Bottom line: logo · tagline · Instagram - always left to right, like the catalog.
  const footMid = CARD_HEIGHT - PAD_BOTTOM - 28;
  const ruleY = footMid - 52;
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(PAD_X, ruleY, innerWidth, 2);
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  const logoHeight = 56;
  const logoWidth = (logo.naturalWidth / logo.naturalHeight) * logoHeight;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(logo, PAD_X, footMid - logoHeight / 2, logoWidth, logoHeight);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = COLORS.faint;
  ctx.font = `400 26px "${TEXT}"`;
  const handleWidth = ctx.measureText(INSTAGRAM_HANDLE).width;
  ctx.fillText(INSTAGRAM_HANDLE, CARD_WIDTH - PAD_X - handleWidth, footMid);
  const gapStart = PAD_X + logoWidth + 28;
  const gapWidth = CARD_WIDTH - PAD_X - handleWidth - 28 - gapStart;
  for (const size of [28, 25, 22]) {
    ctx.font = `italic 300 ${size}px "${SERIF}"`;
    const spacing = size * 0.08;
    const width = spacedWidth(ctx, TAGLINE, spacing);
    if (width <= gapWidth) {
      drawSpaced(ctx, TAGLINE, gapStart + (gapWidth - width) / 2, footMid, spacing);
      break;
    }
  }

  // The details, bottom up: price, size · type, name.
  const lines = [];
  if (name) {
    ctx.direction = he ? 'rtl' : 'ltr';
    const { size, lines: nameLines } = layoutName(ctx, name, innerWidth);
    for (const text of nameLines) lines.push({ text, font: `700 ${size}px "${TITLE}"`, color: COLORS.ink, height: Math.round(size * 1.3) });
  }
  // SPEC.md 28.1: the English name under the Hebrew one, as in the catalog.
  if (nameEn) lines.push({ text: nameEn, font: `italic 300 38px "${SERIF}"`, color: COLORS.ink, height: 50, gapBefore: 2 });
  if (details) lines.push({ text: details, font: `400 32px "${TEXT}"`, color: COLORS.dim, height: 46, gapBefore: name ? 6 : 0 });
  if (price) lines.push({ text: price, font: `500 50px "${SERIF}"`, color: COLORS.ink, height: 62, gapBefore: 2 });
  const infoHeight = lines.reduce((h, l) => h + l.height + (l.gapBefore || 0), 0);
  const infoTop = ruleY - 32 - infoHeight;
  ctx.direction = he ? 'rtl' : 'ltr';
  ctx.textAlign = he ? 'right' : 'left';
  const x = he ? CARD_WIDTH - PAD_X : PAD_X;
  let y = infoTop;
  for (const line of lines) {
    y += line.gapBefore || 0;
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    ctx.fillText(fitText(ctx, line.text, innerWidth), x, y + line.height / 2);
    y += line.height;
  }

  // The artwork: whole (never cropped), centered, with a soft shadow.
  const areaTop = PAD_TOP;
  const areaBottom = (lines.length ? infoTop : ruleY) - 44;
  const maxW = innerWidth - 24; // room for the shadow
  const maxH = areaBottom - areaTop - 24;
  const scale = Math.min(maxW / photo.naturalWidth, maxH / photo.naturalHeight);
  const w = Math.round(photo.naturalWidth * scale);
  const h = Math.round(photo.naturalHeight * scale);
  const left = Math.round((CARD_WIDTH - w) / 2);
  const top = Math.round(areaTop + (areaBottom - areaTop - h) / 2);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetX = 12;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(left, top, w, h); // the shadow, even under a photo with transparent parts
  ctx.restore();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(photo, left, top, w, h);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the share card took longer than ${ms / 1000}s`)), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

async function build(photoFile, item, { lang, includePrice }) {
  const photoUrl = URL.createObjectURL(photoFile);
  try {
    const [photo, logo] = await Promise.all([loadImage(photoUrl), loadLogo(), loadFonts()]);
    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    drawCard(canvas.getContext('2d'), photo, logo, shareDetails(item, { lang, includePrice }), lang);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the card image could not be created'))), 'image/jpeg', 0.92);
    });
    return new File([blob], CARD_FILE_NAME, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(photoUrl);
  }
}

// Resolves to the card as a JPEG File; rejects when it can't be built.
export function buildShareCard(photoFile, item, { lang = 'he', includePrice = true } = {}) {
  return withTimeout(build(photoFile, item, { lang, includePrice }), BUILD_TIMEOUT_MS);
}
