import type { ExtendedEmailProvider } from './types.js';

const NOT_CONNECTED =
  'Email is not connected. The mock provider does not send mail and will not invent a message id. Connect Gmail, Outlook, or SMTP.';

/** Mock provider does not send. Callers must treat the throw as "not connected". */
export function createMockEmailProvider(): ExtendedEmailProvider {
  return {
    name: 'mock',
    providerType: 'mock',
    async send() {
      throw new Error(NOT_CONNECTED);
    },
    async sendExtended() {
      throw new Error(NOT_CONNECTED);
    },
  };
}
