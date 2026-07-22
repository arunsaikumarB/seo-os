import type { AIProvider } from '../interfaces/index.js';

function estimateTokens(input: string | Array<{ content: string }>): number {
  const text = typeof input === 'string' ? input : input.map((m) => m.content).join(' ');
  return Math.ceil(text.length / 4);
}

/**
 * OpenAI-compatible chat completions (Mistral, OpenAI, DeepSeek, OpenRouter, …).
 */
export function createOpenAiCompatibleProvider(options: {
  name: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}): AIProvider {
  const base = options.baseUrl.replace(/\/$/, '');
  return {
    name: options.name,
    async complete(messages, opts = {}) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: (opts.model as string) ?? options.defaultModel,
          messages: messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
            content: m.content,
          })),
          temperature: (opts.temperature as number) ?? 0.7,
          max_tokens: (opts.maxTokens as number) ?? 4096,
        }),
        signal: AbortSignal.timeout((opts.timeoutMs as number) ?? 60_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `${options.name} API error ${res.status}: ${errText.slice(0, 280)}`
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? '';
      return {
        text,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? estimateTokens(messages),
          outputTokens: data.usage?.completion_tokens ?? estimateTokens(text),
        },
      };
    },
  };
}

export function createMistralProvider(apiKey: string): AIProvider {
  return createOpenAiCompatibleProvider({
    name: 'mistral',
    apiKey,
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: process.env.MISTRAL_MODEL || 'mistral-small-latest',
  });
}

export function createOpenAIChatProvider(apiKey: string): AIProvider {
  return createOpenAiCompatibleProvider({
    name: 'openai',
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  });
}

export function createDeepSeekProvider(apiKey: string): AIProvider {
  return createOpenAiCompatibleProvider({
    name: 'deepseek',
    apiKey,
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  });
}

export function createOpenRouterProvider(apiKey: string): AIProvider {
  return createOpenAiCompatibleProvider({
    name: 'openrouter',
    apiKey,
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: process.env.OPENROUTER_MODEL || 'openrouter/auto',
  });
}
