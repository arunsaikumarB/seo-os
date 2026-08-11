import { z } from 'zod';

const optionalUrl = z
  .union([z.string().url(), z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production', 'staging']).default('development'),
  PORT: z.coerce.number().default(3001),
  API_URL: z.string().url().optional(),
  /**
   * Phase 5 — company / DD3-style stack in one switch.
   * When true: forces AUTH_MODE=local + DATA_MODE=pg and does not require live Supabase credentials.
   */
  COMPANY_STACK: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  /**
   * Auth cutover flag (Phase 2).
   * - supabase (default): web uses Supabase Auth; API verifies Supabase JWTs
   * - local: API `/v1/auth/login|signup` issues HS256 JWTs
   */
  AUTH_MODE: z.enum(['supabase', 'local']).default('supabase'),
  /**
   * Data access cutover (Phase 4).
   * - supabase (default): PostgREST via service role
   * - pg: node-pg / PostgREST-compat
   */
  DATA_MODE: z.enum(['supabase', 'pg']).default('supabase'),
  SUPABASE_URL: optionalUrl,
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  /** Required for company/local JWT signing when SUPABASE_JWT_SECRET is absent */
  LOCAL_JWT_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ENCRYPTION_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: optionalUrl,
  PROVIDER_MODE: z.enum(['mvp', 'free', 'paid']).default('mvp'),
  ENABLE_WORKERS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  CONTENT_GEN_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema> & {
  /** True when COMPANY_STACK or local+pg company profile is active */
  companyStack: boolean;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
};

/** Supabase project URL only — strips accidental `/rest` suffix from dashboard copy-paste. */
export function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/?$/i, '').replace(/\/$/, '');
}

export function isCompanyStackEnv(env: {
  COMPANY_STACK?: boolean;
  AUTH_MODE?: string;
  DATA_MODE?: string;
}): boolean {
  if (env.COMPANY_STACK) return true;
  return env.AUTH_MODE === 'local' && env.DATA_MODE === 'pg';
}

export function parseApiEnv(env: NodeJS.ProcessEnv): ApiEnv {
  const parsed = apiEnvSchema.parse(env);
  const companyStack = isCompanyStackEnv(parsed);

  const enableWorkers =
    env.ENABLE_WORKERS !== undefined
      ? env.ENABLE_WORKERS === 'true'
      : parsed.NODE_ENV === 'production';

  if (!companyStack) {
    const missing: string[] = [];
    if (!parsed.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!parsed.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
    if (!parsed.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!parsed.SUPABASE_JWT_SECRET) missing.push('SUPABASE_JWT_SECRET');
    if (missing.length) {
      throw new Error(
        `Missing required Supabase env for non-company stack: ${missing.join(', ')}. ` +
          `Or set COMPANY_STACK=true (with AUTH_MODE=local DATA_MODE=pg) for company Postgres.`
      );
    }
  }

  const jwtSecret =
    parsed.LOCAL_JWT_SECRET ||
    parsed.SUPABASE_JWT_SECRET ||
    (companyStack && parsed.NODE_ENV === 'development'
      ? 'dev-only-company-stack-jwt-secret-change-me'
      : undefined);

  if (companyStack && !jwtSecret) {
    throw new Error(
      'Company stack requires LOCAL_JWT_SECRET (or SUPABASE_JWT_SECRET) with at least 32 characters.'
    );
  }

  if (
    (parsed.NODE_ENV === 'production' || parsed.NODE_ENV === 'staging') &&
    !parsed.ENCRYPTION_KEY
  ) {
    console.warn(
      '[seo-os] ENCRYPTION_KEY is not set — integration credentials fall back to a dev key. Set ENCRYPTION_KEY in production.'
    );
  }

  if (companyStack && jwtSecret?.startsWith('dev-only-company-stack')) {
    console.warn(
      '[seo-os] Using development LOCAL_JWT_SECRET placeholder. Set LOCAL_JWT_SECRET for any shared/company deploy.'
    );
  }

  const authMode = parsed.COMPANY_STACK ? 'local' : parsed.AUTH_MODE;
  const dataMode = parsed.COMPANY_STACK ? 'pg' : parsed.DATA_MODE;

  return {
    ...parsed,
    companyStack,
    AUTH_MODE: authMode,
    DATA_MODE: dataMode,
    SUPABASE_URL: normalizeSupabaseUrl(
      parsed.SUPABASE_URL ?? 'http://127.0.0.1:54321'
    ),
    SUPABASE_ANON_KEY: parsed.SUPABASE_ANON_KEY ?? 'company-stack-unused-anon',
    SUPABASE_SERVICE_ROLE_KEY:
      parsed.SUPABASE_SERVICE_ROLE_KEY ?? 'company-stack-unused-service-role',
    SUPABASE_JWT_SECRET: jwtSecret ?? 'company-stack-unused-jwt-secret-value',
    LOCAL_JWT_SECRET: parsed.LOCAL_JWT_SECRET ?? jwtSecret,
    ENABLE_WORKERS: enableWorkers,
  };
}

export const webEnvSchema = z
  .object({
    VITE_SUPABASE_URL: optionalUrl,
    VITE_SUPABASE_ANON_KEY: z.string().optional(),
    VITE_API_URL: z.string().url(),
    /** Auth cutover (Phase 3). Default supabase. */
    VITE_AUTH_MODE: z.enum(['supabase', 'local']).default('supabase'),
  })
  .superRefine((data, ctx) => {
    if (data.VITE_AUTH_MODE === 'local') return;
    if (!data.VITE_SUPABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'VITE_SUPABASE_URL is required when VITE_AUTH_MODE=supabase',
        path: ['VITE_SUPABASE_URL'],
      });
    }
    if (!data.VITE_SUPABASE_ANON_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'VITE_SUPABASE_ANON_KEY is required when VITE_AUTH_MODE=supabase',
        path: ['VITE_SUPABASE_ANON_KEY'],
      });
    }
  });

export type WebEnv = z.infer<typeof webEnvSchema>;
