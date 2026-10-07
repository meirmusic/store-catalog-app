// SPEC.md 23.1: the caption the client receives - in the language chosen
// for this share (Hebrew or English), not the app's own language.
// Only names: never SKU, serial number, location, notes or condition.
export const GALLERY_NAME = 'Yossi Bitton Fine Art';
export const ARTIST_NAME = 'Yossi Bitton';
export const INSTAGRAM_URL = 'https://instagram.com/yossibittonfineart';

const WORDS = {
  he: { cm: 'ס"מ' },
  en: { cm: 'cm' },
};
// Types in English (SPEC.md 23.1); a type added to the list later stays as is.
const TYPE_EN = { 'מקורי': 'Original', 'מיקס מדיה': 'Mixed media' };

// Invisible direction marks, so the client's WhatsApp shows the text right:
// in a right-to-left line "91×132" is otherwise displayed "132×91" (width
// and height swapped), and a line starting with the English artist name
// would be laid out left-to-right.
const LRM = '\u200E';
const RLM = '\u200F';

function formatSize(size, lang) {
  if (size == null || String(size).trim() === '') return '';
  const raw = String(size).trim();
  const dims = raw.replace(/\s*[xX×*]\s*/g, '×');
  const withUnit = /ס"מ|cm/i.test(dims) ? dims : `${dims} ${WORDS[lang].cm}`;
  return lang === 'he' ? withUnit.replace(/[\d.,]+(?:×[\d.,]+)+/g, (m) => `${LRM}${m}${LRM}`) : withUnit;
}

// The text without the invisible marks - for comparing and for tests.
export function withoutMarks(text) {
  return String(text).replace(/[\u200E\u200F]/g, '');
}

// The parts of the share, in the chosen language - the caption (below) and
// the designed card (shareCard.js) are both built from these.
// Whether the artwork was sold is never shown (SPEC.md 23.2); a sold
// artwork is shared without its price.
export function shareDetails(item, { lang = 'he', includePrice = true } = {}) {
  const sold = item.availability_status === 'sold';
  const type = item.type ? (lang === 'en' ? TYPE_EN[item.type] || item.type : item.type) : '';
  const details = [formatSize(item.size, lang), type].filter(Boolean).join(' · ');
  const hasPrice = item.price != null && item.price !== '' && !Number.isNaN(Number(item.price));
  const price = !sold && includePrice && hasPrice ? `$${Number(item.price).toLocaleString('en-US')}` : '';
  // SPEC.md 27.3: in English, the English name when there is one.
  const name = lang === 'en' && item.name_en && String(item.name_en).trim() ? item.name_en : item.name;
  return { name: name ? String(name).trim() : '', details, price };
}

export function buildShareText(item, { lang = 'he', includePrice = true } = {}) {
  const { name, details, price } = shareDetails(item, { lang, includePrice });
  const title = name ? `${ARTIST_NAME} - ${name}` : ARTIST_NAME;
  // Hebrew: every line right-to-left (but not the link - nothing may stick to it).
  const rtl = (line) => (lang === 'he' ? `${RLM}${line}` : line);
  const body = [title, details, price].filter(Boolean).map(rtl).join('\n');
  return `${body}\n\n${rtl(GALLERY_NAME)}\n${INSTAGRAM_URL}`;
}
