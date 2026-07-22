/**
 * Campaign State Manager — lifecycle + count helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  canTransitionCampaignLifecycle,
  computeCampaignCounts,
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
});
