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
  getStatus(): Record<ProviderType, { name: string; label: string; cost: string }>;
  getAIHealth(): Promise<{ primary: { name: string; status: string }; fallback?: { name: string; status: string } }>;
}

export function createProviderRegistry(config: ProviderRegistryConfig): ProviderRegistry {
  const notImplemented = (type: string) => () => {
    throw new Error(`Provider "${type}" not implemented yet.`);
  };

  const aiRouter = createAIProviderRouter({
    geminiApiKey: config.geminiApiKey,
    ollamaBaseUrl: config.ollamaBaseUrl,
  });

  const aiName = aiRouter.primary === 'none' ? 'none' : aiRouter.primary;
  const aiLabel =
    aiRouter.primary === 'none'
      ? 'Not configured'
      : aiRouter.fallback
        ? `${aiRouter.primary} (fallback: ${aiRouter.fallback})`
        : aiRouter.primary;

  return {
    getBacklinkProvider: notImplemented('backlink') as () => BacklinkProvider,
    getKeywordProvider: notImplemented('keyword') as () => KeywordProvider,
    getSERPProvider: notImplemented('serp') as () => SERPProvider,
    getCompetitorProvider: notImplemented('competitor') as () => CompetitorProvider,
    getAIProvider: () => aiRouter,
    getAIProviderRouter: () => aiRouter,
    getEmailProvider: notImplemented('email') as () => EmailProvider,
    getStatus: () => ({
      backlink: { name: 'none', label: 'Not configured', cost: 'free' },
      keyword: { name: 'none', label: 'Not configured', cost: 'free' },
      serp: { name: 'none', label: 'Not configured', cost: 'free' },
      competitor: { name: 'none', label: 'Not configured', cost: 'free' },
      ai: { name: aiName, label: aiLabel, cost: 'free' },
      email: { name: 'none', label: 'Not configured', cost: 'free' },
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
