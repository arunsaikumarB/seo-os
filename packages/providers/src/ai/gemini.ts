import type { AIProvider } from '../interfaces/index.js';

const GEMINI_MODEL = 'gemini-2.0-flash';

export function createGeminiProvider(apiKey: string): AIProvider {
  return {
    name: 'gemini',
    async complete(messages, options = {}) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

      const body = {
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: (options.temperature as number) ?? 0.7,
          maxOutputTokens: (options.maxTokens as number) ?? 2048,
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout((options.timeoutMs as number) ?? 30_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const inputTokens = data.usageMetadata?.promptTokenCount ?? estimateTokens(messages);
      const outputTokens = data.usageMetadata?.candidatesTokenCount ?? estimateTokens(text);

      return {
        text,
        usage: { inputTokens, outputTokens },
      };
    },
  };
}

function estimateTokens(input: string | Array<{ content: string }>): number {
  const text = typeof input === 'string' ? input : input.map((m) => m.content).join(' ');
  return Math.ceil(text.length / 4);
}

export async function checkGeminiHealth(apiKey?: string): Promise<{
  status: 'healthy' | 'degraded' | 'down' | 'disabled';
  latencyMs?: number;
  message?: string;
}> {
  if (!apiKey) return { status: 'disabled', message: 'GEMINI_API_KEY not configured' };
  const start = Date.now();
  try {
    const provider = createGeminiProvider(apiKey);
    await provider.complete([{ role: 'user', content: 'ping' }], { maxTokens: 16, timeoutMs: 10_000 });
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Health check failed',
    };
  }
}
