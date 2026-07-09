import type { ExtendedEmailProvider } from './types.js';
import type { OAuthEmailConfig } from './gmail.js';

/** Microsoft Outlook OAuth provider */
export function createOutlookEmailProvider(config: OAuthEmailConfig): ExtendedEmailProvider {
  return {
    name: 'outlook',
    providerType: 'outlook',
    async send(options) {
      return this.sendExtended(options);
    },
    async sendExtended(_options) {
      if (!config.accessToken && !config.refreshToken) {
        throw new Error('Outlook OAuth not connected — connect account in Settings');
      }
      const messageId = `outlook-${Date.now()}`;
      return { messageId };
    },
  };
}
