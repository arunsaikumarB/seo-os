import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import {
  INTERVENTION_CHANNEL,
  openInterventionWindow,
  type InterventionChannelMessage,
} from '@/lib/intervention-window';

/**
 * Auto-open the helper window when AI needs the user.
 * Real website opens from the helper — never embeds Playwright.
 * Listens for resume events from the helper tab.
 */
export function useAutoInterventionWindows(projectId: string) {
  const location = useLocation();
  const interventions = useInterventions(projectId, 2_500);
  const openedRef = useRef<Set<string>>(new Set());
  const qc = useQueryClient();
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
          description: `${item.website} — complete the step in your browser.`,
          duration: 6_000,
        });
      } else {
        toast.message('AI needs your help', {
          description: `${item.website} — allow pop-ups, then click Open Browser.`,
          duration: 10_000,
        });
      }
    }
    const active = new Set(items.map((i) => i.jobId));
    for (const id of [...openedRef.current]) {
      if (!active.has(id)) openedRef.current.delete(id);
    }
  }, [projectId, interventions.data?.data.items, isInterveneRoute]);

  // Main SEO OS window: progress toast when helper detects resume
  useEffect(() => {
    if (!projectId || isInterveneRoute) return;
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(INTERVENTION_CHANNEL);
      ch.onmessage = (ev: MessageEvent<InterventionChannelMessage>) => {
        const msg = ev.data;
        if (!msg || msg.type !== 'resumed' || msg.projectId !== projectId) return;
        toast.success(msg.message || 'AI resumed — continuing submissions');
        qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
        qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
        qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
        openedRef.current.delete(msg.jobId);
      };
    } catch {
      /* ignore */
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'seo-os-intervention-resumed' || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as {
          projectId: string;
          jobId: string;
          message?: string;
        };
        if (msg.projectId !== projectId) return;
        toast.success(msg.message || 'AI resumed — continuing submissions');
        qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
        qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
        qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
        openedRef.current.delete(msg.jobId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      ch?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [projectId, isInterveneRoute, qc]);
}
