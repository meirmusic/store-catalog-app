// "Who are you" - separate from the sign-in gate (IdentityContext).
// The gallery's whole staff shares one office login for access control;
// this context is only for attributing changes to a real person
// (last_modified_by) once signed in. See task #28 v2.
import { createContext, useContext, useMemo, useState } from 'react';

const STORAGE_KEY = 'gallery_team_member';

const TeamMemberContext = createContext(null);

function readStoredMember() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Any remembered name counts - team names are no longer only the
    // built-in ones (SPEC.md section 15), and this is attribution only.
    if (stored && stored.trim()) return stored;
  } catch {
    // ignore - localStorage unavailable
  }
  return null;
}

export function TeamMemberProvider({ children }) {
  const [member, setMemberState] = useState(readStoredMember);

  const value = useMemo(
    () => ({
      member,
      setMember: (name) => {
        setMemberState(name);
        try {
          localStorage.setItem(STORAGE_KEY, name);
        } catch {
          // ignore
        }
      },
      clearMember: () => {
        setMemberState(null);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      },
    }),
    [member],
  );

  return <TeamMemberContext.Provider value={value}>{children}</TeamMemberContext.Provider>;
}

export function useTeamMember() {
  const ctx = useContext(TeamMemberContext);
  if (!ctx) throw new Error('useTeamMember must be used within a TeamMemberProvider');
  return ctx;
}
