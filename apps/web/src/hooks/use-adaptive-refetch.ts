/**
 * P1 — Adaptive refetch intervals: fast when active, back off when idle/hidden.
 * Same data / UI — only polling cadence changes.
 */
import { useEffect, useState } from 'react';

export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  );
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return visible;
}

/** Returns interval ms (or false to pause). */
export function useAdaptiveRefetchInterval(
  activeMs: number,
  idleMs: number,
  isActive: boolean
): number | false {
  const visible = useDocumentVisible();
  if (!visible) return idleMs * 2;
  return isActive ? activeMs : idleMs;
}
