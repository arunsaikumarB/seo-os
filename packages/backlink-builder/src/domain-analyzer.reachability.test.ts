import { describe, expect, it } from 'vitest';
import {
  analyzeDomainLive,
  isDeadWebsiteAnalysis,
  isUnreachableHttpStatus,
} from './domain-analyzer.js';
import { decideAfterAnalysis } from './campaign-state.js';

describe('isDeadWebsiteAnalysis (hard reachability gate)', () => {
  it('marks timeout / DNS fetch errors as dead', () => {
    expect(
      isDeadWebsiteAnalysis({
        metadata: {
          liveProbeAttempted: true,
          homepageFetched: false,
          homepageReachable: false,
          homepageFetchError: 'The operation was aborted due to timeout',
        },
      })
    ).toBe(true);
  });

  it('marks HTTP 403/404/522 as dead', () => {
    expect(isUnreachableHttpStatus(403)).toBe(true);
    expect(isUnreachableHttpStatus(404)).toBe(true);
    expect(isUnreachableHttpStatus(522)).toBe(true);
    expect(isUnreachableHttpStatus(200)).toBe(false);
    expect(
      isDeadWebsiteAnalysis({
        fetchStatusCode: 522,
        homepageReachable: false,
        metadata: { homepageFetchError: 'http_522', homepageReachable: false },
      })
    ).toBe(true);
  });

  it('does not mark reachable homepage as dead', () => {
    expect(
      isDeadWebsiteAnalysis({
        fetchStatusCode: 200,
        homepageReachable: true,
        metadata: { homepageFetched: true, homepageReachable: true, liveProbeAttempted: true },
      })
    ).toBe(false);
  });

  it('never auto-approves when deadWebsite is true', () => {
    const d = decideAfterAnalysis({
      confidenceScore: 99,
      classificationId: 'directory',
      deadWebsite: true,
    });
    expect(d.reviewDecision).toBe('Dead Website');
    expect(d.lifecycle).toBe('Failed');
    expect(d.approvedBy).toBeNull();
  });

  it('never auto-approves high confidence without form confirmation', () => {
    const d = decideAfterAnalysis({
      confidenceScore: 99,
      classificationId: 'directory',
      homepageReachable: true,
    });
    expect(d.reviewDecision).toBe('Pending');
    expect(d.approvedBy).toBeNull();
  });

  it('auto-approves only with reachable homepage + confirmed form', () => {
    const d = decideAfterAnalysis({
      confidenceScore: 99,
      classificationId: 'directory',
      homepageReachable: true,
      formConfirmed: true,
    });
    expect(d.reviewDecision).toBe('Approved');
    expect(d.approvedBy).toBe('auto');
  });

  it('analyzeDomainLive: transport failure → homepageReachable false', async () => {
    const result = await analyzeDomainLive('addedtheurl.com', undefined, async () => {
      throw new Error('fetch failed');
    });
    expect(result.homepageReachable).toBe(false);
    expect(result.metricsSource).toBe('estimated');
    expect(isDeadWebsiteAnalysis(result)).toBe(true);
  });

  it('analyzeDomainLive: HTTP 522 → dead, robots alone cannot fake live', async () => {
    const result = await analyzeDomainLive('2wdirectory.com', undefined, async (input) => {
      const url = String(input);
      if (url.includes('robots.txt')) {
        return new Response('User-agent: *\nAllow: /', { status: 200 });
      }
      if (url.includes('sitemap')) {
        return new Response('<urlset></urlset>', { status: 200 });
      }
      return new Response('timeout', { status: 522 });
    });
    expect(result.homepageReachable).toBe(false);
    expect(result.fetchStatusCode).toBe(522);
    expect(result.metricsSource).toBe('estimated');
    expect(isDeadWebsiteAnalysis(result)).toBe(true);
  });

  it('analyzeDomainLive: 200 homepage → reachable live', async () => {
    const result = await analyzeDomainLive('example.com', undefined, async (input) => {
      const url = String(input);
      if (url.includes('robots') || url.includes('sitemap')) {
        return new Response('ok', { status: 404 });
      }
      return new Response('<html><body>contact write for us</body></html>', { status: 200 });
    });
    expect(result.homepageReachable).toBe(true);
    expect(result.metricsSource).toBe('live');
    expect(isDeadWebsiteAnalysis(result)).toBe(false);
  });
});
