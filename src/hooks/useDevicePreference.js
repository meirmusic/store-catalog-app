import { useState } from 'react';

// A choice remembered on this device only (SPEC.md 19: sort, list view,
// summary line). Storage can be unavailable - then it just isn't remembered.
export function useDevicePreference(key, initial, allowed) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored != null && (!allowed || allowed.includes(stored))) return stored;
    } catch {
      // ignore
    }
    return initial;
  });
  function update(next) {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // ignore
    }
  }
  return [value, update];
}
