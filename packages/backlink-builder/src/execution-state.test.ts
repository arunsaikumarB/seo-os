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

  it('Phase 6.3.2 — Manual Skipped + Preparing/Queued is not Finished', () => {
    const c = computeExecutionCounts([
      { id: '1', status: 'skipped', disposition: 'manual_offline', opportunity_id: 'a' },
      { id: '2', status: 'skipped', disposition: 'manual_offline', opportunity_id: 'b' },
      { id: '3', status: 'preparing', opportunity_id: 'c' }, // public: Queued
      { id: '4', status: 'queued', opportunity_id: 'd' },
    ]);
    expect(c.Skipped).toBe(2);
    expect(c.Queued).toBe(2);
    expect(c.campaignOpen).toBe(2);
    expect(c.executionComplete).toBe(false);
    expect(c.campaignState).not.toBe('Completed');
  });

  it('Phase 6.3.2 — Preparing alone never marks executionComplete', () => {
    const c = computeExecutionCounts([
      { id: '1', status: 'skipped', opportunity_id: 'a' },
      { id: '2', status: 'launching_browser', opportunity_id: 'b' }, // Starting
    ]);
    expect(c.Starting).toBe(1);
    expect(c.executionComplete).toBe(false);
  });

  it('Phase 6.3.2 — Finished only when every active item is terminal', () => {
    const c = computeExecutionCounts([
      { id: '1', status: 'skipped', opportunity_id: 'a' },
      { id: '2', status: 'submitted', opportunity_id: 'b' },
      { id: '3', status: 'failed', opportunity_id: 'c' },
    ]);
    expect(c.executionComplete).toBe(true);
    expect(c.campaignState).toBe('Completed');
    expect(c.campaignOpen).toBe(0);
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

  it('prefers Waiting Human over Queued for campaign state', () => {
    const c = computeExecutionCounts([
      { id: '1', status: 'watching_login' },
      { id: '2', status: 'watching_login' },
      { id: '3', status: 'queued' },
      { id: '4', status: 'queued' },
    ]);
    expect(c.campaignState).toBe('Waiting Human');
    expect(c.aiStatusLine).toMatch(/waiting for you/i);
    expect(c.Queued).toBe(2);
    expect(c['Waiting Human']).toBe(2);
  });

  it('progress includes running and waiting human (Phase 4.7)', () => {
    // 10 completed + 4 running + 2 waiting + 4 queued = 20 → 80%
    const jobs = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, status: 'submitted' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, status: 'navigating' })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `w${i}`, status: 'watching_login' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, status: 'queued' })),
    ];
    const c = computeExecutionCounts(jobs);
    expect(c.totalExecutable).toBe(20);
    expect(c.Submitted + c.Completed).toBe(10);
    expect(c.Running).toBe(4);
    expect(c['Waiting Human']).toBe(2);
    expect(c.Queued).toBe(4);
    expect(c.progressPercent).toBe(80);
  });

  it('hides deleted from project and verification', () => {
    expect(isHiddenFromProject('deleted')).toBe(true);
    expect(isVerificationEligible('failed')).toBe(false);
    expect(isVerificationEligible('deleted')).toBe(false);
    expect(isVerificationEligible('submitted')).toBe(true);
  });

  it('Phase 6: dedupes multiple jobs per opportunity to one count', () => {
    const c = computeExecutionCounts([
      { id: 'a1', status: 'queued', opportunity_id: 'opp-1', created_at: '2026-01-01T00:00:00Z' },
      {
        id: 'a2',
        status: 'watching_login',
        opportunity_id: 'opp-1',
        created_at: '2026-01-01T00:01:00Z',
      },
      { id: 'a3', status: 'queued', opportunity_id: 'opp-1', created_at: '2026-01-01T00:02:00Z' },
      { id: 'b1', status: 'navigating', opportunity_id: 'opp-2', created_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(c['Waiting Human']).toBe(1);
    expect(c.Running).toBe(1);
    expect(c.Queued).toBe(0);
    expect(c.totalExecutable).toBe(2);
    expect(c.campaignTotal).toBe(2);
  });
});
