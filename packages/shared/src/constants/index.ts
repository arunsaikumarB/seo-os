export const APP_NAME = 'SEO OS';
export const APP_TAGLINE = 'The AI Workforce for SEO Teams';

export const API_VERSION = 'v1';

export const ORG_ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'] as const;

export const ROLE_HIERARCHY: Record<string, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

export const WORKSPACE_STATUSES = ['active', 'paused', 'archived'] as const;

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
