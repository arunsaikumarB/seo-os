import type { AIProvider } from '../interfaces/index.js';
import { createGeminiProvider, checkGeminiHealth } from './gemini.js';
import { createOllamaProvider, checkOllamaHealth } from './ollama.js';
import type { AICompleteResult, AIProviderRouter, AIProviderRouterOptions, ProviderHealth } from './types.js';

export function createAIProviderRouter(options: AIProviderRouterOptions): AIProviderRouter {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const gemini = options.geminiApiKey ? createGeminiProvider(options.geminiApiKey) : null;
  const ollama = options.ollamaBaseUrl ? createOllamaProvider(options.ollamaBaseUrl) : null;

  const primary = gemini ? 'gemini' : ollama ? 'ollama' : 'none';

  async function tryComplete(provider: AIProvider, messages: Array<{ role: string; content: string }>, opts: Record<string, unknown>): Promise<AICompleteResult> {
    const result = await provider.complete(messages, { ...opts, timeoutMs });
    return { ...result, provider: provider.name };
  }

  return {
    name: 'ai-router',
    primary,
    fallback: gemini && ollama ? 'ollama' : undefined,

    async complete(messages, opts) {
      const result = await this.completeWithFailover(messages, opts);
      return { text: result.text, usage: result.usage };
    },

    async completeWithFailover(messages, opts = {}) {
      if (gemini) {
        try {
          return await tryComplete(gemini, messages, opts);
        } catch (err) {
          if (ollama) {
            return await tryComplete(ollama, messages, opts);
          }
          throw err;
        }
      }
      if (ollama) {
        return await tryComplete(ollama, messages, opts);
      }
      throw new Error('No AI provider configured. Set GEMINI_API_KEY or OLLAMA_BASE_URL.');
    },

    async healthCheck() {
      const [primaryHealth, fallbackHealth] = await Promise.all([
        gemini
          ? checkGeminiHealth(options.geminiApiKey).then((h) => ({ name: 'gemini', ...h }))
          : Promise.resolve({ name: 'gemini', status: 'disabled' as const, message: 'Not configured' }),
        ollama
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
