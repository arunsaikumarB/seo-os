import type { ProviderMode } from '@seo-os/shared';
import type {
  AIProvider,
  BacklinkProvider,
  CompetitorProvider,
  EmailProvider,
  KeywordProvider,
  ProviderType,
  SERPProvider,
} from './interfaces/index.js';
import { createAIProviderRouter } from './ai/router.js';
import type { AIProviderRouter } from './ai/types.js';
import { createEmailProvider, createEmailProviderFromAccount } from './email/router.js';
import { getProviderManager } from './framework/manager.js';

export interface ProviderRegistryConfig {
  mode: ProviderMode;
  backlink?: string;
  keyword?: string;
  serp?: string;
  competitor?: string;
  ai?: string;
  email?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
}

export interface ProviderRegistry {
  getBacklinkProvider(): BacklinkProvider;
  getKeywordProvider(): KeywordProvider;
  getSERPProvider(): SERPProvider;
  getCompetitorProvider(): CompetitorProvider;
  getAIProvider(): AIProvider;
  getAIProviderRouter(): AIProviderRouter;
  getEmailProvider(): EmailProvider;
  getEmailProviderForAccount(
    providerType: string,
    accountConfig: Record<string, unknown>
  ): EmailProvider;
  getStatus(): Record<ProviderType, { name: string; label: string; cost: string }>;
  getAIHealth(): Promise<{
    primary: { name: string; status: string };
    fallback?: { name: string; status: string };
  }>;
  getProviderManager(): ReturnType<typeof getProviderManager>;
}

export function createProviderRegistry(config: ProviderRegistryConfig): ProviderRegistry {
  const notImplemented = (type: string) => () => {
    throw new Error(`Provider "${type}" not implemented yet.`);
  };

  const aiRouter = createAIProviderRouter({
    geminiApiKey: config.geminiApiKey,
    ollamaBaseUrl: config.ollamaBaseUrl,
  });

  const defaultEmailProvider = createEmailProvider(
    config.email === 'smtp'
      ? { type: 'smtp', config: { host: '', port: 587 } }
      : config.email === 'gmail'
        ? { type: 'gmail', config: {} }
        : config.email === 'outlook'
          ? { type: 'outlook', config: {} }
          : { type: 'mock' }
  );

  const manager = getProviderManager({
    preferred: {
      keyword: config.keyword ? `keyword.${config.keyword}` : 'keyword.estimated',
      llm: config.ai === 'ollama' ? 'llm.ollama' : 'llm.gemini',
      email:
        config.email === 'gmail'
          ? 'email.gmail'
          : config.email === 'outlook'
            ? 'email.outlook'
            : 'email.smtp',
    },
  });

  const keywordProvider = manager.getKeywordProvider();
  const aiName = aiRouter.primary === 'none' ? 'none' : aiRouter.primary;
  const aiLabel =
    aiRouter.primary === 'none'
      ? 'Not configured'
      : aiRouter.fallback
        ? `${aiRouter.primary} (fallback: ${aiRouter.fallback})`
        : aiRouter.primary;

  return {
    getBacklinkProvider: notImplemented('backlink') as () => BacklinkProvider,
    getKeywordProvider: () => keywordProvider,
    getSERPProvider: notImplemented('serp') as () => SERPProvider,
    getCompetitorProvider: notImplemented('competitor') as () => CompetitorProvider,
    getAIProvider: () => aiRouter,
    getAIProviderRouter: () => aiRouter,
    getEmailProvider: () => defaultEmailProvider,
    getEmailProviderForAccount: (providerType, accountConfig) =>
      createEmailProviderFromAccount(providerType, accountConfig),
    getProviderManager: () => manager,
    getStatus: () => ({
      backlink: { name: 'authority.estimated', label: 'Estimated Authority', cost: 'free' },
      keyword: { name: keywordProvider.key, label: keywordProvider.displayName, cost: 'free' },
      serp: { name: 'keyword.estimated', label: 'Estimated SERP', cost: 'free' },
      competitor: { name: 'none', label: 'Not configured', cost: 'free' },
      ai: { name: aiName, label: aiLabel, cost: 'free' },
      email: { name: defaultEmailProvider.name, label: defaultEmailProvider.name, cost: 'free' },
    }),
    getAIHealth: async () => {
      const health = await aiRouter.healthCheck();
      return {
        primary: { name: health.primary.name, status: health.primary.status },
        fallback: health.fallback
          ? { name: health.fallback.name, status: health.fallback.status }
          : undefined,
      };
    },
  };
}
