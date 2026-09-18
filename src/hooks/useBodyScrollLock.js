import { useEffect } from 'react';

// Freezes background scroll while a full-screen overlay (item form, delete
// confirm, config manager) is mounted - without this, touch/wheel input
// that lands outside the overlay's own card still scrolls the item list
// behind it. Saves/restores whatever was there before, so nested overlays
// (e.g. delete-confirm opened from within the item form) stack correctly.
export function useBodyScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}
