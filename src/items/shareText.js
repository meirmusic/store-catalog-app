// SPEC.md 23.1 / 28.1: the artwork's details as they appear on the shared card.
// Only names: never SKU, serial number, location, notes or condition.
export const INSTAGRAM_URL = 'https://instagram.com/yossibittonfineart';

const WORDS = {
  he: { cm: 'ס"מ' },
  en: { cm: 'cm' },
};
// Types in English (SPEC.md 23.1); a type added to the list later stays as is.
const TYPE_EN = { 'מקורי': 'Original', 'מיקס מדיה': 'Mixed media' };

// Invisible direction marks: in a right-to-left line "91×132" is otherwise
// drawn "132×91" (width and height swapped).
const LRM = '\u200E';

function formatSize(size, lang) {
  if (size == null || String(size).trim() === '') return '';
  const raw = String(size).trim();
  const dims = raw.replace(/\s*[xX×*]\s*/g, '×');
  const withUnit = /ס"מ|cm/i.test(dims) ? dims : `${dims} ${WORDS[lang].cm}`;
  return lang === 'he' ? withUnit.replace(/[\d.,]+(?:×[\d.,]+)+/g, (m) => `${LRM}${m}${LRM}`) : withUnit;
}

// What the designed card (shareCard.js) shows. Whether the artwork was sold
// is never shown (SPEC.md 23.2); a sold artwork is shared without its price.
export function shareDetails(item, { lang = 'he', includePrice = true } = {}) {
  const sold = item.availability_status === 'sold';
  const type = item.type ? (lang === 'en' ? TYPE_EN[item.type] || item.type : item.type) : '';
  const details = [formatSize(item.size, lang), type].filter(Boolean).join(' · ');
  const hasPrice = item.price != null && item.price !== '' && !Number.isNaN(Number(item.price));
  const price = !sold && includePrice && hasPrice ? `$${Number(item.price).toLocaleString('en-US')}` : '';
  // SPEC.md 27.3 / 28.1: the English name too, shown under the Hebrew one on the card.
  const nameEn = item.name_en ? String(item.name_en).trim() : '';
  const name = lang === 'en' && nameEn ? nameEn : item.name;
  return { name: name ? String(name).trim() : '', nameEn: lang === 'he' ? nameEn : '', details, price };
}
