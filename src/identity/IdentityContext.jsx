import { createContext, useContext, useMemo, useState } from 'react';
import { setGoogleAuth, setPasswordAuth, clearAuth } from '../api/authToken.js';
import { getAll } from '../api/client.js';
import { decodeJwt, loadStoredIdentity, saveIdentity, clearStoredIdentity } from './googleAuth.js';
import {
  savePasswordIdentity,
  loadStoredPasswordIdentity,
  clearStoredPasswordIdentity,
} from './passwordAuth.js';

const IdentityContext = createContext(null);

export function IdentityProvider({ children }) {
  // Set the module-level auth credential synchronously during this initial
  // computation (not in a useEffect) - the sync engine can fire its first
  // request on mount, before any effect would otherwise have run, and it
  // must never race ahead with a stale/missing credential. Google is
  // checked first only because it's the one with its own expiry to honor;
  // either kind is otherwise equally valid.
  const [identity, setIdentityState] = useState(() => {
    const google = loadStoredIdentity();
    if (google) {
      setGoogleAuth(google.idToken);
      return { kind: 'google', email: google.email, name: google.name };
    }
    const pw = loadStoredPasswordIdentity();
    if (pw) {
      setPasswordAuth(pw.email, pw.password);
      return { kind: 'password', email: pw.email, name: pw.email };
    }
    return null;
  });

  const value = useMemo(
    () => ({
      user: identity ? { email: identity.email, name: identity.name } : null,
      // Called with the raw credential (JWT) from Google's callback.
      // Returns false if the token couldn't even be decoded - the actual
      // authorization decision (is this email allowed) is the server's,
      // discovered on the next API call, not here.
      signInWithGoogle: (idToken) => {
        const payload = decodeJwt(idToken);
        if (!payload || !payload.email) return false;
        saveIdentity(idToken, payload);
        setGoogleAuth(idToken);
        setIdentityState({ kind: 'google', email: payload.email, name: payload.name });
        return true;
      },
      // Unlike Google's token, a typed password can't be checked locally -
      // there's nothing to decode - so this makes a real API call to find
      // out whether the server accepts it before treating sign-in as
      // successful.
      signInWithPassword: async (email, password) => {
        setPasswordAuth(email, password);
        try {
          await getAll();
          savePasswordIdentity(email, password);
          setIdentityState({ kind: 'password', email, name: email });
          return true;
        } catch {
          clearAuth();
          return false;
        }
      },
      signOut: () => {
        clearStoredIdentity();
        clearStoredPasswordIdentity();
        clearAuth();
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
