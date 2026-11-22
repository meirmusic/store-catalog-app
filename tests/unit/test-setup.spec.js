// The test suite itself must be able to start on the test machine - after
// the machine's browser is updated, too (REG-064). TEST_PLAN.md TC-ENV-*.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mainConfig from '../../playwright.config.js';
import builtConfig from '../../playwright.built.config.js';
import { findChromium } from '../helpers/chromium.js';

test('TC-ENV-001: both test setups point at a browser that exists on this machine (or let Playwright find its own)', () => {
  const launches = [...mainConfig.projects.map((p) => p.use.launchOptions), builtConfig.use.launchOptions];
  for (const options of launches) {
    expect(options.args).toContain('--no-sandbox');
    if (options.executablePath) expect(fs.existsSync(options.executablePath), options.executablePath).toBe(true);
  }
});

test('TC-ENV-002: after the machine\'s browser is updated - the new version is found; the stable link wins; nothing found - Playwright\'s own', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-browsers-'));
  const make = (rel) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, ''); return p; };
  expect(findChromium(root, {})).toBeUndefined();
  make('chromium-1194/chrome-linux/chrome');
  const newer = make('chromium-1243/chrome-linux64/chrome');
  expect(findChromium(root, {})).toBe(newer);
  const link = make('chromium');
  expect(findChromium(root, {})).toBe(link);
  const chosen = make('mine/chrome');
  expect(findChromium(root, { CHROMIUM_PATH: chosen })).toBe(chosen);
  expect(findChromium(root, { CHROMIUM_PATH: path.join(root, 'gone') })).toBe(link); // a wrong setting doesn't break it
  fs.rmSync(root, { recursive: true });
});
