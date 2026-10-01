import { createContext, useContext, useMemo, useState } from 'react';
import { setPasswordAuth, clearAuth } from '../api/authToken.js';
import { getAll, AuthError } from '../api/client.js';
import {
  savePasswordIdentity,
  loadStoredPasswordIdentity,
  clearStoredPasswordIdentity,
} from './passwordAuth.js';

const IdentityContext = createContext(null);
const LEGACY_GOOGLE_KEY = 'gallery_google_identity';

export function IdentityProvider({ children }) {
  // Set the module-level auth credential synchronously during this initial
  // computation (not in a useEffect) - the sync engine can fire its first
  // request on mount, before any effect would otherwise have run, and it
  // must never race ahead with a stale/missing credential.
  const [identity, setIdentityState] = useState(() => {
    // SPEC.md section 15 (REG-036): Google Sign-In was removed. A device
    // still signed in with Google from before is simply signed out - its
    // local data and queued changes stay, and go out after the password login.
    try {
      localStorage.removeItem(LEGACY_GOOGLE_KEY);
    } catch {
      // storage unavailable - nothing stored to clear
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
      // A typed password can't be checked locally, so this makes a real API
      // call to find out whether the server accepts it before treating
      // sign-in as successful.
      // Returns { ok } or { ok: false, reason: 'wrong' | 'unreachable', error } -
      // a wrong password is the user's to fix; anything else is a
      // malfunction worth reporting (SPEC.md section 17).
      signInWithPassword: async (email, password) => {
        setPasswordAuth(email, password);
        try {
          await getAll();
          savePasswordIdentity(email, password);
          setIdentityState({ kind: 'password', email, name: email });
          return { ok: true };
        } catch (error) {
          clearAuth();
          return { ok: false, reason: error instanceof AuthError ? 'wrong' : 'unreachable', error };
        }
      },
      signOut: () => {
        clearStoredPasswordIdentity();
        clearAuth();
        setIdentityState(null);
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
