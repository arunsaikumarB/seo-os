import type { AIProvider } from '../interfaces/index.js';

const DEFAULT_MODEL = 'llama3.2';

/** Explicit argument, then OLLAMA_MODEL, then llama3.2. */
export function resolveOllamaModel(explicit?: string | null): string {
  const fromArg = explicit?.trim();
  if (fromArg) return fromArg;
  const fromEnv = process.env.OLLAMA_MODEL?.trim();
  return fromEnv || DEFAULT_MODEL;
}

/** Ollama is on only when both OLLAMA_ENABLED=true and a base URL are set. */
export function isOllamaEnabled(baseUrl?: string | null): boolean {
  const url = (baseUrl ?? process.env.OLLAMA_BASE_URL)?.trim();
  const enabled = String(process.env.OLLAMA_ENABLED ?? '').toLowerCase() === 'true';
  return Boolean(url) && enabled;
}

export function createOllamaProvider(baseUrl: string, model?: string): AIProvider {
  const resolved = resolveOllamaModel(model);
  return {
    name: 'ollama',
    async complete(messages, options = {}) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: (options.model as string) ?? resolved,
          messages,
          stream: false,
          options: {
            temperature: (options.temperature as number) ?? 0.7,
            num_predict: (options.maxTokens as number) ?? 2048,
          },
        }),
        signal: AbortSignal.timeout((options.timeoutMs as number) ?? 60_000),
      });

      if (!res.ok) {
        throw new Error(`Ollama API error ${res.status}`);
      }

      const data = (await res.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const text = data.message?.content ?? '';
      return {
        text,
        usage: {
          inputTokens: data.prompt_eval_count ?? estimateTokens(messages),
          outputTokens: data.eval_count ?? estimateTokens(text),
        },
      };
    },
  };
}

function estimateTokens(input: string | Array<{ content: string }>): number {
  const text = typeof input === 'string' ? input : input.map((m) => m.content).join(' ');
  return Math.ceil(text.length / 4);
}

export async function checkOllamaHealth(baseUrl?: string): Promise<{
  status: 'healthy' | 'degraded' | 'down' | 'disabled';
  latencyMs?: number;
  message?: string;
}> {
  if (!baseUrl) return { status: 'disabled', message: 'OLLAMA_BASE_URL not configured' };
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unreachable',
    };
  }
}
