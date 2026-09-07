import { createContext, useContext, useMemo, useState } from 'react';
import { TEAM_NAMES } from '../config/seed';

const STORAGE_KEY = 'gallery_user';

const IdentityContext = createContext(null);

function readStoredUser() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && TEAM_NAMES.includes(stored)) return stored;
  } catch {
    // ignore - localStorage unavailable
  }
  return null;
}

export function IdentityProvider({ children }) {
  const [user, setUserState] = useState(readStoredUser);

  const value = useMemo(
    () => ({
      user,
      setUser: (name) => {
        setUserState(name);
        try {
          localStorage.setItem(STORAGE_KEY, name);
        } catch {
          // ignore
        }
      },
      clearUser: () => {
        setUserState(null);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      },
    }),
    [user],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity must be used within an IdentityProvider');
  return ctx;
}
