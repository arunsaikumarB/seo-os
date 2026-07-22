/**
 * Campaign State Manager — lifecycle + AI Review helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  assignReviewTier,
  assertPackageAssetsComplete,
  campaignItemsToExecutionJobs,
  canTransitionCampaignLifecycle,
  computeAiReviewSummary,
  computeCampaignCounts,
  computeGenerationProgress,
  decideAfterAnalysis,
  deriveCampaignLifecycle,
  furthestCampaignLifecycle,
  lifecycleToExecutionJobStatus,
  normalizeCampaignWebsiteUrl,
  tierFromQualityScore,
} from '../src/campaign-state.js';
import { computeExecutionCounts } from '../src/execution-state.js';

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

  it('quality tiers use exact Phase 2/3 boundaries', () => {
    expect(tierFromQualityScore(91)).toBe('Completed');
    expect(tierFromQualityScore(90)).toBe('Needs Review');
    expect(tierFromQualityScore(70)).toBe('Needs Review');
    expect(tierFromQualityScore(69)).toBe('Failed');
  });

  it('assertPackageAssetsComplete rejects missing assets', () => {
    expect(() =>
      assertPackageAssetsComplete({
        packageStatus: 'generated',
        imageStatus: 'generated',
        metadataStatus: 'generated',
        videoMetadataStatus: 'generated',
        schemaStatus: 'pending',
      })
    ).toThrow(/schema/);
    expect(() =>
      assertPackageAssetsComplete({
        packageStatus: 'generated',
        imageStatus: 'generated',
        metadataStatus: 'generated',
        videoMetadataStatus: 'generated',
        schemaStatus: 'generated',
      })
    ).not.toThrow();
  });

  it('generation progress counts from generation_status', () => {
    const p = computeGenerationProgress([
      { id: '1', currentStatus: 'Approved', generationStatus: 'Queued' },
      { id: '2', currentStatus: 'Approved', generationStatus: 'Generating' },
      { id: '3', currentStatus: 'Ready', generationStatus: 'Completed' },
      { id: '4', currentStatus: 'Approved', generationStatus: 'Needs Review' },
      { id: '5', currentStatus: 'Failed', generationStatus: 'Failed' },
      { id: '6', currentStatus: 'Deleted', generationStatus: 'Completed' },
    ]);
    expect(p.queued).toBe(1);
    expect(p.generating).toBe(1);
    expect(p.completed).toBe(1);
    expect(p.needsReview).toBe(1);
    expect(p.failed).toBe(1);
    expect(p.active).toBe(true);
  });

  it('Phase 6.1 — Track Results cohort from CSM matches Waiting Human / remaining / progress', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `wh-${i}`,
        currentStatus: 'Waiting Human' as const,
        domain: `wh${i}.example`,
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `ready-${i}`,
        currentStatus: 'Ready' as const,
        domain: `ready${i}.example`,
      })),
    ];
    const csm = computeCampaignCounts(items);
    expect(csm.waiting).toBe(8);
    expect(csm.ready).toBe(7);
    expect(lifecycleToExecutionJobStatus('Waiting Human')).toBe('waiting_human');
    const jobs = campaignItemsToExecutionJobs(items);
    const exec = computeExecutionCounts(jobs);
    expect(exec.totalExecutable).toBe(15);
    expect(exec['Waiting Human']).toBe(8);
    expect(exec.Queued).toBe(7);
    expect(exec.progressPercent).toBe(53.3);
  });
});
