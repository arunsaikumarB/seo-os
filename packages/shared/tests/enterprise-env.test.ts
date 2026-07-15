import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAGS } from '../src/feature-flags/index.js';
import { parseApiEnv } from '../src/env/index.js';

describe('enterprise feature flag surface', () => {
  it('includes provider and bee flags', () => {
    expect(FEATURE_FLAGS).toContain('provider_llm');
    expect(FEATURE_FLAGS).toContain('bee_enabled');
    expect(FEATURE_FLAGS).toContain('v13_image_generation');
    expect(DEFAULT_FEATURE_FLAGS.bee_automatic_submit).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.v13_image_generation).toBe(true);
  });
});

describe('api env parsing', () => {
  it('accepts optional SENTRY_DSN', () => {
    const env = parseApiEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      SUPABASE_JWT_SECRET: 'jwt-secret-value',
      DATABASE_URL: 'postgres://localhost/seo',
      SENTRY_DSN: 'https://key@o0.ingest.sentry.io/1',
      NODE_ENV: 'test',
      ENABLE_WORKERS: 'false',
    });
    expect(env.SENTRY_DSN).toContain('sentry.io');
  });
});
