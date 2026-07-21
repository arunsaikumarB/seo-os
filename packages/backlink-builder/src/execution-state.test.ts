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

  it('maps failed_to_start without counting toward progress', () => {
    expect(
      toPublicExecutionStatus('failed', { disposition: 'failed_to_start' })
    ).toBe('Failed to Start');
    const c = computeExecutionCounts([
      { id: '1', status: 'failed', disposition: 'failed_to_start' },
      { id: '2', status: 'failed', disposition: 'failed_to_start' },
      { id: '3', status: 'failed', disposition: 'failed_to_start' },
    ]);
    expect(c.campaignState).toBe('Failed To Start');
    expect(c.progressPercent).toBe(0);
    expect(c.totalExecutable).toBe(0);
    expect(c.campaignIsRunning).toBe(false);
    expect(c.aiStatusLine).toMatch(/failed before submission/i);
  });

  it('campaign is not Running until a site is Running', () => {
    const queuedOnly = computeExecutionCounts([
      { id: '1', status: 'queued' },
      { id: '2', status: 'queued' },
    ]);
    expect(queuedOnly.campaignState).toBe('Starting');
    expect(queuedOnly.campaignIsRunning).toBe(false);
    expect(queuedOnly.progressPercent).toBe(0);

    const running = computeExecutionCounts([
      { id: '1', status: 'navigating' },
      { id: '2', status: 'queued' },
    ]);
    expect(running.campaignState).toBe('Running');
    expect(running.campaignIsRunning).toBe(true);
    // Progress = (Running + Completed + Waiting Human) / Total Executable = 1/2
    expect(running.progressPercent).toBe(50);
  });

  it('waiting_infrastructure never looks like Running progress', () => {
    const c = computeExecutionCounts([
      { id: '1', status: 'waiting_infrastructure' },
      { id: '2', status: 'waiting_infrastructure' },
    ]);
    expect(c['Failed to Start']).toBe(2);
    expect(c.campaignState).toBe('Failed To Start');
    expect(c.progressPercent).toBe(0);
    expect(c.campaignIsRunning).toBe(false);
  });

  it('recalculates campaign total after deletes', () => {
    const jobs = [
      { id: '1', status: 'submitted' },
      { id: '2', status: 'navigating' },
      { id: '3', status: 'queued' },
      { id: '4', status: 'deleted' },
      { id: '5', status: 'deleted' },
      { id: '6', status: 'failed' },
      { id: '7', status: 'skipped' },
      { id: '8', status: 'watching_login' },
      { id: '9', status: 'navigating' },
      { id: '10', status: 'ignored' },
      { id: '11', status: 'submitted' },
    ];
    const c = computeExecutionCounts(jobs);
    expect(c.Deleted).toBe(2);
    expect(c.Ignored).toBe(1);
    expect(c.campaignTotal).toBe(8);
    expect(c.totalExecutable).toBe(8);
  });

  it('hides deleted from project and verification', () => {
    expect(isHiddenFromProject('deleted')).toBe(true);
    expect(isVerificationEligible('failed')).toBe(false);
    expect(isVerificationEligible('deleted')).toBe(false);
    expect(isVerificationEligible('submitted')).toBe(true);
  });
});
