import { useEffect, useRef } from 'react';

// SPEC.md 26.1: the phone's "back" (Android button or gesture; the browser's
// back on a computer) closes the window on top - a form, the share window,
// a zoomed photo, a confirmation, the ⚙ menu - instead of leaving the app.
//
// Each open window adds one step to the browser history. "Back" takes the
// top step and closes that window. A window closed by its own button gives
// its step back, so the next "back" is never spent on a window that's gone.
//
// `onClose` may return false: the window stayed open (e.g. a form asked
// about unsaved changes) - it then keeps a step for the next "back".

const stack = []; // open windows, top last
let depth = 0; // how many of our steps are in the browser history now
let skipPops = 0; // history moves we made ourselves - not a user's "back"
let resyncQueued = false;
let listening = false;

function push(entry) {
  window.history.pushState({ backClose: entry.id }, '');
  depth += 1;
  stack.push(entry);
}

function onPopState() {
  if (skipPops > 0) {
    skipPops -= 1;
    return;
  }
  depth = Math.max(0, depth - 1);
  const top = stack.pop();
  if (!top) return;
  if (top.close() === false) push(top);
}

// Windows closed by their buttons (possibly several at once, possibly with a
// new one opening in the same moment): drop the extra steps in one move.
function resync() {
  resyncQueued = false;
  const extra = depth - stack.length;
  if (extra > 0) {
    depth = stack.length;
    skipPops += 1;
    window.history.go(-extra);
  }
}

export function useBackToClose(onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }
    const entry = { id: Math.random().toString(36).slice(2), close: () => closeRef.current() };
    push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i === -1) return; // closed by "back" - its step is already gone
      stack.splice(i, 1);
      if (!resyncQueued) {
        resyncQueued = true;
        queueMicrotask(resync);
      }
    };
  }, []);
}

// For a window that is part of a component that's always there (the ⚙ menu):
// render this only while it's open.
export function BackStep({ onClose }) {
  useBackToClose(onClose);
  return null;
}
