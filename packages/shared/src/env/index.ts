import { z } from 'zod';

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production', 'staging']).default('development'),
  PORT: z.coerce.number().default(3001),
  API_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ENCRYPTION_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  PROVIDER_MODE: z.enum(['mvp', 'free', 'paid']).default('mvp'),
  ENABLE_WORKERS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  /** Parallel content-generation item workers (Phase 3). Default 4. */
  CONTENT_GEN_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  /**
   * Reverse-proxy hop count for Express `trust proxy`.
   * Unset: 1 on production/staging (Railway), off otherwise.
   * Use a number (`1`). `true` is accepted as one hop, not trust-all.
   */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => {
      const trimmed = v?.trim();
      return trimmed ? trimmed : undefined;
    }),
  /** Bearer secret for /metrics and /ops/*. Empty is treated as unset. */
  OPS_INTERNAL_TOKEN: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(16, 'OPS_INTERNAL_TOKEN must be at least 16 characters').optional()
  ),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Supabase project URL only — strips accidental `/rest` suffix from dashboard copy-paste. */
export function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/?$/i, '').replace(/\/$/, '');
}

export function parseApiEnv(env: NodeJS.ProcessEnv): ApiEnv {
  const parsed = apiEnvSchema.parse(env);
  const enableWorkers =
    env.ENABLE_WORKERS !== undefined
      ? env.ENABLE_WORKERS === 'true'
      : parsed.NODE_ENV === 'production';
  if (
    (parsed.NODE_ENV === 'production' || parsed.NODE_ENV === 'staging') &&
    !parsed.ENCRYPTION_KEY
  ) {
    // Soft-fail: allow boot but /ready reports degraded (see health.readyHandler)
    console.warn(
      '[seo-os] ENCRYPTION_KEY is not set — integration credentials fall back to a dev key. Set ENCRYPTION_KEY in production.'
    );
  }
  if (
    (parsed.NODE_ENV === 'production' || parsed.NODE_ENV === 'staging') &&
    !parsed.OPS_INTERNAL_TOKEN
  ) {
    console.warn(
      '[seo-os] OPS_INTERNAL_TOKEN is not set — /metrics and /ops/* accept org admin JWTs only. Set OPS_INTERNAL_TOKEN for probes and scrapers.'
    );
  }
  return {
    ...parsed,
    SUPABASE_URL: normalizeSupabaseUrl(parsed.SUPABASE_URL),
    ENABLE_WORKERS: enableWorkers,
  };
}

export const webEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_API_URL: z.string().url(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
