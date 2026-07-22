import { describe, expect, it } from 'vitest';
import {
  computeHandoffConservation,
  selectHandoffEmptyState,
  campaignLifecycleDisplayLabel,
} from './generation-handoff.js';

describe('generation-handoff', () => {
  it('labels Ready as Submission Ready', () => {
    expect(campaignLifecycleDisplayLabel('Ready')).toBe('Submission Ready');
  });

  it('conservation holds for ready + blocked + completed', () => {
    const c = computeHandoffConservation([
      { id: '1', currentStatus: 'Ready', generationStatus: 'Completed' },
      { id: '2', currentStatus: 'Ready', generationStatus: 'Completed' },
      { id: '3', currentStatus: 'Package Generated', generationStatus: 'Completed', blockerReason: 'unsupported' },
      { id: '4', currentStatus: 'Submitted', generationStatus: 'Completed' },
    ]);
    expect(c.generatedPackages).toBe(4);
    expect(c.submissionReady).toBe(2);
    expect(c.blocked).toBe(1);
    expect(c.completed).toBe(1);
    expect(c.ok).toBe(true);
  });

  it('flags stranded Package Generated without blocker', () => {
    const c = computeHandoffConservation([
      { id: '1', currentStatus: 'Package Generated', generationStatus: 'Completed' },
    ]);
    expect(c.ok).toBe(false);
    expect(c.strandedPackageGenerated).toBe(1);
    expect(c.violations[0]?.id).toBe('1');
  });

  it('selects needs_review empty state', () => {
    const conservation = computeHandoffConservation([
      {
        id: '1',
        currentStatus: 'Package Generated',
        generationStatus: 'Needs Review',
        blockerReason: 'needs_review',
      },
    ]);
    const empty = selectHandoffEmptyState({
      submissionReady: 0,
      generationRunning: 0,
      generationRemaining: 0,
      conservation,
    });
    expect(empty?.kind).toBe('needs_review');
  });
});
