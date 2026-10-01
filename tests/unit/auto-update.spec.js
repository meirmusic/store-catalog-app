// SPEC.md section 9 (REG-035): when a new app version installs by itself.
// Pure logic - the real service worker can't run in the dev-server tests.
import { test, expect } from '@playwright/test';
import { createAutoUpdater, AUTO_WINDOW_MS } from '../../src/pwa/autoUpdate.js';

function setup() {
  let time = 1_000_000;
  const applied = [];
  const updater = createAutoUpdater({ apply: () => applied.push(time), now: () => time });
  return { updater, applied, advance: (ms) => { time += ms; } };
}

test('REG-035a: a new version found right after opening (or coming back) installs by itself', () => {
  const { updater, applied, advance } = setup();
  updater.arm();
  advance(5000);
  updater.setNeedRefresh(true);
  expect(applied).toHaveLength(1);
});

test('REG-035b: never while typing - it installs as soon as the form closes', () => {
  const { updater, applied, advance } = setup();
  updater.setBusy(true);
  updater.arm();
  updater.setNeedRefresh(true);
  expect(applied).toHaveLength(0);
  advance(10 * 60 * 1000); // long after the window - still promised
  updater.setBusy(false);
  expect(applied).toHaveLength(1);
});

test('REG-035c: found during continuous use (hourly check) - banner only, installs at the next return', () => {
  const { updater, applied, advance } = setup();
  updater.arm();
  advance(AUTO_WINDOW_MS + 1);
  updater.setNeedRefresh(true);
  expect(applied).toHaveLength(0);
  advance(30 * 60 * 1000);
  updater.arm(); // back in the app
  expect(applied).toHaveLength(1);
});

test('REG-035d: installs once, and not at all without a new version', () => {
  const { updater, applied } = setup();
  updater.arm();
  updater.setBusy(true);
  updater.setBusy(false);
  expect(applied).toHaveLength(0);
  updater.setNeedRefresh(true);
  updater.arm();
  updater.setBusy(true);
  updater.setBusy(false);
  expect(applied).toHaveLength(1);
});
