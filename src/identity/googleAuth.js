// Real Google Sign-In (replaces the old closed-list name picker - see
// UI_STANDARD_GAP_ANALYSIS.md SEC-01..06 and task #28). This module only
// handles the CLIENT side: decoding the token for display and caching it
// across reloads. The actual security check - is this a real, currently
// valid Google token, and is the email in it allowed - happens entirely
// server-side in Code.gs. A client-side decode can't be trusted for
// authorization; it's just so the UI can show "who's signed in" instantly
// without waiting on a round trip.

const STORAGE_KEY = 'gallery_google_identity';

// Decodes a JWT's payload segment - base64url, not signature-verified.
// Never use this result to decide access; only the server's verification
// (via Google's tokeninfo endpoint) is authoritative.
export function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function saveIdentity(idToken, payload) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ idToken, email: payload.email, name: payload.name, exp: payload.exp }),
    );
  } catch {
    // localStorage unavailable (private browsing etc.) - the session just
    // won't survive a reload; sign-in itself still works for this tab.
  }
}

export function loadStoredIdentity() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Google ID tokens are short-lived (~1 hour) - treat an expired one as
    // signed-out rather than sending it and getting rejected server-side.
    if (!parsed.exp || parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearStoredIdentity() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// index.html loads https://accounts.google.com/gsi/client with `defer`, so
// it may not have run yet by the time this component mounts - poll briefly
// instead of assuming window.google is already there.
export function waitForGoogleIdentityServices(timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
      if (Date.now() - start > timeoutMs) return reject(new Error('Google Identity Services failed to load'));
      setTimeout(poll, 100);
    })();
  });
}
