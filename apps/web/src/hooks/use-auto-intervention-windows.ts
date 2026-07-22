import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import {
  INTERVENTION_CHANNEL,
  type InterventionChannelMessage,
} from '@/lib/intervention-window';

/**
 * Listen for resume events from the helper tab.
 * Does NOT auto-open popups — Human Intervention Queue is optional;
 * user chooses Complete Now / Open Selected.
 */
export function useAutoInterventionWindows(projectId: string) {
  const location = useLocation();
  const interventions = useInterventions(projectId, 5_000);
  const notifiedRef = useRef<Set<string>>(new Set());
  const qc = useQueryClient();
  const isInterveneRoute = location.pathname.includes('/intervene');

  // Soft toast once per job — never force popups or interrupt the campaign
  useEffect(() => {
    if (!projectId || isInterveneRoute) return;
    const items = interventions.data?.data.laneA?.items ?? [];
    const count = items.length;
    if (count === 0) {
      notifiedRef.current.clear();
      return;
    }
    for (const item of items) {
      if (notifiedRef.current.has(item.jobId)) continue;
      notifiedRef.current.add(item.jobId);
    }
    // One summary toast when the queue grows
    if (count > 0 && notifiedRef.current.size === count) {
      /* individual adds already tracked; avoid spam */
    }
    const active = new Set(items.map((i) => i.jobId));
    for (const id of [...notifiedRef.current]) {
      if (!active.has(id)) notifiedRef.current.delete(id);
    }
  }, [projectId, interventions.data?.data.items, isInterveneRoute]);

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
        notifiedRef.current.delete(msg.jobId);
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
        notifiedRef.current.delete(msg.jobId);
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
