import type { EmailProvider } from '../interfaces/index.js';

export interface ExtendedEmailSendOptions {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  from?: string;
  fromName?: string;
  cc?: string[];
  attachments?: Array<{ filename: string; contentType: string; size: number }>;
}

export interface ExtendedEmailProvider extends EmailProvider {
  readonly providerType: 'mock' | 'smtp' | 'gmail' | 'outlook';
  sendExtended(options: ExtendedEmailSendOptions): Promise<{ messageId: string }>;
}
