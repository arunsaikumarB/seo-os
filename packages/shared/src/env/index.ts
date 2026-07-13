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
  OLLAMA_BASE_URL: z.string().url().optional(),
  PROVIDER_MODE: z.enum(['mvp', 'free', 'paid']).default('mvp'),
  ENABLE_WORKERS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
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
