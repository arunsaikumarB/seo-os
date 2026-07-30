import { describe, expect, it } from 'vitest';
import { qualifyOpportunity, MIN_QUALIFY_SCORE } from '../src/qualification.js';
import type { DomainAnalysisResult } from '../src/domain-analyzer.js';
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
        metadata: { hasGuestPostHint: true, submissionPathConfirmed: true },
        detectedPages: { submission: 'https://example.com/contribute' },
      }),
      classification({ opportunityScore: 67, backlinkType: 'guest_post' })
    );
    expect(q.qualified).toBe(true);
    expect(q.classificationLabel).toBe('Guest Post');
  });

  it('labels news as Editorial', () => {
    const q = qualifyOpportunity(
      analysis({
        metricsSource: 'live',
        metadata: { hasGuidelines: true, submissionPathConfirmed: true },
      }),
      classification({ backlinkType: 'news', opportunityScore: 74 })
    );
    expect(q.classificationLabel).toBe('Editorial');
    expect(q.qualified).toBe(true);
  });
});
