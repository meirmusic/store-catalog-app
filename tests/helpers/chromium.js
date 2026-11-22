// Where the test machine keeps Chromium (REG-064). The suite used to point at
// one fixed version's folder (chromium-1194); when the machine's browser was
// updated (chromium-1243) every browser test failed before checking anything
// - the weekly check, 15/11 and 22/11. Now, in order:
//   1. CHROMIUM_PATH, if someone sets it;
//   2. /opt/pw-browsers/chromium - a link the machine keeps pointing at
//      whichever version is installed;
//   3. the newest /opt/pw-browsers/chromium-<n>/chrome-linux*/chrome;
//   4. nothing - Playwright finds its own browser.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/opt/pw-browsers';

export function findChromium(root = ROOT, env = process.env) {
  const candidates = [env.CHROMIUM_PATH, path.join(root, 'chromium')];
  try {
    const versions = fs.readdirSync(root)
      .map((name) => /^chromium-(\d+)$/.exec(name))
      .filter(Boolean)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    for (const [dir] of versions) {
      for (const sub of ['chrome-linux64', 'chrome-linux']) candidates.push(path.join(root, dir, sub, 'chrome'));
    }
  } catch {
    // no such folder on this machine - Playwright's own browser
  }
  return candidates.find((p) => p && fs.existsSync(p));
}

// Running as root in a container, Chromium refuses to start without
// --no-sandbox (desktop happened to tolerate it; every phone profile did not).
export function chromiumLaunchOptions() {
  const executablePath = findChromium();
  return { ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] };
}
