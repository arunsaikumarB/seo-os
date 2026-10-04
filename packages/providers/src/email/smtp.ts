import type { ExtendedEmailProvider } from './types.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

export interface SmtpEnvConfig extends SmtpConfig {
  from: string;
}

/** Env mailbox used when no outreach email account row exists. */
export function smtpConfigFromEnv(): SmtpEnvConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user;
  if (!host || !Number.isFinite(port) || port <= 0 || !user || pass == null || pass === '' || !from) {
    return null;
  }
  const secureEnv = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureEnv ? secureEnv === 'true' || secureEnv === '1' : port === 465;
  return { host, port, secure, user, pass, from };
}

/** SMTP through nodemailer. The message id is the one the relay returns. */
export function createSmtpEmailProvider(config: SmtpConfig): ExtendedEmailProvider {
  return {
    name: 'smtp',
    providerType: 'smtp',
    async send(options) {
      return this.sendExtended(options);
    },
    async sendExtended(options) {
      if (!config.host || !config.port) {
        throw new Error('SMTP is not connected. Set host and port. No message was sent.');
      }
      let nodemailer: typeof import('nodemailer');
      try {
        nodemailer = await import('nodemailer');
      } catch {
        throw new Error('nodemailer is not installed, so SMTP cannot send.');
      }
      const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure ?? config.port === 465,
        auth: config.user ? { user: config.user, pass: config.pass ?? '' } : undefined,
      });
      const info = await transport.sendMail({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.bodyHtml,
        text: options.bodyText,
      });
      if (!info.messageId) {
        throw new Error('SMTP did not return a message id. The send was not recorded as delivered.');
      }
      return { messageId: info.messageId };
    },
  };
}
