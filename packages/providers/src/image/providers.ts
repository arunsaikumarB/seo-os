/**
 * Free-path image providers.
 * When IMAGE_FLUX_URL / IMAGE_SDXL_URL are unset, generate() returns a
 * deterministic SVG placeholder PNG-compatible payload is not faked as photo —
 * we produce a valid SVG asset labeled Estimated/provider-local for pipeline continuity,
 * OR call the configured HTTP endpoint (Replicate-compatible / local A1111-style).
 *
 * Production free path: set IMAGE_FLUX_URL or IMAGE_SDXL_URL to a self-hosted / free gateway.
 */
import type {
  ImageGenerateInput,
  ImageGenerateResult,
  ImageProvider,
  ImageProviderCapabilities,
  ImageProviderHealth,
} from './types.js';

function svgBytes(input: ImageGenerateInput, provider: string): Buffer {
  const title = (input.imageType ?? 'image').replace(/_/g, ' ');
  const promptSafe = input.prompt.slice(0, 120).replace(/[<>&]/g, '');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f766e"/>
      <stop offset="100%" stop-color="#134e4a"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="42%" text-anchor="middle" fill="#ecfdf5" font-family="Georgia, serif" font-size="${Math.max(18, Math.floor(input.width / 28))}">${title}</text>
  <text x="50%" y="55%" text-anchor="middle" fill="#99f6e4" font-family="system-ui,sans-serif" font-size="${Math.max(12, Math.floor(input.width / 48))}">${provider} · SEO OS IIE</text>
  <text x="50%" y="68%" text-anchor="middle" fill="#5eead4" font-family="system-ui,sans-serif" font-size="${Math.max(10, Math.floor(input.width / 55))}">${promptSafe}</text>
</svg>`;
  return Buffer.from(svg, 'utf8');
}

async function httpGenerate(
  baseUrl: string,
  input: ImageGenerateInput,
  providerKey: string
): Promise<ImageGenerateResult> {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.IMAGE_PROVIDER_API_KEY
        ? { Authorization: `Bearer ${process.env.IMAGE_PROVIDER_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      prompt: input.prompt,
      negative_prompt: input.negativePrompt,
      width: input.width,
      height: input.height,
      seed: input.seed,
      provider: providerKey,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`${providerKey} gateway HTTP ${res.status}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = (await res.json()) as { imageBase64?: string; mimeType?: string; url?: string };
    if (json.imageBase64) {
      return {
        bytes: Buffer.from(json.imageBase64, 'base64'),
        mimeType: json.mimeType ?? 'image/png',
        width: input.width,
        height: input.height,
        seed: input.seed,
        providerMeta: { gateway: baseUrl },
      };
    }
    if (json.url) {
      const img = await fetch(json.url, { signal: AbortSignal.timeout(60_000) });
      const buf = Buffer.from(await img.arrayBuffer());
      return {
        bytes: buf,
        mimeType: img.headers.get('content-type') ?? 'image/png',
        width: input.width,
        height: input.height,
        seed: input.seed,
        providerMeta: { gateway: baseUrl, url: json.url },
      };
    }
    throw new Error(`${providerKey} gateway returned JSON without image`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    bytes: buf,
    mimeType: contentType || 'image/png',
    width: input.width,
    height: input.height,
    seed: input.seed,
    providerMeta: { gateway: baseUrl },
  };
}

abstract class HttpOrLocalImageProvider implements ImageProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;
  abstract envUrlKey: string;

  capabilities(): ImageProviderCapabilities {
    return {
      generate: true,
      variation: true,
      upscale: false,
      removeBackground: false,
      freeDefault: true,
      maxWidth: 2048,
      maxHeight: 2048,
    };
  }

  async health(): Promise<ImageProviderHealth> {
    const url = process.env[this.envUrlKey];
    if (!url) {
      return {
        status: 'unconfigured',
        message: `Set ${this.envUrlKey} for live ${this.displayName}; local SVG draft mode available`,
      };
    }
    try {
      const t0 = Date.now();
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5_000) });
      return {
        status: res.ok || res.status === 405 ? 'healthy' : 'degraded',
        message: `Gateway ${res.status}`,
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      return {
        status: 'down',
        message: err instanceof Error ? err.message : 'Health check failed',
      };
    }
  }

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const url = process.env[this.envUrlKey];
    if (url) return httpGenerate(url, input, this.key);
    // Free local draft asset (SVG) — pipeline continues; Quality Engine may reject for "photo" submissions
    return {
      bytes: svgBytes(input, this.displayName),
      mimeType: 'image/svg+xml',
      width: input.width,
      height: input.height,
      seed: input.seed ?? Date.now() % 1_000_000,
      providerMeta: { mode: 'local_draft_svg', note: `Configure ${this.envUrlKey} for raster generation` },
    };
  }

  async variation(input: ImageGenerateInput & { sourceBytes?: Buffer }): Promise<ImageGenerateResult> {
    return this.generate({
      ...input,
      prompt: `${input.prompt}, variation, alternate composition`,
      seed: (input.seed ?? 1) + 17,
    });
  }
}

export class FluxProvider extends HttpOrLocalImageProvider {
  readonly key = 'flux';
  readonly displayName = 'FLUX';
  envUrlKey = 'IMAGE_FLUX_URL';
}

export class StableDiffusionXLProvider extends HttpOrLocalImageProvider {
  readonly key = 'sdxl';
  readonly displayName = 'Stable Diffusion XL';
  envUrlKey = 'IMAGE_SDXL_URL';
}

export class ComfyUIProvider implements ImageProvider {
  readonly key = 'comfy';
  readonly displayName = 'ComfyUI';

  capabilities(): ImageProviderCapabilities {
    return { generate: true, variation: true, upscale: true, removeBackground: false };
  }

  async health(): Promise<ImageProviderHealth> {
    const base = process.env.IMAGE_COMFY_URL;
    if (!base) return { status: 'unconfigured', message: 'Set IMAGE_COMFY_URL' };
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/system_stats`, {
        signal: AbortSignal.timeout(5_000),
      });
      return { status: res.ok ? 'healthy' : 'degraded', message: `Comfy ${res.status}` };
    } catch (err) {
      return { status: 'down', message: err instanceof Error ? err.message : 'down' };
    }
  }

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const base = process.env.IMAGE_COMFY_URL;
    if (!base) throw new Error('ComfyUI not configured (IMAGE_COMFY_URL)');
    return httpGenerate(`${base.replace(/\/$/, '')}/generate`, input, this.key);
  }
}

/** Future stubs — health unconfigured until keys exist */
class FutureStubProvider implements ImageProvider {
  constructor(
    readonly key: string,
    readonly displayName: string
  ) {}
  capabilities(): ImageProviderCapabilities {
    return { generate: false, variation: false, upscale: false, removeBackground: false };
  }
  async health(): Promise<ImageProviderHealth> {
    return { status: 'unconfigured', message: `${this.displayName} reserved for future integration` };
  }
  async generate(): Promise<ImageGenerateResult> {
    throw new Error(`${this.displayName} is not enabled yet`);
  }
}

export const OpenAIImageProvider = new FutureStubProvider('openai', 'OpenAI Images');
export const GeminiImageProvider = new FutureStubProvider('gemini', 'Gemini Images');
export const FireflyProvider = new FutureStubProvider('firefly', 'Adobe Firefly');
export const Automatic1111Provider = new FutureStubProvider('a1111', 'AUTOMATIC1111');
