import { createAIRuntime, type AIRuntime } from '@seo-os/ai-runtime';
import { getEnv } from '../../config/env.js';

let runtime: AIRuntime | null = null;

export function getAIRuntime(): AIRuntime {
  if (!runtime) {
    const env = getEnv();
    runtime = createAIRuntime({
      mode: env.PROVIDER_MODE,
      geminiApiKey: env.GEMINI_API_KEY,
      ollamaBaseUrl: env.OLLAMA_BASE_URL,
    });
  }
  return runtime;
}
