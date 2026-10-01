import { useEffect } from 'react';

// SPEC.md section 9 (REG-035): screens where the user may be typing. While
// any is open, a new app version never reloads the page by itself.
const holders = new Set();
const listeners = new Set();

export function isTyping() {
  return holders.size > 0;
}

export function onTypingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn(isTyping()));
}

// Call in a screen's component: it counts as "typing" while it's open.
export function useBlocksAutoUpdate() {
  useEffect(() => {
    const token = {};
    holders.add(token);
    notify();
    return () => {
      holders.delete(token);
      notify();
    };
  }, []);
}
