// TC-IMG-CAP-* (REG-008 follow-up, task: camera option missing). Pure
// Node - no browser needed. See src/items/ImageField.jsx for why this
// decision exists: `capture` gets staff the camera directly in the file
// picker everywhere it's safe, but must be omitted in the one context
// where it's known to silently break the picker entirely (iOS standalone).
import { test, expect } from '@playwright/test';
import { shouldOmitCameraCapture } from '../../src/items/ImageField.jsx';

test.describe('shouldOmitCameraCapture', () => {
  test('TC-IMG-CAP-001 (REG-008): iOS in standalone (installed) mode omits capture', () => {
    const nav = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', platform: 'iPhone', maxTouchPoints: 5, standalone: true };
    expect(shouldOmitCameraCapture(nav)).toBe(true);
  });

  test('TC-IMG-CAP-002: iOS in a regular browser tab (not standalone) keeps capture', () => {
    const nav = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', platform: 'iPhone', maxTouchPoints: 5, standalone: false };
    expect(shouldOmitCameraCapture(nav)).toBe(false);
  });

  test('TC-IMG-CAP-003: iPad reporting as "MacIntel" (modern iPadOS) with touch points is still detected as iOS', () => {
    const nav = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5, standalone: true };
    expect(shouldOmitCameraCapture(nav)).toBe(true);
  });

  test('TC-IMG-CAP-004: a real Mac (no touch points) is never treated as iOS, even if "standalone" were somehow true', () => {
    const nav = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 0, standalone: true };
    expect(shouldOmitCameraCapture(nav)).toBe(false);
  });

  test('TC-IMG-CAP-005: Android in standalone (installed) mode keeps capture - the bug this works around is iOS-only', () => {
    const nav = { userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5, standalone: true };
    expect(shouldOmitCameraCapture(nav)).toBe(false);
  });

  test('TC-IMG-CAP-006: standalone is undefined (non-Safari browsers never set it) keeps capture', () => {
    const nav = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', platform: 'iPhone', maxTouchPoints: 5 };
    expect(shouldOmitCameraCapture(nav)).toBe(false);
  });
});
