import { useEffect } from 'react';

export function useKeyboardShortcut(key: string, handler: () => void) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (
        e.key === key &&
        !e.metaKey &&
        !e.ctrlKey &&
        (e.target as HTMLElement).tagName !== 'INPUT'
      ) {
        handler();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [key, handler]);
}
