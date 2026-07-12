import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAGS } from '../src/feature-flags/index.js';
import { normalizeSupabaseUrl } from '../src/env/index.js';

describe('feature flags', () => {
  it('covers every flag with a default', () => {
    for (const flag of FEATURE_FLAGS) {
      expect(typeof DEFAULT_FEATURE_FLAGS[flag]).toBe('boolean');
    }
  });

  it('keeps marketplace off by default', () => {
    expect(DEFAULT_FEATURE_FLAGS.marketplace).toBe(false);
  });
});

describe('env helpers', () => {
  it('normalizes supabase urls', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest')).toBe('https://abc.supabase.co');
    expect(normalizeSupabaseUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co');
  });
});
