import { createContext, useContext, useMemo, useState } from 'react';
import { setAuthToken } from '../api/authToken.js';
import { decodeJwt, loadStoredIdentity, saveIdentity, clearStoredIdentity } from './googleAuth.js';

const IdentityContext = createContext(null);

export function IdentityProvider({ children }) {
  // Set the module-level auth token synchronously during this initial
  // computation (not in a useEffect) - the sync engine can fire its first
  // request on mount, before any effect would otherwise have run, and it
  // must never race ahead with a stale/missing token.
  const [identity, setIdentityState] = useState(() => {
    const stored = loadStoredIdentity();
    setAuthToken(stored?.idToken || null);
    return stored;
  });

  const value = useMemo(
    () => ({
      user: identity ? { email: identity.email, name: identity.name } : null,
      // Called with the raw credential (JWT) from Google's callback.
      // Returns false if the token couldn't even be decoded - the actual
      // authorization decision (is this email allowed) is the server's,
      // discovered on the next API call, not here.
      signIn: (idToken) => {
        const payload = decodeJwt(idToken);
        if (!payload || !payload.email) return false;
        saveIdentity(idToken, payload);
        setAuthToken(idToken);
        setIdentityState({ idToken, email: payload.email, name: payload.name, exp: payload.exp });
        return true;
      },
      signOut: () => {
        clearStoredIdentity();
        setAuthToken(null);
        setIdentityState(null);
        // Otherwise Google silently re-signs the same account back in on
        // the next page load (One Tap / auto-select), making "sign out"
        // not actually sign out.
        if (window.google?.accounts?.id) {
          window.google.accounts.id.disableAutoSelect();
        }
      },
    }),
    [identity],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity must be used within an IdentityProvider');
  return ctx;
}
