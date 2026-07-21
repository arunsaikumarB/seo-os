import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { openInterventionWindow } from '@/lib/intervention-window';

/**
 * When AI pauses a website for login/CAPTCHA/OTP/etc., open a focused
 * intervention browser window automatically (GitHub OAuth / Stripe style).
 */
export function useAutoInterventionWindows(projectId: string) {
  const location = useLocation();
  const interventions = useInterventions(projectId, 2_500);
  const openedRef = useRef<Set<string>>(new Set());
  const isInterveneRoute = location.pathname.includes('/intervene');

  useEffect(() => {
    if (!projectId || isInterveneRoute) return;
    const items = interventions.data?.data.items ?? [];
    for (const item of items) {
      if (openedRef.current.has(item.jobId)) continue;
      openedRef.current.add(item.jobId);
      const win = openInterventionWindow(projectId, item.jobId);
      if (win) {
        toast.message('AI needs your help', {
          description: `${item.website} — ${item.reason}. A browser window opened.`,
          duration: 6_000,
        });
      } else {
        toast.message('AI needs your help', {
          description: `${item.website} — ${item.reason}. Allow pop-ups, then click Open Browser.`,
          duration: 10_000,
        });
      }
    }
    // Drop cleared job ids so a future pause can reopen
    const active = new Set(items.map((i) => i.jobId));
    for (const id of [...openedRef.current]) {
      if (!active.has(id)) openedRef.current.delete(id);
    }
  }, [projectId, interventions.data?.data.items, isInterveneRoute]);
}
