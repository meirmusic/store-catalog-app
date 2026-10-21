import { useSyncExternalStore } from 'react';

// SPEC.md 32.7: "export to Excel" moved to the ⚙ menu, but it still exports
// exactly what the catalog shows (search, filters and sort) - the list sets
// it here and the menu reads it. null = the catalog isn't on screen yet.
let visible = null;
const listeners = new Set();

export function setVisibleItems(items) {
  if (items === visible) return;
  visible = items;
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useVisibleItems() {
  return useSyncExternalStore(subscribe, () => visible);
}
