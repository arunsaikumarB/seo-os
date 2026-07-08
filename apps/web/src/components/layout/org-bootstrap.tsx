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
    if (!currentOrgId && data?.data.organizations?.length) {
      setCurrentOrgId(data.data.organizations[0].org_id);
    }
  }, [currentOrgId, data, setCurrentOrgId]);

  return <>{children}</>;
}
