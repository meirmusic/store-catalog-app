// SPEC.md 33.4-33.5: a phone signed in with the office password swaps it for
// a key of its own on its first sync with a server that supports keys - no
// signing in again. Until that works (no internet, an older server) nothing
// changes; it's tried again with the next sync. Never rejects.
import { issueDeviceKey } from '../api/client.js';
import { currentAuthKind, currentAuthEmail, setDeviceKeyAuth } from '../api/authToken.js';
import { saveDeviceKeyIdentity } from './passwordAuth.js';
import { hasServerFeature } from '../sync/serverFeatures.js';
import { deviceKind } from '../telemetry/usage.js';
import { reportError } from '../errors/errorReporting.js';

let busy = false;

export async function upgradeToDeviceKey() {
  if (busy || currentAuthKind() !== 'password' || !hasServerFeature('device_key')) return;
  busy = true;
  const email = currentAuthEmail();
  try {
    let member = '';
    try { member = localStorage.getItem('gallery_team_member') || ''; } catch { /* ignore */ }
    const res = await issueDeviceKey({ kind: deviceKind(), member });
    if (res && res.device_key && currentAuthKind() === 'password' && currentAuthEmail() === email) {
      saveDeviceKeyIdentity(email, res.device_key);
      setDeviceKeyAuth(email, res.device_key);
    }
  } catch (err) {
    reportError('device-key', err, { log: navigator.onLine });
  } finally {
    busy = false;
  }
}
