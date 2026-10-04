/**
 * Drafts come from Gemini or Ollama when one is configured.
 * Otherwise the caller gets an explicit "not generated" message.
 */

import { unavailableAiDraftMessage } from '@seo-os/backlink-builder';
import { createGeminiProvider, createOllamaProvider, isOllamaEnabled } from '@seo-os/providers';
import { logger } from '../../lib/logger.js';

export interface DraftResult {
  content: string;
  provider: 'gemini' | 'ollama' | null;
  generated: boolean;
}

async function complete(prompt: string): Promise<{ text: string; provider: 'gemini' | 'ollama' } | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const result = await createGeminiProvider(geminiKey).complete(
        [{ role: 'user', content: prompt }],
        { maxTokens: 1200, temperature: 0.4 }
      );
      if (result.text.trim()) return { text: result.text.trim(), provider: 'gemini' };
    } catch (err) {
      logger.warn({ err }, 'Gemini draft failed');
    }
  }
  const ollama = process.env.OLLAMA_BASE_URL?.trim();
  if (ollama && isOllamaEnabled(ollama)) {
    try {
      const result = await createOllamaProvider(ollama).complete(
        [{ role: 'user', content: prompt }],
        { maxTokens: 1200, temperature: 0.4 }
      );
      if (result.text.trim()) return { text: result.text.trim(), provider: 'ollama' };
    } catch (err) {
      logger.warn({ err }, 'Ollama draft failed');
    }
  }
  return null;
}

export async function draftWithConfiguredAi(kind: string, prompt: string): Promise<DraftResult> {
  const ai = await complete(prompt);
  if (!ai) {
    return { content: unavailableAiDraftMessage(kind), provider: null, generated: false };
  }
  return { content: ai.text, provider: ai.provider, generated: true };
}

export async function reviewWithConfiguredAi(prompt: string): Promise<{ text: string; source: 'gemini' | 'ollama' } | null> {
  const ai = await complete(prompt);
  if (!ai) return null;
  return { text: ai.text, source: ai.provider };
}
