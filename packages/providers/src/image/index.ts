import type { ImageProvider, ImageProviderDescriptor, ImageProviderRegistry } from './types.js';
import {
  Automatic1111Provider,
  ComfyUIProvider,
  FireflyProvider,
  FluxProvider,
  GeminiImageProvider,
  OpenAIImageProvider,
  StableDiffusionXLProvider,
} from './providers.js';

const flux = new FluxProvider();
const sdxl = new StableDiffusionXLProvider();
const comfy = new ComfyUIProvider();

const ALL: ImageProvider[] = [
  flux,
  sdxl,
  comfy,
  OpenAIImageProvider,
  GeminiImageProvider,
  FireflyProvider,
  Automatic1111Provider,
];

export function createImageProviderRegistry(defaultKey = 'flux'): ImageProviderRegistry {
  const map = new Map(ALL.map((p) => [p.key, p]));

  return {
    providers(): ImageProviderDescriptor[] {
      return ALL.map((p) => ({
        key: p.key,
        displayName: p.displayName,
        freeDefault: p.capabilities().freeDefault,
        configured: Boolean(
          (p.key === 'flux' && process.env.IMAGE_FLUX_URL) ||
            (p.key === 'sdxl' && process.env.IMAGE_SDXL_URL) ||
            (p.key === 'comfy' && process.env.IMAGE_COMFY_URL) ||
            p.capabilities().freeDefault
        ),
      }));
    },
    get(key: string): ImageProvider {
      const p = map.get(key);
      if (!p) throw new Error(`Unknown image provider: ${key}`);
      return p;
    },
    getDefault(preferred?: string): ImageProvider {
      const key = preferred || process.env.IMAGE_PROVIDER_DEFAULT || defaultKey;
      if (map.has(key)) return map.get(key)!;
      return flux;
    },
  };
}

export * from './types.js';
export * from './providers.js';
