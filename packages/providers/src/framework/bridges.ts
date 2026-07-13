/** Wrap existing Image / Email / LLM / Embedding implementations into FrameworkProvider */

import { createImageProviderRegistry } from '../image/index.js';
import type { FrameworkProvider, FrameworkProviderHealth } from './types.js';

const imageRegistry = createImageProviderRegistry('flux');

class ImageFrameworkAdapter implements FrameworkProvider {
  readonly version = '1.0.0';
  readonly type = 'image' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    private imageKey: string
  ) {}
  capabilities() {
    const caps = imageRegistry.get(this.imageKey).capabilities();
    return {
      generate: caps.generate,
      variation: caps.variation,
      upscale: caps.upscale,
      removeBackground: caps.removeBackground,
    };
  }
  async health(): Promise<FrameworkProviderHealth> {
    const h = await imageRegistry.get(this.imageKey).health();
    const status =
      h.status === 'healthy'
        ? 'healthy'
        : h.status === 'degraded'
          ? 'warning'
          : h.status === 'unconfigured'
            ? 'unconfigured'
            : 'offline';
    return {
      status,
      latencyMs: h.latencyMs,
      message: h.message,
      checkedAt: new Date().toISOString(),
    };
  }
}

export const IMAGE_FRAMEWORK_PROVIDERS: FrameworkProvider[] = [
  new ImageFrameworkAdapter('image.flux', 'FLUX', 'flux'),
  new ImageFrameworkAdapter('image.sdxl', 'Stable Diffusion XL', 'sdxl'),
  new ImageFrameworkAdapter('image.comfy', 'ComfyUI', 'comfy'),
  new ImageFrameworkAdapter('image.openai', 'OpenAI Images', 'openai'),
  new ImageFrameworkAdapter('image.gemini', 'Gemini Images', 'gemini'),
  new ImageFrameworkAdapter('image.firefly', 'Adobe Firefly', 'firefly'),
  new ImageFrameworkAdapter('image.a1111', 'AUTOMATIC1111', 'a1111'),
];

class LlmFrameworkAdapter implements FrameworkProvider {
  readonly version = '1.0.0';
  readonly type = 'llm' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    private kind: 'gemini' | 'ollama' | 'openai' | 'claude' | 'mistral' | 'deepseek' | 'openrouter'
  ) {}
  capabilities() {
    return { chat: true, completion: true, embeddings: this.kind !== 'claude', vision: true };
  }
  async health(): Promise<FrameworkProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (this.kind === 'gemini') {
      const ok = Boolean(process.env.GEMINI_API_KEY);
      return {
        status: ok ? 'healthy' : 'unconfigured',
        message: ok ? 'GEMINI_API_KEY present' : 'Set GEMINI_API_KEY',
        checkedAt,
      };
    }
    if (this.kind === 'ollama') {
      return {
        status: process.env.OLLAMA_BASE_URL ? 'healthy' : 'unconfigured',
        message: process.env.OLLAMA_BASE_URL ? 'Ollama endpoint set' : 'Set OLLAMA_BASE_URL',
        checkedAt,
      };
    }
    const envMap: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      claude: 'ANTHROPIC_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
    };
    const envKey = envMap[this.kind];
    if (!envKey || !process.env[envKey]) {
      return { status: 'unconfigured', message: `Set ${envKey}`, checkedAt };
    }
    return { status: 'healthy', message: `${envKey} present`, checkedAt };
  }
}

export const LLM_FRAMEWORK_PROVIDERS: FrameworkProvider[] = [
  new LlmFrameworkAdapter('llm.gemini', 'Gemini', 'gemini'),
  new LlmFrameworkAdapter('llm.openai', 'OpenAI', 'openai'),
  new LlmFrameworkAdapter('llm.ollama', 'Ollama', 'ollama'),
  new LlmFrameworkAdapter('llm.claude', 'Claude', 'claude'),
  new LlmFrameworkAdapter('llm.mistral', 'Mistral', 'mistral'),
  new LlmFrameworkAdapter('llm.deepseek', 'DeepSeek', 'deepseek'),
  new LlmFrameworkAdapter('llm.openrouter', 'OpenRouter', 'openrouter'),
];

class EmailFrameworkAdapter implements FrameworkProvider {
  readonly version = '1.0.0';
  readonly type = 'email' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    private envHint?: string
  ) {}
  capabilities() {
    return { send: true, draft: true, templates: true, attachments: true, tracking: true };
  }
  async health(): Promise<FrameworkProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (this.key === 'email.smtp') {
      const ok = Boolean(process.env.SMTP_HOST);
      return {
        status: ok ? 'healthy' : 'unconfigured',
        message: ok ? 'SMTP_HOST present' : 'Set SMTP_HOST (default email path)',
        checkedAt,
      };
    }
    if (this.envHint && !process.env[this.envHint]) {
      return { status: 'unconfigured', message: `Set ${this.envHint}`, checkedAt };
    }
    if (!this.envHint) {
      return {
        status: 'warning',
        message: 'Configure via Integrations Hub / OAuth account binding',
        checkedAt,
      };
    }
    return { status: 'healthy', message: 'Configured', checkedAt };
  }
}

export const EMAIL_FRAMEWORK_PROVIDERS: FrameworkProvider[] = [
  new EmailFrameworkAdapter('email.smtp', 'SMTP', 'SMTP_HOST'),
  new EmailFrameworkAdapter('email.gmail', 'Google OAuth Email'),
  new EmailFrameworkAdapter('email.outlook', 'Microsoft OAuth Email'),
  new EmailFrameworkAdapter('email.mailgun', 'Mailgun', 'EMAIL_MAILGUN_KEY'),
  new EmailFrameworkAdapter('email.sendgrid', 'SendGrid', 'EMAIL_SENDGRID_KEY'),
  new EmailFrameworkAdapter('email.ses', 'AWS SES', 'EMAIL_SES_REGION'),
  new EmailFrameworkAdapter('email.resend', 'Resend', 'EMAIL_RESEND_KEY'),
];

class EmbeddingFrameworkAdapter implements FrameworkProvider {
  readonly version = '1.0.0';
  readonly type = 'embedding' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    private envKey: string
  ) {}
  capabilities() {
    return { embed: true };
  }
  async health(): Promise<FrameworkProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (this.key === 'embedding.gemini') {
      const ok = Boolean(process.env.GEMINI_API_KEY);
      return {
        status: ok ? 'healthy' : 'unconfigured',
        message: ok ? 'Uses GEMINI_API_KEY' : 'Set GEMINI_API_KEY',
        checkedAt,
      };
    }
    if (!process.env[this.envKey]) {
      return { status: 'unconfigured', message: `Set ${this.envKey}`, checkedAt };
    }
    return { status: 'healthy', message: 'Configured', checkedAt };
  }
}

export const EMBEDDING_FRAMEWORK_PROVIDERS: FrameworkProvider[] = [
  new EmbeddingFrameworkAdapter('embedding.gemini', 'Gemini Embeddings', 'GEMINI_API_KEY'),
  new EmbeddingFrameworkAdapter('embedding.openai', 'OpenAI Embeddings', 'OPENAI_API_KEY'),
  new EmbeddingFrameworkAdapter('embedding.ollama', 'Ollama Embeddings', 'OLLAMA_BASE_URL'),
];
