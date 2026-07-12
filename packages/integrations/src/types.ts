/** Integrations Platform — types & provider catalog (v0.98) */

export const INTEGRATION_PROVIDER_KEYS = [
  'google_search_console',
  'google_analytics_4',
  'smtp',
  'gmail',
  'outlook',
  'wordpress',
  'slack',
] as const;

export type IntegrationProviderKey = (typeof INTEGRATION_PROVIDER_KEYS)[number];

export const INTEGRATION_CATEGORIES = [
  'search',
  'analytics',
  'email',
  'cms',
  'notifications',
] as const;

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

export const CONNECTION_STATUSES = [
  'disconnected',
  'connecting',
  'connected',
  'error',
  'revoked',
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const SYNC_MODES = ['full', 'incremental', 'manual', 'scheduled'] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

export interface ProviderCapability {
  id: string;
  label: string;
}

export interface ProviderCatalogEntry {
  key: IntegrationProviderKey;
  name: string;
  description: string;
  category: IntegrationCategory;
  authType: 'oauth' | 'api_key' | 'smtp' | 'webhook' | 'app_password';
  scopes: string[];
  capabilities: ProviderCapability[];
  replaceable: true;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    key: 'google_search_console',
    name: 'Google Search Console',
    description: 'Search performance, queries, pages, devices, index coverage, sitemaps',
    category: 'search',
    authType: 'oauth',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    capabilities: [
      { id: 'properties', label: 'List properties' },
      { id: 'search_performance', label: 'Search performance' },
      { id: 'queries', label: 'Queries' },
      { id: 'pages', label: 'Pages' },
      { id: 'countries', label: 'Countries' },
      { id: 'devices', label: 'Devices' },
      { id: 'index_coverage', label: 'Index coverage' },
      { id: 'sitemap_submit', label: 'Sitemap submission' },
    ],
    replaceable: true,
  },
  {
    key: 'google_analytics_4',
    name: 'Google Analytics 4',
    description: 'Sessions, users, conversions, traffic sources, engagement',
    category: 'analytics',
    authType: 'oauth',
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    capabilities: [
      { id: 'sessions', label: 'Sessions' },
      { id: 'users', label: 'Users' },
      { id: 'conversions', label: 'Conversions' },
      { id: 'traffic_sources', label: 'Traffic sources' },
      { id: 'landing_pages', label: 'Landing pages' },
      { id: 'engagement', label: 'Engagement' },
      { id: 'events', label: 'Events' },
    ],
    replaceable: true,
  },
  {
    key: 'smtp',
    name: 'SMTP',
    description: 'Generic SMTP relay for Outreach Engine',
    category: 'email',
    authType: 'smtp',
    scopes: ['email.send'],
    capabilities: [{ id: 'send', label: 'Send email' }],
    replaceable: true,
  },
  {
    key: 'gmail',
    name: 'Gmail',
    description: 'Gmail OAuth for Outreach Engine',
    category: 'email',
    authType: 'oauth',
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    capabilities: [{ id: 'send', label: 'Send email' }],
    replaceable: true,
  },
  {
    key: 'outlook',
    name: 'Microsoft Outlook',
    description: 'Outlook / Microsoft Graph for Outreach Engine',
    category: 'email',
    authType: 'oauth',
    scopes: ['Mail.Send'],
    capabilities: [{ id: 'send', label: 'Send email' }],
    replaceable: true,
  },
  {
    key: 'wordpress',
    name: 'WordPress',
    description: 'Posts, pages, categories, tags, media — draft publishing only',
    category: 'cms',
    authType: 'app_password',
    scopes: ['posts', 'pages', 'media'],
    capabilities: [
      { id: 'posts', label: 'Posts' },
      { id: 'pages', label: 'Pages' },
      { id: 'categories', label: 'Categories' },
      { id: 'tags', label: 'Tags' },
      { id: 'media', label: 'Media' },
      { id: 'draft_from_ai', label: 'Generate draft posts from AI' },
    ],
    replaceable: true,
  },
  {
    key: 'slack',
    name: 'Slack',
    description: 'Notifications for workflows, SEO alerts, approvals, campaigns',
    category: 'notifications',
    authType: 'webhook',
    scopes: ['chat:write'],
    capabilities: [
      { id: 'notifications', label: 'Notifications' },
      { id: 'workflow_complete', label: 'Workflow completion' },
      { id: 'seo_alerts', label: 'Critical SEO alerts' },
      { id: 'approvals', label: 'Approval requests' },
      { id: 'campaigns', label: 'Campaign events' },
    ],
    replaceable: true,
  },
];

/** Provider contract — every integration implements these operations */
export interface IntegrationProvider {
  readonly key: IntegrationProviderKey;
  connect(input: ConnectInput): Promise<ConnectResult>;
  disconnect(connectionId: string): Promise<void>;
  healthCheck(ctx: ProviderContext): Promise<HealthResult>;
  sync(ctx: ProviderContext, mode: SyncMode): Promise<SyncResult>;
  permissions(ctx: ProviderContext): Promise<string[]>;
  refreshToken(ctx: ProviderContext): Promise<TokenRefreshResult>;
  usageMetrics(ctx: ProviderContext): Promise<UsageMetric[]>;
}

export interface ConnectInput {
  orgId: string;
  workspaceId?: string | null;
  displayName?: string;
  credentials: Record<string, unknown>;
  config?: Record<string, unknown>;
  scopes?: string[];
}

export interface ConnectResult {
  externalAccountId?: string;
  externalAccountLabel?: string;
  scopes: string[];
  config?: Record<string, unknown>;
  credentials: Record<string, unknown>;
}

export interface ProviderContext {
  connectionId: string;
  orgId: string;
  workspaceId?: string | null;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
  cursor?: Record<string, unknown>;
}

export interface HealthResult {
  status: 'healthy' | 'degraded' | 'down';
  message?: string;
  latencyMs?: number;
}

export interface SyncResult {
  recordsUpserted: number;
  snapshots: Array<{ type: string; payload: Record<string, unknown> }>;
  cursor?: Record<string, unknown>;
  conflicts?: Array<{ key: string; detail: string }>;
  usage?: UsageMetric[];
}

export interface TokenRefreshResult {
  credentials: Record<string, unknown>;
  expiresAt?: string;
}

export interface UsageMetric {
  key: string;
  value: number;
  metadata?: Record<string, unknown>;
}
