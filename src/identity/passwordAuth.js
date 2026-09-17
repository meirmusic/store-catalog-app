// The office email+password fallback login (task #28 v3) - a second,
// independent way in alongside Google Sign-In, for devices that don't
// already have the shared Google account signed in. Unlike a Google ID
// token, this credential doesn't expire on its own; signing out is the
// only way to clear it. See src/identity/IdentityContext.jsx for how this
// is verified (a live API call, since there's nothing to decode locally).

const STORAGE_KEY = 'gallery_password_identity';

export function savePasswordIdentity(email, password) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password }));
  } catch {
    // localStorage unavailable (private browsing etc.) - the session just
    // won't survive a reload; sign-in itself still works for this tab.
  }
}

export function loadStoredPasswordIdentity() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearStoredPasswordIdentity() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
