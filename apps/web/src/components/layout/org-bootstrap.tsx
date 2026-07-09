import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';

/** Sets default org from /me when user authenticates */
export function OrgBootstrap({ children }: { children: React.ReactNode }) {
  const { fetchMe } = useApi();
  const { currentOrgId, setCurrentOrgId, setCurrentProjectId, demoMode } = useAppStore();

  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !demoMode,
  });

  useEffect(() => {
    if (demoMode) return;

    const memberships = data?.data.organizations ?? [];
    if (!memberships.length) {
      if (currentOrgId) setCurrentOrgId(null);
      setCurrentProjectId(null);
      return;
    }

    const validOrgIds = new Set(memberships.map((m) => m.org_id));
    const hasValidOrg = currentOrgId && validOrgIds.has(currentOrgId);

    if (!hasValidOrg) {
      setCurrentOrgId(memberships[0].org_id);
      setCurrentProjectId(null);
    }
  }, [currentOrgId, data, demoMode, setCurrentOrgId, setCurrentProjectId]);

  return <>{children}</>;
}
