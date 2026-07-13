import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { storeIntegrationCredentials } from './integrations.service.js';
import { logger } from '../../lib/logger.js';

type OAuthProvider = 'google' | 'microsoft';

function oauthConfig(provider: OAuthProvider) {
  const env = process.env;
  if (provider === 'google') {
    return {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      redirectUri:
        env.GOOGLE_OAUTH_REDIRECT_URI ??
        `${env.API_URL ?? 'http://localhost:3001'}/v1/integrations/oauth/google/callback`,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'openid',
        'email',
      ].join(' '),
      providerKey: 'gmail' as const,
    };
  }
  return {
    clientId: env.MICROSOFT_OAUTH_CLIENT_ID ?? '',
    clientSecret: env.MICROSOFT_OAUTH_CLIENT_SECRET ?? '',
    redirectUri:
      env.MICROSOFT_OAUTH_REDIRECT_URI ??
      `${env.API_URL ?? 'http://localhost:3001'}/v1/integrations/oauth/microsoft/callback`,
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['offline_access', 'openid', 'email', 'Mail.Send', 'Mail.Read'].join(' '),
    providerKey: 'outlook' as const,
  };
}

export function buildOAuthStartUrl(
  provider: OAuthProvider,
  state: { workspaceId: string; userId: string; orgId: string }
) {
  const cfg = oauthConfig(provider);
  if (!cfg.clientId || !cfg.clientSecret) {
    throw Object.assign(
      new Error(
        `OAuth credentials required — set ${provider === 'google' ? 'GOOGLE_OAUTH_CLIENT_ID/SECRET' : 'MICROSOFT_OAUTH_CLIENT_ID/SECRET'} (V1.1)`
      ),
      { status: 400, code: 'OAUTH_NOT_CONFIGURED' }
    );
  }
  const stateToken = Buffer.from(JSON.stringify(state)).toString('base64url');
  const url = new URL(cfg.authUrl);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.scopes);
  url.searchParams.set('state', stateToken);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return { url: url.toString(), state: stateToken };
}

export async function handleOAuthCallback(
  provider: OAuthProvider,
  code: string,
  stateToken: string
) {
  const cfg = oauthConfig(provider);
  if (!cfg.clientId || !cfg.clientSecret) {
    throw Object.assign(new Error('OAuth not configured'), { status: 400 });
  }
  const state = JSON.parse(Buffer.from(stateToken, 'base64url').toString('utf8')) as {
    workspaceId: string;
    userId: string;
    orgId: string;
  };

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    logger.error({ provider, text }, 'OAuth token exchange failed');
    throw Object.assign(new Error('OAuth token exchange failed'), { status: 400 });
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const connectionId = randomUUID();
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const { data: connection, error } = await getSupabaseAdmin()
    .from('integration_connections')
    .insert({
      id: connectionId,
      org_id: state.orgId,
      workspace_id: state.workspaceId,
      provider_key: cfg.providerKey,
      display_name: provider === 'google' ? 'Gmail' : 'Outlook',
      status: 'connected',
      auth_type: 'oauth',
      scopes: (tokens.scope ?? cfg.scopes).split(/[\s,]+/).filter(Boolean),
      health_status: 'healthy',
      health_message: 'OAuth connected',
      last_health_at: new Date().toISOString(),
      connected_by: state.userId,
      connected_at: new Date().toISOString(),
      last_inbox_sync_at: null,
    })
    .select('*')
    .single();
  if (error) throw error;

  await storeIntegrationCredentials(connectionId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    provider,
  });

  await getSupabaseAdmin().from('email_accounts').insert({
    id: randomUUID(),
    workspace_id: state.workspaceId,
    label: provider === 'google' ? 'Gmail' : 'Outlook',
    provider_type: cfg.providerKey,
    from_email: `${cfg.providerKey}@oauth.local`,
    from_name: provider === 'google' ? 'Gmail' : 'Outlook',
    oauth_provider: provider,
    token_expires_at: expiresAt,
    status: 'active',
    config: { connectionId },
  });

  return { connection, provider };
}

export async function sendViaOAuthProvider(input: {
  provider: 'gmail' | 'outlook';
  accessToken: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}) {
  if (input.provider === 'gmail') {
    const raw = [
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      input.bodyHtml,
    ].join('\r\n');
    const encoded = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gmail send failed: ${text}`);
    }
    const json = (await res.json()) as { id: string };
    return { messageId: json.id };
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: 'HTML', content: input.bodyHtml },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook send failed: ${text}`);
  }
  return { messageId: `outlook-${Date.now()}` };
}

export async function suggestReplyDraft(input: {
  threadSubject: string;
  lastMessageHtml?: string;
  brandName?: string;
}) {
  return {
    subject: `Re: ${input.threadSubject}`,
    bodyHtml: `<p>Thanks for your reply.</p><p>${(input.lastMessageHtml ?? '').slice(0, 200)}</p><p>Happy to continue the conversation.</p><p>Best regards,<br/>${input.brandName ?? 'Our team'}</p>`,
    metricsSource: 'estimated' as const,
    note: 'AI reply suggestion — review before sending',
  };
}

// silence unused — reserved for API_URL helpers
export {};
