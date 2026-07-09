import { createGmailEmailProvider } from './gmail.js';
import { createMockEmailProvider } from './mock.js';
import { createOutlookEmailProvider } from './outlook.js';
import { createSmtpEmailProvider, type SmtpConfig } from './smtp.js';
import type { ExtendedEmailProvider } from './types.js';

export type EmailProviderConfig =
  | { type: 'mock' }
  | { type: 'smtp'; config: SmtpConfig }
  | { type: 'gmail'; config: { accessToken?: string; refreshToken?: string } }
  | { type: 'outlook'; config: { accessToken?: string; refreshToken?: string } };

export function createEmailProvider(
  config: EmailProviderConfig = { type: 'mock' }
): ExtendedEmailProvider {
  switch (config.type) {
    case 'smtp':
      return createSmtpEmailProvider(config.config);
    case 'gmail':
      return createGmailEmailProvider(config.config);
    case 'outlook':
      return createOutlookEmailProvider(config.config);
    case 'mock':
    default:
      return createMockEmailProvider();
  }
}

export function createEmailProviderFromAccount(
  providerType: string,
  accountConfig: Record<string, unknown>
): ExtendedEmailProvider {
  switch (providerType) {
    case 'smtp':
      return createSmtpEmailProvider(accountConfig as unknown as SmtpConfig);
    case 'gmail':
      return createGmailEmailProvider(
        accountConfig as { accessToken?: string; refreshToken?: string }
      );
    case 'outlook':
      return createOutlookEmailProvider(
        accountConfig as { accessToken?: string; refreshToken?: string }
      );
    default:
      return createMockEmailProvider();
  }
}
