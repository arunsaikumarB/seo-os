import type { AIProvider } from '../interfaces/index.js';
import { createGeminiProvider, checkGeminiHealth } from './gemini.js';
import { createOllamaProvider, checkOllamaHealth } from './ollama.js';
import {
  createDeepSeekProvider,
  createMistralProvider,
  createOpenAIChatProvider,
  createOpenRouterProvider,
} from './openai-compatible.js';
import type {
  AICompleteResult,
  AIProviderRouter,
  AIProviderRouterOptions,
  ProviderHealth,
} from './types.js';

function isRetryableProviderError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|5\d\d|rate.?limit|throttl|RESOURCE_EXHAUSTED|ECONNRESET|ETIMEDOUT|fetch failed|network|unavailable|overloaded/i.test(
    msg
  );
}

function isQuotaExhaustedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota|billing|exceeded your current quota|insufficient.?quota|plan limit|daily.?limit/i.test(
    msg
  );
}

/**
 * Build the env-backed LLM chain (used when no workspace PIF chain is supplied).
 * Order: Gemini → Mistral → OpenAI → DeepSeek → OpenRouter → Ollama
 */
export function buildEnvLlmProviders(options: AIProviderRouterOptions): Array<{
  key: string;
  provider: AIProvider;
}> {
  const chain: Array<{ key: string; provider: AIProvider }> = [];
  if (options.geminiApiKey) {
    chain.push({ key: 'llm.gemini', provider: createGeminiProvider(options.geminiApiKey) });
  }
  if (process.env.MISTRAL_API_KEY) {
    chain.push({ key: 'llm.mistral', provider: createMistralProvider(process.env.MISTRAL_API_KEY) });
  }
  if (process.env.OPENAI_API_KEY) {
    chain.push({
      key: 'llm.openai',
      provider: createOpenAIChatProvider(process.env.OPENAI_API_KEY),
    });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    chain.push({
      key: 'llm.deepseek',
      provider: createDeepSeekProvider(process.env.DEEPSEEK_API_KEY),
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    chain.push({
      key: 'llm.openrouter',
      provider: createOpenRouterProvider(process.env.OPENROUTER_API_KEY),
    });
  }
  if (options.ollamaBaseUrl) {
    chain.push({ key: 'llm.ollama', provider: createOllamaProvider(options.ollamaBaseUrl) });
  }
  return chain;
}

export function createAIProviderRouter(options: AIProviderRouterOptions): AIProviderRouter {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const chain = buildEnvLlmProviders(options);
  const primary = chain[0]?.key ?? 'none';
  const fallback = chain[1]?.key;

  async function tryComplete(
    entry: { key: string; provider: AIProvider },
    messages: Array<{ role: string; content: string }>,
    opts: Record<string, unknown>
  ): Promise<AICompleteResult> {
    const result = await entry.provider.complete(messages, { ...opts, timeoutMs });
    return { ...result, provider: entry.key };
  }

  return {
    name: 'ai-router',
    primary,
    fallback,

    async complete(messages, opts) {
      const result = await this.completeWithFailover(messages, opts);
      return { text: result.text, usage: result.usage };
    },

    /**
     * Real failover: ≤1 retry on same provider for retryable errors, then advance.
     * Quota errors skip immediately to the next provider (no same-provider retry).
     */
    async completeWithFailover(messages, opts = {}) {
      if (!chain.length) {
        throw new Error(
          'No AI provider configured. Set GEMINI_API_KEY, MISTRAL_API_KEY, or OLLAMA_BASE_URL.'
        );
      }

      const hops: string[] = [];
      let lastErr: unknown;

      for (let i = 0; i < chain.length; i++) {
        const entry = chain[i]!;
        const maxAttempts = 2; // 1 try + 1 retry
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const result = await tryComplete(entry, messages, opts);
            hops.push(`${entry.key.replace(/^llm\./, '')}: ok`);
            return {
              ...result,
              provider: entry.key,
              failoverUsed: i > 0,
              attempted: hops,
              chainSummary: hops.join(' → '),
            } as AICompleteResult & {
              failoverUsed?: boolean;
              attempted?: string[];
              chainSummary?: string;
            };
          } catch (err) {
            lastErr = err;
            const short = entry.key.replace(/^llm\./, '');
            if (isQuotaExhaustedError(err)) {
              hops.push(`${short}: quota 429`);
              break; // next provider immediately
            }
            if (isRetryableProviderError(err) && attempt === 0) {
              continue; // one same-provider retry
            }
            const msg = err instanceof Error ? err.message : String(err);
            hops.push(`${short}: ${msg.slice(0, 80)}`);
            break; // next provider
          }
        }
      }

      const detail = hops.join(' → ') || (lastErr instanceof Error ? lastErr.message : String(lastErr));
      throw Object.assign(new Error(`All AI providers failed: ${detail}`), {
        cause: lastErr,
        hops,
      });
    },

    async healthCheck() {
      const [primaryHealth, fallbackHealth] = await Promise.all([
        options.geminiApiKey
          ? checkGeminiHealth(options.geminiApiKey).then((h) => ({ name: 'gemini', ...h }))
          : Promise.resolve({
              name: 'gemini',
              status: 'disabled' as const,
              message: 'Not configured',
            }),
        options.ollamaBaseUrl
          ? checkOllamaHealth(options.ollamaBaseUrl).then((h) => ({ name: 'ollama', ...h }))
          : Promise.resolve(undefined),
      ]);
      return {
        primary: primaryHealth as ProviderHealth,
        fallback: fallbackHealth as ProviderHealth | undefined,
      };
    },
  };
}

export { isQuotaExhaustedError, isRetryableProviderError };
