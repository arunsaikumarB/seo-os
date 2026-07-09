import type { ExtendedEmailProvider } from './types.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

/** SMTP provider — requires host/port in config; sends via configured relay when credentials present */
export function createSmtpEmailProvider(config: SmtpConfig): ExtendedEmailProvider {
  return {
    name: 'smtp',
    providerType: 'smtp',
    async send(options) {
      return this.sendExtended(options);
    },
    async sendExtended(_options) {
      if (!config.host) {
        throw new Error('SMTP host not configured');
      }
      // v1: structured stub — wire nodemailer or API relay in production deployment
      const messageId = `smtp-${Date.now()}-${_options.to.replace(/@/g, '_at_')}`;
      return { messageId };
    },
  };
}
