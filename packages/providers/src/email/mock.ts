import { randomUUID } from 'node:crypto';
import type { ExtendedEmailProvider } from './types.js';

/** Mock provider — default for dev/demo; simulates successful send */
export function createMockEmailProvider(): ExtendedEmailProvider {
  return {
    name: 'mock',
    providerType: 'mock',
    async send(options) {
      return this.sendExtended(options);
    },
    async sendExtended(_options) {
      const messageId = `mock-${randomUUID()}`;
      return { messageId };
    },
  };
}
