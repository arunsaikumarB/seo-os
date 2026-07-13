import { describe, expect, it } from 'vitest';
import {
  EstimatedAuthorityProvider,
  EstimatedKeywordProvider,
  ProviderManager,
  getProviderManager,
  resetProviderManager,
  type FrameworkProvider,
} from './index.js';

describe('Provider Integration Framework', () => {
  it('registers all provider types with estimated keyword/authority defaults', () => {
    resetProviderManager();
    const mgr = getProviderManager();
    const types = mgr.types();
    expect(types).toContain('keyword');
    expect(types).toContain('authority');
    expect(types).toContain('image');
    expect(types).toContain('llm');
    expect(mgr.getDefault('keyword').key).toBe('keyword.estimated');
    expect(mgr.getDefault('authority').key).toBe('authority.estimated');
    expect(mgr.getDefault('image').key).toBe('image.flux');
    expect(mgr.getDefault('browser').key).toBe('browser.playwright');
  });

  it('EstimatedKeywordProvider returns estimated metrics', async () => {
    const p = new EstimatedKeywordProvider();
    const vol = await p.searchVolume('seo tools');
    expect(vol.meta.isEstimated).toBe(true);
    expect(vol.data).toBeGreaterThan(0);
    const related = await p.relatedKeywords('seo');
    expect(related.data.length).toBeGreaterThan(2);
  });

  it('EstimatedAuthorityProvider returns estimated DA', async () => {
    const p = new EstimatedAuthorityProvider();
    const da = await p.domainAuthority('moz.com');
    expect(da.meta.isEstimated).toBe(true);
    expect(da.data).toBeGreaterThanOrEqual(15);
  });

  it('failover falls back to estimated when live fails', async () => {
    resetProviderManager();
    const mgr = new ProviderManager({
      preferred: { keyword: 'keyword.semrush' },
      enabledKeys: ['keyword.semrush', 'keyword.estimated'],
    });
    const result = await mgr.withFailover('keyword', async (provider: FrameworkProvider) => {
      if (!('searchVolume' in provider)) throw new Error('not keyword');
      return (provider as EstimatedKeywordProvider).searchVolume('backlinks');
    });
    expect(result.providerKey).toBe('keyword.estimated');
    expect(result.estimated).toBe(true);
    expect(result.attempted.length).toBeGreaterThan(0);
  });

  it('enable/disable is hot-swappable', () => {
    resetProviderManager();
    const mgr = getProviderManager();
    mgr.disable('keyword.estimated');
    expect(mgr.isEnabled('keyword.estimated')).toBe(false);
    mgr.enable('keyword.estimated');
    expect(mgr.isEnabled('keyword.estimated')).toBe(true);
  });
});
