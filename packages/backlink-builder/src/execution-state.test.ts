import { describe, expect, it } from 'vitest';
import {
  computeExecutionCounts,
  isHiddenFromProject,
  isVerificationEligible,
  toPublicExecutionStatus,
} from '../src/execution-state.js';

describe('execution state manager', () => {
  it('maps delete disposition to Deleted never Failed', () => {
    expect(toPublicExecutionStatus('deleted')).toBe('Deleted');
    expect(toPublicExecutionStatus('cancelled', { disposition: 'deleted_forever' })).toBe(
      'Deleted'
    );
    expect(toPublicExecutionStatus('failed')).toBe('Failed');
  });

  it('recalculates campaign total after deletes', () => {
    const jobs = [
      { id: '1', status: 'submitted' },
      { id: '2', status: 'running' as string },
      { id: '3', status: 'queued' },
      { id: '4', status: 'deleted' },
      { id: '5', status: 'deleted' },
      { id: '6', status: 'failed' },
      { id: '7', status: 'skipped' },
      { id: '8', status: 'watching_login' },
      { id: '9', status: 'navigating' },
      { id: '10', status: 'ignored' },
      { id: '11', status: 'submitted' },
    ].map((j) => ({
      ...j,
      status: j.status === 'running' ? 'navigating' : j.status,
    }));
    // 11 rows: 2 deleted + 1 ignored → campaignTotal 8
    // Running: navigating (id 2) + navigating (id 9) = 2
    const c = computeExecutionCounts(jobs);
    expect(c.Deleted).toBe(2);
    expect(c.Ignored).toBe(1);
    expect(c.campaignTotal).toBe(8);
    expect(c.Submitted).toBe(2);
    expect(c.Failed).toBe(1);
    expect(c.Skipped).toBe(1);
    expect(c['Waiting Human']).toBe(1);
    expect(c.Running).toBe(2);
    expect(c.Queued).toBe(1);
  });

  it('hides deleted from project and verification', () => {
    expect(isHiddenFromProject('deleted')).toBe(true);
    expect(isVerificationEligible('failed')).toBe(false);
    expect(isVerificationEligible('deleted')).toBe(false);
    expect(isVerificationEligible('submitted')).toBe(true);
  });
});
