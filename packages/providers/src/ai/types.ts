import type { AIProvider } from '../interfaces/index.js';

export interface AICompleteResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  provider: string;
}

export interface AIProviderRouterOptions {
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  timeoutMs?: number;
}

export interface AIProviderRouter extends AIProvider {
  readonly primary: string;
  readonly fallback?: string;
  healthCheck(): Promise<{ primary: ProviderHealth; fallback?: ProviderHealth }>;
  completeWithFailover(
    messages: Array<{ role: string; content: string }>,
    options?: Record<string, unknown>
  ): Promise<AICompleteResult>;
}

export interface ProviderHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'disabled';
  latencyMs?: number;
  message?: string;
}
