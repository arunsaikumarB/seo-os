import { describe, expect, it } from 'vitest';
import type { CampaignItemInput } from './campaign-state.js';
import {
  deriveWorkflowProgressInput,
  getWorkflowProgress,
} from './workflow-progress.js';

function item(
  partial: Partial<CampaignItemInput> & { id: string; currentStatus: CampaignItemInput['currentStatus'] }
): CampaignItemInput {
  return {
    websiteUrl: `${partial.id}.example`,
    domain: `${partial.id}.example`,
    ...partial,
  };
}

describe('getWorkflowProgress (Phase 13)', () => {
  it('6 approved + 0 generated → Create/Import/AI Review done, Generate current, Submit+ upcoming', () => {
    const items: CampaignItemInput[] = Array.from({ length: 6 }, (_, i) =>
      item({
        id: `a${i}`,
        currentStatus: 'Approved',
        reviewDecision: 'Approved',
        generationStatus: null,
      })
    );

    const input = deriveWorkflowProgressInput({
      projectReady: true,
      items,
      hasReport: false,
    });
    expect(input.importedCount).toBe(6);
    expect(input.aiReviewPending).toBe(0);
    expect(input.approvedCount).toBe(6);
    expect(input.generatedPackages).toBe(0);
    expect(input.pendingGeneration).toBe(6);
    expect(input.failedGeneration).toBe(0);

    const progress = getWorkflowProgress(input);
    expect(progress.flags.createDone).toBe(true);
    expect(progress.flags.importDone).toBe(true);
    expect(progress.flags.aiReviewDone).toBe(true);
    expect(progress.flags.generateDone).toBe(false);
    expect(progress.flags.submitDone).toBe(false);
    expect(progress.currentStepId).toBe('generate-content');
    expect(progress.completedCount).toBe(3);
    expect(progress.steps.find((s) => s.id === 'create-project')?.state).toBe('done');
    expect(progress.steps.find((s) => s.id === 'import-websites')?.state).toBe('done');
    expect(progress.steps.find((s) => s.id === 'ai-review')?.state).toBe('done');
    expect(progress.steps.find((s) => s.id === 'generate-content')?.state).toBe('current');
    expect(progress.steps.find((s) => s.id === 'submit-backlinks')?.state).toBe('upcoming');
    expect(progress.steps.find((s) => s.id === 'track-results')?.state).toBe('upcoming');
    expect(progress.steps.find((s) => s.id === 'reports-analytics')?.state).toBe('upcoming');
  });

  it('does not mark Generate done when packages exist but generation still pending', () => {
    const progress = getWorkflowProgress({
      projectReady: true,
      importedCount: 2,
      aiReviewPending: 0,
      aiNeedsReview: 0,
      approvedCount: 2,
      generatedPackages: 1,
      pendingGeneration: 1,
      failedGeneration: 0,
      contentReadyCount: 1,
      submitOpenCount: 1,
      hasTrackedResults: false,
      hasReport: false,
    });
    expect(progress.flags.generateDone).toBe(false);
    expect(progress.currentStepId).toBe('generate-content');
  });

  it('flips Generate done and Submit current when all packages complete', () => {
    const items: CampaignItemInput[] = Array.from({ length: 6 }, (_, i) =>
      item({
        id: `g${i}`,
        currentStatus: 'Ready',
        reviewDecision: 'Approved',
        generationStatus: 'Completed',
      })
    );
    const progress = getWorkflowProgress(
      deriveWorkflowProgressInput({ projectReady: true, items })
    );
    expect(progress.flags.generateDone).toBe(true);
    expect(progress.flags.submitDone).toBe(false);
    expect(progress.currentStepId).toBe('submit-backlinks');
    expect(progress.completedCount).toBe(4);
  });

  it('never marks later steps done from empty visitation-style input', () => {
    const progress = getWorkflowProgress({
      projectReady: true,
      importedCount: 0,
      aiReviewPending: 0,
      aiNeedsReview: 0,
      approvedCount: 0,
      generatedPackages: 0,
      pendingGeneration: 0,
      failedGeneration: 0,
      contentReadyCount: 0,
      submitOpenCount: 0,
      hasTrackedResults: false,
      hasReport: false,
    });
    expect(progress.currentStepId).toBe('import-websites');
    expect(progress.completedCount).toBe(1);
    expect(progress.flags.aiReviewDone).toBe(false);
    expect(progress.flags.generateDone).toBe(false);
    expect(progress.flags.submitDone).toBe(false);
  });

  it('marks AI Review done when Recommended is clear and ≥1 approved (Needs review optional)', () => {
    const items: CampaignItemInput[] = [
      item({
        id: '1',
        currentStatus: 'Classified',
        reviewDecision: 'Needs Classification',
        reviewTier: 'needs_classification',
      }),
      item({
        id: '2',
        currentStatus: 'Approved',
        reviewDecision: 'Approved',
      }),
    ];
    const progress = getWorkflowProgress(
      deriveWorkflowProgressInput({ projectReady: true, items })
    );
    expect(progress.flags.aiReviewDone).toBe(true);
    expect(progress.currentStepId).toBe('generate-content');
  });

  it('keeps AI Review current while Recommended confirms remain', () => {
    const items: CampaignItemInput[] = [
      item({
        id: '1',
        currentStatus: 'Classified',
        reviewDecision: 'Pending',
        reviewTier: 'recommended',
      }),
      item({
        id: '2',
        currentStatus: 'Approved',
        reviewDecision: 'Approved',
      }),
    ];
    const progress = getWorkflowProgress(
      deriveWorkflowProgressInput({ projectReady: true, items })
    );
    expect(progress.flags.aiReviewDone).toBe(false);
    expect(progress.currentStepId).toBe('ai-review');
  });

  it('keeps AI Review current when only Needs review remains and nothing approved', () => {
    const items: CampaignItemInput[] = [
      item({
        id: '1',
        currentStatus: 'Classified',
        reviewDecision: 'Needs Classification',
        reviewTier: 'needs_classification',
      }),
    ];
    const progress = getWorkflowProgress(
      deriveWorkflowProgressInput({ projectReady: true, items })
    );
    expect(progress.flags.aiReviewDone).toBe(false);
    expect(progress.currentStepId).toBe('ai-review');
  });

  it('marks Submit done only when every content-ready item is terminal', () => {
    const items: CampaignItemInput[] = [
      item({
        id: '1',
        currentStatus: 'Submitted',
        reviewDecision: 'Approved',
        generationStatus: 'Completed',
      }),
      item({
        id: '2',
        currentStatus: 'Ready',
        reviewDecision: 'Approved',
        generationStatus: 'Completed',
      }),
    ];
    const progress = getWorkflowProgress(
      deriveWorkflowProgressInput({ projectReady: true, items })
    );
    expect(progress.flags.generateDone).toBe(true);
    expect(progress.flags.submitDone).toBe(false);
    expect(progress.currentStepId).toBe('submit-backlinks');
  });
});
