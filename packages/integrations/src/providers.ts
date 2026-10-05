import type {
  ConnectInput,
  ConnectResult,
  IntegrationProvider,
  IntegrationProviderKey,
  SyncResult,
  TokenRefreshResult,
  UsageMetric,
} from './types.js';

function baseConnect(
  key: IntegrationProviderKey,
  input: ConnectInput,
  label: string
): ConnectResult {
  const externalAccountId = String(
    input.credentials.accountId ?? input.credentials.siteUrl ?? input.credentials.email ?? ''
  );
  if (!externalAccountId) {
    throw new Error(`${label} (${key}) is not connected. No account id was provided.`);
  }
  return {
    externalAccountId,
    externalAccountLabel: String(input.displayName ?? input.credentials.label ?? label),
    scopes: input.scopes ?? [],
    config: input.config ?? {},
    credentials: { ...input.credentials, connectedAt: new Date().toISOString() },
  };
}

function notConnectedSync(): SyncResult {
  return { recordsUpserted: 0, snapshots: [] };
}

function usage(key: string, value: number): UsageMetric {
  return { key, value };
}

export function createStubProvider(key: IntegrationProviderKey, label: string): IntegrationProvider {
  return {
    key,
    async connect(input) {
      return baseConnect(key, input, label);
    },
    async disconnect() {
      /* no-op remote revoke in stub */
    },
    async healthCheck() {
      return { status: 'down', message: 'not connected' };
    },
    async sync() {
      return notConnectedSync();
    },
    async permissions(ctx) {
      return (ctx.config.scopes as string[]) ?? [];
    },
    async refreshToken(): Promise<TokenRefreshResult> {
      throw new Error(`${label} is not connected. No token was refreshed.`);
    },
    async usageMetrics(ctx) {
      return [usage('api_calls', Number(ctx.config.apiCalls ?? 0))];
    },
  };
}

export const gscProvider = createStubProvider('google_search_console', 'Google Search Console');

export const ga4Provider = createStubProvider('google_analytics_4', 'Google Analytics 4');

export const smtpProvider = createStubProvider('smtp', 'SMTP');

export const gmailProvider: IntegrationProvider = {
  ...createStubProvider('gmail', 'Gmail'),
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
  ...createStubProvider('outlook', 'Outlook'),
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

export const wordpressProvider = createStubProvider('wordpress', 'WordPress');

export const slackProvider = createStubProvider('slack', 'Slack');

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
