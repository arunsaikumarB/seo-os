import { useAuth } from '@/providers/auth-provider';
import { useAppStore } from '@/stores/app-store';
import { apiFetch } from '@/lib/api';
import { useCallback } from 'react';
import type { Organization, Profile, Project } from '@seo-os/shared';

interface MeResponse {
  data: {
    user: Profile | null;
    organizations: Array<{
      role: string;
      org_id: string;
      organizations: Organization;
    }>;
  };
}

interface ApiData<T> {
  data: T;
}

export function useApi() {
  const { getAccessToken } = useAuth();
  const currentOrgId = useAppStore((s) => s.currentOrgId);

  const request = useCallback(
    async <T>(path: string, options: RequestInit & { orgId?: string | null } = {}): Promise<T> => {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return apiFetch<T>(path, {
        ...options,
        token,
        orgId: options.orgId ?? currentOrgId ?? undefined,
      });
    },
    [getAccessToken, currentOrgId]
  );

  const fetchMe = useCallback(() => request<MeResponse>('/v1/me'), [request]);

  const fetchProjects = useCallback(
    (orgId: string) =>
      request<ApiData<Project[]>>(`/v1/organizations/${orgId}/projects`, { orgId }),
    [request]
  );

  const createOrganization = useCallback(
    (body: { name: string; slug: string; industry?: string }) =>
      request<ApiData<Organization>>('/v1/organizations', {
        method: 'POST',
        body: JSON.stringify(body),
        orgId: null,
      }),
    [request]
  );

  const createProject = useCallback(
    (orgId: string, body: { name: string; domain: string; url?: string; industry?: string }) =>
      request<ApiData<Project>>(`/v1/organizations/${orgId}/projects`, {
        method: 'POST',
        body: JSON.stringify(body),
        orgId,
      }),
    [request]
  );

  const updateProject = useCallback(
    (projectId: string, body: Record<string, unknown>) =>
      request<ApiData<Project>>(`/v1/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    [request]
  );

  const archiveProject = useCallback(
    (projectId: string) =>
      request<ApiData<Project>>(`/v1/projects/${projectId}/archive`, { method: 'POST' }),
    [request]
  );

  const fetchMembers = useCallback(
    (orgId: string) => request<ApiData<unknown[]>>(`/v1/organizations/${orgId}/members`, { orgId }),
    [request]
  );

  return {
    request,
    fetchMe,
    fetchProjects,
    createOrganization,
    createProject,
    updateProject,
    archiveProject,
    fetchMembers,
  };
}
