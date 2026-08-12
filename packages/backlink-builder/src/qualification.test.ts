import { describe, expect, it } from 'vitest';
import { qualifyOpportunity, MIN_QUALIFY_SCORE } from '../src/qualification.js';
import {
  analyzeDomainForImport,
  isDeadWebsiteAnalysis,
  type DomainAnalysisResult,
} from '../src/domain-analyzer.js';
import { classifyOpportunity } from '../src/classification.js';
import type { ClassificationResult } from '../src/classification.js';

function analysis(partial: Partial<DomainAnalysisResult>): DomainAnalysisResult {
  return {
    domain: 'example.com',
    websiteName: 'Example',
    niche: 'technology',
    language: 'en',
    country: 'US',
    domainRating: 50,
    monthlyTraffic: 10000,
    detectedPages: {},
    opportunityTypes: ['guest_post'],
    primaryType: 'guest_post',
    metadata: {},
    metricsSource: 'estimated',
    ...partial,
  };
}

function classification(partial: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    backlinkType: 'guest_post',
    opportunityScore: 67,
    relevanceScore: 60,
    spamRisk: 20,
    priority: 'medium',
    successProbability: 50,
    replyRate: 15,
    difficulty: 50,
    recommendedAction: 'test',
    scoreTier: 'medium',
    estimated: true,
    metricsSource: 'estimated',
    ...partial,
  };
}

describe('qualifyOpportunity', () => {
  it('uses existing medium tier floor', () => {
    expect(MIN_QUALIFY_SCORE).toBe(55);
    const q = qualifyOpportunity(
      analysis({}),
      classification({ opportunityScore: 40 })
    );
    expect(q.qualified).toBe(false);
    expect(q.reason).toMatch(/below medium tier/);
  });

  it('rejects without public submission path', () => {
    const q = qualifyOpportunity(
      analysis({ metricsSource: 'live', fetchStatusCode: 200, metadata: {} }),
      classification({ opportunityScore: 67 })
    );
    expect(q.qualified).toBe(false);
    expect(q.reason).toBe('No public submission path');
  });

  it('qualifies when live contribute path exists', () => {
    const q = qualifyOpportunity(
      analysis({
        metricsSource: 'live',
        fetchStatusCode: 200,
        homepageReachable: true,
        metadata: {
          hasGuestPostHint: true,
          submissionPathConfirmed: true,
          homepageReachable: true,
          homepageFetched: true,
        },
        detectedPages: { submission: 'https://example.com/contribute' },
      }),
      classification({ opportunityScore: 67, backlinkType: 'guest_post' })
    );
    expect(q.qualified).toBe(true);
    expect(q.classificationLabel).toBe('Guest Post');
  });

  it('rejects timeout / DNS failures as dead — never qualifies', () => {
    const q = qualifyOpportunity(
      analysis({
        metricsSource: 'estimated',
        homepageReachable: false,
        metadata: {
          liveProbeAttempted: true,
          homepageReachable: false,
          homepageFetchError: 'getaddrinfo ENOTFOUND',
        },
      }),
      classification({ opportunityScore: 95 })
    );
    expect(q.qualified).toBe(false);
    expect(q.reason).toMatch(/unreachable/i);
  });

  it('labels news as Editorial', () => {
    const q = qualifyOpportunity(
      analysis({
        metricsSource: 'live',
        homepageReachable: true,
        metadata: {
          hasGuidelines: true,
          submissionPathConfirmed: true,
          homepageReachable: true,
          homepageFetched: true,
        },
      }),
      classification({ backlinkType: 'news', opportunityScore: 74 })
    );
    expect(q.classificationLabel).toBe('Editorial');
    expect(q.qualified).toBe(true);
  });
});

describe('company import without live fetch', () => {
  it('submit.php directories qualify from URL path (no outbound HTTP)', async () => {
    const a = await analyzeDomainForImport(
      'groovy-directory.com',
      'https://groovy-directory.com/submit.php',
      async () => {
        throw new Error('network should not be called');
      },
      { skipLive: true }
    );
    expect(a.metadata.directoryPathConfirmed).toBe(true);
    expect(a.detectedPages.directory).toContain('submit.php');
    expect(isDeadWebsiteAnalysis(a)).toBe(false);
    const c = classifyOpportunity(a, {});
    const q = qualifyOpportunity(a, c);
    expect(q.signals.hasPublicSubmissionPath).toBe(true);
    expect(q.qualified).toBe(true);
  });

  it('submit_article.php and add.php qualify from URL path', async () => {
    const a = await analyzeDomainForImport(
      'freetoprankdirectory.com',
      'https://www.freetoprankdirectory.com/submit_article.php?id=145',
      async () => {
        throw new Error('network should not be called');
      },
      { skipLive: true }
    );
    expect(a.metadata.submissionPathConfirmed).toBe(true);
    const q = qualifyOpportunity(a, classifyOpportunity(a, {}));
    expect(q.signals.hasPublicSubmissionPath).toBe(true);
    expect(q.qualified).toBe(true);
  });
});
