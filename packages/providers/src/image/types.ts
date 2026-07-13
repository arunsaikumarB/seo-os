/** Image provider contract — never hardcode a vendor in routes/UI */

export interface ImageGenerateInput {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  imageType?: string;
  workspaceId?: string;
  extra?: Record<string, unknown>;
}

export interface ImageGenerateResult {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  seed?: number;
  providerMeta?: Record<string, unknown>;
}

export interface ImageProviderHealth {
  status: 'healthy' | 'degraded' | 'down' | 'unconfigured';
  message: string;
  latencyMs?: number;
}

export interface ImageProviderCapabilities {
  generate: boolean;
  variation: boolean;
  upscale: boolean;
  removeBackground: boolean;
  freeDefault?: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

export interface ImageProviderDescriptor {
  key: string;
  displayName: string;
  freeDefault?: boolean;
  configured: boolean;
}

export interface ImageProvider {
  readonly key: string;
  readonly displayName: string;
  capabilities(): ImageProviderCapabilities;
  health(): Promise<ImageProviderHealth>;
  generate(input: ImageGenerateInput): Promise<ImageGenerateResult>;
  variation?(input: ImageGenerateInput & { sourceBytes?: Buffer }): Promise<ImageGenerateResult>;
  upscale?(input: { sourceBytes: Buffer; scale?: number }): Promise<ImageGenerateResult>;
  removeBackground?(input: { sourceBytes: Buffer }): Promise<ImageGenerateResult>;
}

export interface ImageProviderRegistry {
  providers(): ImageProviderDescriptor[];
  get(key: string): ImageProvider;
  getDefault(preferred?: string): ImageProvider;
}
