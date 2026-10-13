import { useEffect, useRef } from 'react';

// Runs onOpen once when a window opens and onClose once when it's really
// gone - for counting (SPEC.md 29). React's development mode mounts every
// component twice on purpose; this keeps that from counting an extra
// "opened" and a "closed" that never happened.
export function useOpenClose(onOpen, onClose) {
  const state = useRef({ opened: false, alive: false, closed: false });
  useEffect(() => {
    const s = state.current;
    s.alive = true;
    if (!s.opened) {
      s.opened = true;
      onOpen?.();
    }
    return () => {
      s.alive = false;
      setTimeout(() => {
        if (!s.alive && !s.closed) {
          s.closed = true;
          onClose?.();
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
