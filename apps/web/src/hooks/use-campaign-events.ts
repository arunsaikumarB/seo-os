/**
 * P1 — Prefer SSE campaign events via fetch stream (auth headers).
 * Falls back silently; adaptive polling remains the source of truth.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { useAppStore } from '@/stores/app-store';

export function useCampaignEvents(projectId: string, enabled = true) {
  const qc = useQueryClient();
  const { getAccessToken } = useAuth();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !projectId) return;
    const ac = new AbortController();
    abortRef.current = ac;
    let closed = false;

    (async () => {
      try {
        const token = await getAccessToken();
        const orgId = useAppStore.getState().currentOrgId;
        if (!token || !orgId) return;
        const base = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';
        const res = await fetch(`${base}/v1/projects/${projectId}/backlink-builder/events`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Org-Id': orgId,
            Accept: 'text/event-stream',
          },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const chunk of parts) {
            if (chunk.includes('event: campaign')) {
              void qc.invalidateQueries({ queryKey: ['campaign-health', projectId] });
              void qc.invalidateQueries({ queryKey: ['execution-summary', projectId] });
            }
          }
        }
      } catch {
        /* aborted or unavailable — polling continues */
      }
    })();

    return () => {
      closed = true;
      ac.abort();
      abortRef.current = null;
    };
  }, [projectId, enabled, getAccessToken, qc]);
}
