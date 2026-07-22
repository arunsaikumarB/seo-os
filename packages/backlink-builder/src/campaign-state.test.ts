/**
 * Campaign State Manager — lifecycle + AI Review helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  assignReviewTier,
  canTransitionCampaignLifecycle,
  computeAiReviewSummary,
  computeCampaignCounts,
  decideAfterAnalysis,
  deriveCampaignLifecycle,
  furthestCampaignLifecycle,
  normalizeCampaignWebsiteUrl,
} from '../src/campaign-state.js';

describe('campaign state manager', () => {
  it('rejects illegal transitions', () => {
    expect(canTransitionCampaignLifecycle('Imported', 'Approved')).toBe(false);
    expect(canTransitionCampaignLifecycle('Imported', 'Analyzed')).toBe(true);
    expect(canTransitionCampaignLifecycle('Ready', 'Deleted')).toBe(true);
  });

  it('normalizes urls for dedupe', () => {
    expect(normalizeCampaignWebsiteUrl('HTTPS://WWW.Example.com/path/')).toBe(
      'https://example.com/path'
    );
  });

  it('derives furthest lifecycle from evidence', () => {
    expect(
      deriveCampaignLifecycle({
        hasImport: true,
        hasClassification: true,
        queueStatus: 'approved',
        hasContentPack: true,
        contentPackReady: true,
      })
    ).toBe('Ready');
  });

  it('counts are derived — deleted excluded from imported', () => {
    const c = computeCampaignCounts([
      { id: '1', currentStatus: 'Imported' },
      { id: '2', currentStatus: 'Approved' },
      { id: '3', currentStatus: 'Submitted' },
      { id: '4', currentStatus: 'Deleted' },
      { id: '5', currentStatus: 'Verified' },
    ]);
    expect(c.imported).toBe(4);
    expect(c.approved).toBe(3);
    expect(c.submitted).toBe(2);
    expect(c.verified).toBe(1);
    expect(c.deleted).toBe(1);
    expect(c.totalIncludingDeleted).toBe(5);
  });

  it('furthest prefers main path progress', () => {
    expect(furthestCampaignLifecycle(['Imported', 'Submitted', 'Classified'])).toBe(
      'Submitted'
    );
  });

  it('assigns review tiers with exact boundaries', () => {
    expect(assignReviewTier(91, 'directory')).toBe('auto_approved');
    expect(assignReviewTier(90, 'directory')).toBe('recommended');
    expect(assignReviewTier(70, 'directory')).toBe('recommended');
    expect(assignReviewTier(69, 'directory')).toBe('needs_classification');
    expect(assignReviewTier(99, 'unknown')).toBe('needs_classification');
  });

  it('auto-approves only above 90', () => {
    const auto = decideAfterAnalysis({
      confidenceScore: 95,
      classificationId: 'directory',
    });
    expect(auto.reviewDecision).toBe('Approved');
    expect(auto.approvedBy).toBe('auto');
    expect(auto.lifecycle).toBe('Approved');

    const rec = decideAfterAnalysis({
      confidenceScore: 85,
      classificationId: 'directory',
    });
    expect(rec.reviewDecision).toBe('Pending');
    expect(rec.lifecycle).toBe('Classified');
  });

  it('AI Review summary invariant holds', () => {
    const s = computeAiReviewSummary([
      { id: '1', currentStatus: 'Approved', reviewDecision: 'Approved' },
      { id: '2', currentStatus: 'Classified', reviewDecision: 'Pending', reviewTier: 'recommended' },
      { id: '3', currentStatus: 'Classified', reviewDecision: 'Needs Classification' },
      { id: '4', currentStatus: 'Rejected', reviewDecision: 'Rejected' },
      { id: '5', currentStatus: 'Deleted', reviewDecision: 'Approved' },
    ]);
    expect(s.imported).toBe(4);
    expect(s.invariantOk).toBe(true);
    expect(
      s.approved +
        s.rejected +
        s.needsClassification +
        s.unsupported +
        s.duplicate +
        s.dead +
        s.pending
    ).toBe(4);
  });
});
