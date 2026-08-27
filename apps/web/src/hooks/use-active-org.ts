import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { isLiveOrgId, resolveLiveOrgId } from '@/lib/org-id';
import { useAppStore } from '@/stores/app-store';

/** Resolves the org id that is safe to use for live API calls. */
export function useActiveOrg() {
  const { fetchMe } = useApi();
  const { currentOrgId, demoMode } = useAppStore();

  const { data, isLoading, isFetched } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !demoMode,
  });

  const memberships = useMemo(
    () => data?.data.organizations ?? [],
    [data?.data.organizations]
  );
  const membershipOrgIds = useMemo(
    () => memberships.map((m) => m.org_id).filter(isLiveOrgId),
    [memberships]
  );

  /** Org id for live API mutations (never demo placeholders). */
  const activeOrgId = demoMode
    ? null
    : resolveLiveOrgId(currentOrgId, membershipOrgIds);

  return {
    activeOrgId,
    hasOrganizations: demoMode || membershipOrgIds.length > 0,
    isReady: demoMode || isFetched,
    isLoading: !demoMode && isLoading,
    memberships,
  };
}
