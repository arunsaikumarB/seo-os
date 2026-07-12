import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
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
  const validOrgIds = useMemo(() => new Set(memberships.map((m) => m.org_id)), [memberships]);

  const activeOrgId =
    demoMode || (currentOrgId && validOrgIds.has(currentOrgId))
      ? currentOrgId
      : (memberships[0]?.org_id ?? null);

  return {
    activeOrgId,
    hasOrganizations: demoMode || memberships.length > 0,
    isReady: demoMode || isFetched,
    isLoading: !demoMode && isLoading,
    memberships,
  };
}
