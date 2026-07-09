import type { ExtendedEmailProvider } from './types.js';

export interface OAuthEmailConfig {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

/** Gmail OAuth provider — OAuth tokens required; v1 returns structured stub when configured */
export function createGmailEmailProvider(config: OAuthEmailConfig): ExtendedEmailProvider {
  return {
    name: 'gmail',
    providerType: 'gmail',
    async send(options) {
      return this.sendExtended(options);
    },
    async sendExtended(_options) {
      if (!config.accessToken && !config.refreshToken) {
        throw new Error('Gmail OAuth not connected — connect account in Settings');
      }
      const messageId = `gmail-${Date.now()}`;
      return { messageId };
    },
  };
}
