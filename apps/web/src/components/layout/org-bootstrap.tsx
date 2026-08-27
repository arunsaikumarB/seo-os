import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { isDemoOrgId, isLiveOrgId, resolveLiveOrgId } from '@/lib/org-id';
import { useAppStore } from '@/stores/app-store';

/** Sets default org from /me when user authenticates */
export function OrgBootstrap({ children }: { children: React.ReactNode }) {
  const { fetchMe } = useApi();
  const currentOrgId = useAppStore((s) => s.currentOrgId);
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setCurrentOrgId = useAppStore((s) => s.setCurrentOrgId);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const demoMode = useAppStore((s) => s.demoMode);

  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !demoMode,
  });

  // Leaving demo mode (or stale persisted demo ids) must not leak into live API calls.
  useEffect(() => {
    if (demoMode) return;
    if (isDemoOrgId(currentOrgId) || (currentOrgId && !isLiveOrgId(currentOrgId))) {
      setCurrentOrgId(null);
    }
    if (currentProjectId?.startsWith('demo-')) {
      setCurrentProjectId(null);
    }
  }, [demoMode, currentOrgId, currentProjectId, setCurrentOrgId, setCurrentProjectId]);

  useEffect(() => {
    if (demoMode) return;
    // Wait for /me — empty array while loading must not wipe org/project
    if (!data) return;

    const memberships = data.data.organizations ?? [];
    const membershipOrgIds = memberships.map((m) => m.org_id).filter(isLiveOrgId);

    if (!membershipOrgIds.length) {
      if (currentOrgId) setCurrentOrgId(null);
      setCurrentProjectId(null);
      return;
    }

    const resolved = resolveLiveOrgId(currentOrgId, membershipOrgIds);
    if (resolved !== currentOrgId) {
      setCurrentOrgId(resolved);
      setCurrentProjectId(null);
    }
  }, [currentOrgId, data, demoMode, setCurrentOrgId, setCurrentProjectId]);

  return <>{children}</>;
}
