// TC-I18N-009 from TEST_PLAN.md: every t('...') key actually used in the
// source is present in all three language tables. Pure static analysis -
// no browser needed.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translations } from '../../src/i18n/translations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '..', '..', 'src');

function collectSourceFiles(dir) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files = files.concat(collectSourceFiles(full));
    } else if (/\.(jsx?|tsx?)$/.test(entry) && full !== path.join(SRC_DIR, 'i18n', 'translations.js')) {
      files.push(full);
    }
  }
  return files;
}

function extractUsedKeys() {
  const keys = new Set();
  const pattern = /\bt\(\s*['"]([\w.]+)['"]\s*\)/g;
  for (const file of collectSourceFiles(SRC_DIR)) {
    const content = readFileSync(file, 'utf-8');
    let match;
    while ((match = pattern.exec(content))) keys.add(match[1]);
  }
  return keys;
}

test('TC-I18N-009: every t() key used in the app exists in he/en/nl', () => {
  const usedKeys = extractUsedKeys();
  expect(usedKeys.size).toBeGreaterThan(10); // sanity check the scan actually found something

  const missing = { he: [], en: [], nl: [] };
  for (const key of usedKeys) {
    for (const lang of Object.keys(missing)) {
      if (!(key in translations[lang])) missing[lang].push(key);
    }
  }

  for (const lang of Object.keys(missing)) {
    expect(missing[lang], `missing keys in "${lang}"`).toEqual([]);
  }
});
