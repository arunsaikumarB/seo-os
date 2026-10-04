import type { ExtendedEmailProvider } from './types.js';

export interface OAuthEmailConfig {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

/** Sends through the Gmail API. A refresh token alone is not a sent message. */
export function createGmailEmailProvider(config: OAuthEmailConfig): ExtendedEmailProvider {
  return {
    name: 'gmail',
    providerType: 'gmail',
    async send(options) {
      return this.sendExtended(options);
    },
    async sendExtended(options) {
      if (!config.accessToken) {
        throw new Error(
          'Gmail is not connected. Reconnect OAuth so an access token is available. No message was sent.'
        );
      }
      const raw = [
        `To: ${options.to}`,
        `Subject: ${options.subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        options.bodyHtml,
      ].join('\r\n');
      const encoded = Buffer.from(raw)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gmail send failed: ${text}`);
      }
      const json = (await res.json()) as { id?: string };
      if (!json.id) throw new Error('Gmail accepted the request but returned no message id');
      return { messageId: json.id };
    },
  };
}
