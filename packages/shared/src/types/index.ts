/** Org-level roles (frozen in API Freeze) */
export type OrgRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export type OrgMemberStatus = 'active' | 'invited' | 'suspended';

export type WorkspaceStatus = 'active' | 'paused' | 'archived';

export type DataSource = 'live' | 'estimated' | 'demo';

export type ProviderMode = 'mvp' | 'free' | 'paid';

export interface Profile {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  timezone: string;
  preferences: Record<string, unknown>;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  plan: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  status: OrgMemberStatus;
  joinedAt: string | null;
}

/** API exposes as Project; DB table is workspaces */
export interface Project {
  id: string;
  orgId: string;
  name: string;
  domain: string;
  url: string | null;
  industry: string | null;
  description: string | null;
  status: WorkspaceStatus;
  domainVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiMeta {
  provider?: string;
  isEstimated?: boolean;
  dataSource?: DataSource;
  cost?: string;
}

export interface PaginationMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  limit: number;
  hasMore: boolean;
}

export interface TenantContext {
  userId: string;
  orgId: string;
  orgRole: OrgRole;
  projectId?: string;
  traceId: string;
}
