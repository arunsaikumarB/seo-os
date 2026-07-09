import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';

/** Sets default org from /me when user authenticates */
export function OrgBootstrap({ children }: { children: React.ReactNode }) {
  const { fetchMe } = useApi();
  const { currentOrgId, setCurrentOrgId } = useAppStore();

  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  useEffect(() => {
    const memberships = data?.data.organizations ?? [];
    if (!memberships.length) return;

    const validOrgIds = new Set(memberships.map((m) => m.org_id));
    const hasValidOrg = currentOrgId && validOrgIds.has(currentOrgId);

    if (!hasValidOrg) {
      setCurrentOrgId(memberships[0].org_id);
    }
  }, [currentOrgId, data, setCurrentOrgId]);

  return <>{children}</>;
}
