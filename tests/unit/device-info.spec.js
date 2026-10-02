// SPEC.md 22.7: the "device" line in "info & support" - pretending to be
// each kind of device, since what browsers report is not always the truth.
import { test, expect } from '@playwright/test';
import { describeDevice } from '../../src/settings/deviceInfo.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // iPadOS Safari asks for the desktop site by default - it says "Macintosh".
  ipadAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  // Chrome on Android always reports "Android 10; K" - no real version/model.
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
};

test('TC-DEV-001: iPhone, installed app', () => {
  expect(describeDevice({ userAgent: UA.iphone, maxTouchPoints: 5, standalone: true }))
    .toEqual({ device: 'iPhone', os: 'iOS 17.5', browser: 'Safari', installed: true });
});

test('TC-DEV-002: an iPad that reports itself as a Mac is still an iPad', () => {
  expect(describeDevice({ userAgent: UA.ipadAsMac, platform: 'MacIntel', maxTouchPoints: 5 }))
    .toMatchObject({ device: 'iPad', os: 'iPadOS 17.4' });
});

test('TC-DEV-003: a real Mac (no touch) is a Mac', () => {
  expect(describeDevice({ userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 0 }))
    .toMatchObject({ device: 'Mac', os: 'macOS', browser: 'Safari', installed: false });
});

test('TC-DEV-004: Android phones - Chrome and Samsung Internet', () => {
  expect(describeDevice({ userAgent: UA.android, maxTouchPoints: 5 })).toMatchObject({ device: 'Android phone', os: 'Android 10', browser: 'Chrome 129' });
  expect(describeDevice({ userAgent: UA.samsung, maxTouchPoints: 5 })).toMatchObject({ device: 'Android phone', os: 'Android 14', browser: 'Samsung Internet 25' });
});

test('TC-DEV-005: Windows with Edge; Chrome on iPhone', () => {
  expect(describeDevice({ userAgent: UA.windowsEdge })).toMatchObject({ device: 'Computer', os: 'Windows', browser: 'Edge 129' });
  expect(describeDevice({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toMatchObject({ device: 'iPhone', browser: 'Chrome 129' });
});

test('TC-DEV-006: something unknown says "?" rather than guessing', () => {
  expect(describeDevice({ userAgent: 'SomethingElse/1.0' })).toEqual({ device: '?', os: '?', browser: '?', installed: false });
});
