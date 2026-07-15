import { useCallback, useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  useApprovedOpportunities,
  type SelectedOpportunity,
} from '@/components/opportunities/opportunity-selector';

type OpportunitySnapshot = SelectedOpportunity;

interface CurrentOpportunityState {
  /** Persisted per-project active opportunity — survives navigation until user changes it */
  byProject: Record<string, OpportunitySnapshot | null>;
  setOpportunity: (projectId: string, opp: OpportunitySnapshot | null) => void;
  clearOpportunity: (projectId: string) => void;
}

export const useCurrentOpportunityStore = create<CurrentOpportunityState>()(
  persist(
    (set) => ({
      byProject: {},
      setOpportunity: (projectId, opp) =>
        set((s) => ({
          byProject: { ...s.byProject, [projectId]: opp },
        })),
      clearOpportunity: (projectId) =>
        set((s) => ({
          byProject: { ...s.byProject, [projectId]: null },
        })),
    }),
    { name: 'seo-os-current-opportunity' }
  )
);

/**
 * Shared Current Opportunity Context for Opportunity Queue, Content Studio,
 * Image / Video Studio, Browser Assistant, Submission Center, and Execution Center.
 */
export function useCurrentOpportunity(projectId: string) {
  const stored = useCurrentOpportunityStore((s) => s.byProject[projectId] ?? null);
  const setStored = useCurrentOpportunityStore((s) => s.setOpportunity);
  const clearStored = useCurrentOpportunityStore((s) => s.clearOpportunity);
  const approved = useApprovedOpportunities(projectId);
  const items = approved.data?.data ?? [];

  /** Live row from approved list when still present; otherwise keep snapshot until cleared */
  const opportunity = useMemo(() => {
    if (!stored) return null;
    const live = items.find((o) => o.id === stored.id);
    return live ?? stored;
  }, [stored, items]);

  // Refresh snapshot when approved list updates the same id
  useEffect(() => {
    if (!stored || !items.length) return;
    const live = items.find((o) => o.id === stored.id);
    if (!live) return;
    const changed =
      live.score !== stored.score ||
      live.readiness !== stored.readiness ||
      live.has_content_pack !== stored.has_content_pack ||
      live.status !== stored.status ||
      live.website !== stored.website;
    if (changed) setStored(projectId, live);
  }, [items, stored, projectId, setStored]);

  const setOpportunity = useCallback(
    (opp: SelectedOpportunity | null) => {
      if (!projectId) return;
      if (opp) setStored(projectId, opp);
      else clearStored(projectId);
    },
    [projectId, setStored, clearStored]
  );

  const clearOpportunity = useCallback(() => {
    if (projectId) clearStored(projectId);
  }, [projectId, clearStored]);

  return {
    opportunity,
    opportunityId: opportunity?.id ?? null,
    setOpportunity,
    clearOpportunity,
    approvedItems: items,
    approvedLoading: approved.isLoading,
    approvedQuery: approved,
  };
}
