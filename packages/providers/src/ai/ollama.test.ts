import { afterEach, describe, expect, it } from 'vitest';
import { createOllamaProvider, isOllamaEnabled, resolveOllamaModel } from './ollama.js';

const saved = {
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  OLLAMA_ENABLED: process.env.OLLAMA_ENABLED,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
};

afterEach(() => {
  process.env.OLLAMA_MODEL = saved.OLLAMA_MODEL;
  process.env.OLLAMA_ENABLED = saved.OLLAMA_ENABLED;
  process.env.OLLAMA_BASE_URL = saved.OLLAMA_BASE_URL;
});

describe('resolveOllamaModel', () => {
  it('defaults to llama3.2 and prefers OLLAMA_MODEL then an explicit argument', () => {
    delete process.env.OLLAMA_MODEL;
    expect(resolveOllamaModel()).toBe('llama3.2');
    process.env.OLLAMA_MODEL = 'qwen2.5:7b';
    expect(resolveOllamaModel()).toBe('qwen2.5:7b');
    expect(resolveOllamaModel('mistral')).toBe('mistral');
  });
});

describe('isOllamaEnabled', () => {
  it('requires OLLAMA_ENABLED=true and a base URL', () => {
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.OLLAMA_ENABLED = 'false';
    expect(isOllamaEnabled()).toBe(false);
    process.env.OLLAMA_ENABLED = 'true';
    expect(isOllamaEnabled()).toBe(true);
    delete process.env.OLLAMA_BASE_URL;
    expect(isOllamaEnabled()).toBe(false);
    expect(isOllamaEnabled('http://127.0.0.1:11434')).toBe(true);
  });
});

describe('createOllamaProvider complete', () => {
  it('sends format and a low temperature when the caller asks for JSON', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ message: { content: '{"verdict":"needs_human"}' } }), { status: 200 });
    }) as typeof fetch;
    try {
      const schema = { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'] };
      await createOllamaProvider('http://127.0.0.1:11434', 'qwen2.5:7b').complete(
        [{ role: 'user', content: 'review' }],
        { temperature: 0.1, format: schema }
      );
      expect(bodies[0]?.format).toEqual(schema);
      expect((bodies[0]?.options as { temperature: number }).temperature).toBe(0.1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
