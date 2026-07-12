import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** Lightweight offline banner for closed-beta stability */
export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-500/15 text-amber-800 dark:text-amber-200 px-3 py-2 text-sm border-b"
    >
      <WifiOff className="h-4 w-4" />
      You are offline. Changes will sync when connectivity returns.
    </div>
  );
}
