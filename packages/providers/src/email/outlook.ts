import type { ExtendedEmailProvider } from './types.js';
import type { OAuthEmailConfig } from './gmail.js';

/**
 * Microsoft Graph sendMail returns 202 and no message id.
 * The id is null. It is not invented.
 */
export function createOutlookEmailProvider(config: OAuthEmailConfig): ExtendedEmailProvider {
  return {
    name: 'outlook',
    providerType: 'outlook',
    async send(options) {
      return this.sendExtended(options);
    },
    async sendExtended(options) {
      if (!config.accessToken) {
        throw new Error(
          'Outlook is not connected. Reconnect OAuth so an access token is available. No message was sent.'
        );
      }
      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: options.subject,
            body: { contentType: 'HTML', content: options.bodyHtml },
            toRecipients: [{ emailAddress: { address: options.to } }],
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Outlook send failed: ${text}`);
      }
      return { messageId: null };
    },
  };
}
