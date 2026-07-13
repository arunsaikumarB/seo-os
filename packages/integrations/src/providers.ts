import type {
  ConnectInput,
  ConnectResult,
  HealthResult,
  IntegrationProvider,
  IntegrationProviderKey,
  ProviderContext,
  SyncMode,
  SyncResult,
  TokenRefreshResult,
  UsageMetric,
} from './types.js';

function baseConnect(
  key: IntegrationProviderKey,
  input: ConnectInput,
  label: string
): ConnectResult {
  const externalAccountId =
    String(input.credentials.accountId ?? input.credentials.siteUrl ?? input.credentials.email ?? `${key}-account`);
  return {
    externalAccountId,
    externalAccountLabel: String(input.displayName ?? input.credentials.label ?? label),
    scopes: input.scopes ?? [],
    config: input.config ?? {},
    credentials: { ...input.credentials, connectedAt: new Date().toISOString() },
  };
}

function healthy(message: string): HealthResult {
  return { status: 'healthy', message, latencyMs: 12 + Math.floor(Math.random() * 40) };
}

function usage(key: string, value: number): UsageMetric {
  return { key, value };
}

export function createStubProvider(
  key: IntegrationProviderKey,
  label: string,
  syncFactory: (ctx: ProviderContext, mode: SyncMode) => SyncResult
): IntegrationProvider {
  return {
    key,
    async connect(input) {
      return baseConnect(key, input, label);
    },
    async disconnect() {
      /* no-op remote revoke in stub */
    },
    async healthCheck(ctx) {
      if (!ctx.credentials || Object.keys(ctx.credentials).length === 0) {
        return { status: 'down', message: 'Missing credentials' };
      }
      return healthy(`${label} reachable`);
    },
    async sync(ctx, mode) {
      return syncFactory(ctx, mode);
    },
    async permissions(ctx) {
      return (ctx.config.scopes as string[]) ?? [];
    },
    async refreshToken(ctx): Promise<TokenRefreshResult> {
      return {
        credentials: {
          ...ctx.credentials,
          accessToken: `refreshed-${Date.now()}`,
          refreshedAt: new Date().toISOString(),
        },
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };
    },
    async usageMetrics(ctx) {
      return [usage('api_calls', Number(ctx.config.apiCalls ?? 0))];
    },
  };
}

export const gscProvider = createStubProvider('google_search_console', 'Google Search Console', () => ({
  recordsUpserted: 6,
  snapshots: [
    {
      type: 'search_performance',
      payload: {
        clicks: 1240,
        impressions: 48200,
        ctr: 0.0257,
        position: 18.4,
        queries: [
          { query: 'seo automation', clicks: 120, impressions: 3400, position: 8.2 },
          { query: 'backlink builder', clicks: 88, impressions: 2100, position: 11.5 },
        ],
        pages: [{ page: '/', clicks: 400, impressions: 9000 }],
        countries: [{ country: 'usa', clicks: 600 }],
        devices: [
          { device: 'DESKTOP', clicks: 700 },
          { device: 'MOBILE', clicks: 540 },
        ],
        indexCoverage: { valid: 420, excluded: 38, error: 4 },
      },
    },
  ],
  cursor: { lastRow: 'performance', syncedAt: new Date().toISOString() },
  usage: [usage('api_calls', 6)],
}));

export const ga4Provider = createStubProvider('google_analytics_4', 'Google Analytics 4', () => ({
  recordsUpserted: 7,
  snapshots: [
    {
      type: 'ga4_overview',
      payload: {
        sessions: 8200,
        users: 6400,
        conversions: 214,
        engagementRate: 0.61,
        trafficSources: [
          { source: 'organic', sessions: 4100 },
          { source: 'direct', sessions: 1800 },
          { source: 'referral', sessions: 1200 },
        ],
        landingPages: [{ page: '/', sessions: 2100 }],
        events: [{ name: 'page_view', count: 22000 }],
      },
    },
  ],
  cursor: { syncedAt: new Date().toISOString() },
  usage: [usage('api_calls', 5)],
}));

export const smtpProvider = createStubProvider('smtp', 'SMTP', () => ({
  recordsUpserted: 1,
  snapshots: [{ type: 'email_health', payload: { relay: 'ok', provider: 'smtp' } }],
  usage: [usage('sends', 0)],
}));

export const gmailProvider: IntegrationProvider = {
  ...createStubProvider('gmail', 'Gmail', () => ({
    recordsUpserted: 0,
    snapshots: [],
    usage: [usage('sends', 0)],
  })),
  async connect(input) {
    const hasOAuth =
      Boolean(input.credentials.accessToken) ||
      Boolean(input.credentials.refreshToken) ||
      (Boolean(input.credentials.oauthCode) &&
        String(input.credentials.oauthCode) !== 'demo-connect');
    if (!hasOAuth) {
      throw new Error('OAuth credentials required (V1.1) — Gmail send is deferred until OAuth is configured');
    }
    return baseConnect('gmail', input, 'Gmail');
  },
};

export const outlookProvider: IntegrationProvider = {
  ...createStubProvider('outlook', 'Outlook', () => ({
    recordsUpserted: 0,
    snapshots: [],
    usage: [usage('sends', 0)],
  })),
  async connect(input) {
    const hasOAuth =
      Boolean(input.credentials.accessToken) ||
      Boolean(input.credentials.refreshToken) ||
      (Boolean(input.credentials.oauthCode) &&
        String(input.credentials.oauthCode) !== 'demo-connect');
    if (!hasOAuth) {
      throw new Error(
        'OAuth credentials required (V1.1) — Outlook send is deferred until OAuth is configured'
      );
    }
    return baseConnect('outlook', input, 'Outlook');
  },
};

export const wordpressProvider = createStubProvider('wordpress', 'WordPress', (ctx) => ({
  recordsUpserted: 5,
  snapshots: [
    {
      type: 'wordpress_catalog',
      payload: {
        siteUrl: ctx.config.siteUrl ?? ctx.credentials.siteUrl,
        posts: 12,
        pages: 4,
        categories: ['SEO', 'Growth'],
        tags: ['backlinks', 'technical'],
        media: 28,
        draftsFromAi: [],
      },
    },
  ],
  usage: [usage('api_calls', 4)],
}));

export const slackProvider = createStubProvider('slack', 'Slack', () => ({
  recordsUpserted: 1,
  snapshots: [
    {
      type: 'slack_channel',
      payload: { notificationsEnabled: true, events: ['workflow', 'seo_alert', 'approval', 'campaign'] },
    },
  ],
  usage: [usage('messages', 0)],
}));

const REGISTRY: Record<IntegrationProviderKey, IntegrationProvider> = {
  google_search_console: gscProvider,
  google_analytics_4: ga4Provider,
  smtp: smtpProvider,
  gmail: gmailProvider,
  outlook: outlookProvider,
  wordpress: wordpressProvider,
  slack: slackProvider,
};

export function getIntegrationProvider(key: IntegrationProviderKey): IntegrationProvider {
  const p = REGISTRY[key];
  if (!p) throw new Error(`Unknown integration provider: ${key}`);
  return p;
}

export function listIntegrationProviders(): IntegrationProvider[] {
  return Object.values(REGISTRY);
}
