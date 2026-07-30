/**
 * Phase 13 — Guided workflow stepper state from Campaign State Manager.
 * Never derive done/current from page visits or localStorage.
 */
import {
  computeAiReviewSummary,
  type CampaignItemInput,
  type CampaignLifecycleStatus,
} from './campaign-state.js';

export const GUIDED_WORKFLOW_STEP_IDS = [
  'create-project',
  'import-websites',
  'ai-review',
  'generate-content',
  'submit-backlinks',
  'track-results',
  'reports-analytics',
] as const;

export type GuidedWorkflowStepId = (typeof GUIDED_WORKFLOW_STEP_IDS)[number];

export type WorkflowStepState = 'done' | 'current' | 'upcoming';

/** CSM-derived counts — sole input to getWorkflowProgress. */
export type WorkflowProgressInput = {
  /** Project exists with domain + URL saved */
  projectReady: boolean;
  /** ≥1 non-deleted imported website */
  importedCount: number;
  /**
   * Sites still awaiting analysis or classification.
   * AI Review is done only when this is 0 (and importedCount > 0).
   */
  aiReviewPending: number;
  /** Sites approved for content generation (Approved cohort) */
  approvedCount: number;
  /** Approved sites with a finished package */
  generatedPackages: number;
  /** Approved sites still queued / generating / not started */
  pendingGeneration: number;
  /** Approved sites whose generation failed */
  failedGeneration: number;
  /** Packages that belong on the submit lane (content-ready + terminal) */
  contentReadyCount: number;
  /** Content-ready items still not_started / in_progress (not Done/Verified/Skipped) */
  submitOpenCount: number;
  /** At least one Submitted / Verified / Completed result to track */
  hasTrackedResults: boolean;
  /** At least one generated report */
  hasReport: boolean;
};

export type WorkflowStepProgress = {
  id: GuidedWorkflowStepId;
  number: number;
  state: WorkflowStepState;
};

export type WorkflowProgress = {
  steps: WorkflowStepProgress[];
  currentStepId: GuidedWorkflowStepId;
  completedCount: number;
  totalSteps: number;
  progressPercent: number;
  allComplete: boolean;
  /** Echo of evaluated completion flags (debug / UI) */
  flags: {
    createDone: boolean;
    importDone: boolean;
    aiReviewDone: boolean;
    generateDone: boolean;
    submitDone: boolean;
    trackResultsDone: boolean;
    reportsDone: boolean;
  };
};

const GENERATED_LIFECYCLES: CampaignLifecycleStatus[] = [
  'Package Generated',
  'Ready',
  'Submitting',
  'Waiting Human',
  'Retrying',
  'Submitted',
  'Verified',
  'Completed',
];

const APPROVED_COHORT: CampaignLifecycleStatus[] = [
  'Approved',
  ...GENERATED_LIFECYCLES,
];

const SUBMIT_TERMINAL: CampaignLifecycleStatus[] = [
  'Submitted',
  'Verified',
  'Completed',
  'Skipped',
];

const SUBMIT_OPEN: CampaignLifecycleStatus[] = [
  'Package Generated',
  'Ready',
  'Submitting',
  'Waiting Human',
  'Retrying',
  'Failed',
];

function stepDoneFlags(input: WorkflowProgressInput) {
  const createDone = Boolean(input.projectReady);
  const importDone = createDone && input.importedCount >= 1;
  const aiReviewDone = importDone && input.aiReviewPending === 0;
  const generateDone =
    aiReviewDone &&
    (input.approvedCount === 0 ||
      (input.generatedPackages >= input.approvedCount &&
        input.pendingGeneration === 0 &&
        input.failedGeneration === 0));
  const submitDone =
    generateDone &&
    (input.contentReadyCount === 0 || input.submitOpenCount === 0);
  // Track Results: informational — done only when real results exist (never on visit)
  const trackResultsDone = submitDone && input.hasTrackedResults;
  const reportsDone = trackResultsDone && input.hasReport;
  return {
    createDone,
    importDone,
    aiReviewDone,
    generateDone,
    submitDone,
    trackResultsDone,
    reportsDone,
  };
}

/**
 * Single source of truth for Create → Reports stepper.
 * A step is `done` only when its CSM condition is met; the first incomplete
 * step is `current`; the rest are `upcoming`.
 */
export function getWorkflowProgress(input: WorkflowProgressInput): WorkflowProgress {
  const flags = stepDoneFlags(input);
  const doneById: Record<GuidedWorkflowStepId, boolean> = {
    'create-project': flags.createDone,
    'import-websites': flags.importDone,
    'ai-review': flags.aiReviewDone,
    'generate-content': flags.generateDone,
    'submit-backlinks': flags.submitDone,
    'track-results': flags.trackResultsDone,
    'reports-analytics': flags.reportsDone,
  };

  let currentStepId: GuidedWorkflowStepId = 'reports-analytics';
  for (const id of GUIDED_WORKFLOW_STEP_IDS) {
    if (!doneById[id]) {
      currentStepId = id;
      break;
    }
  }

  const steps: WorkflowStepProgress[] = GUIDED_WORKFLOW_STEP_IDS.map((id, index) => {
    const done = doneById[id];
    const state: WorkflowStepState = done
      ? 'done'
      : id === currentStepId
        ? 'current'
        : 'upcoming';
    return { id, number: index + 1, state };
  });

  const completedCount = steps.filter((s) => s.state === 'done').length;
  const totalSteps = steps.length;
  const allComplete = completedCount === totalSteps;

  return {
    steps,
    currentStepId,
    completedCount,
    totalSteps,
    progressPercent: Math.round((completedCount / Math.max(totalSteps, 1)) * 100),
    allComplete,
    flags,
  };
}

/** Map CSM campaign items (+ project/report flags) → progress input. */
export function deriveWorkflowProgressInput(opts: {
  projectReady: boolean;
  items: CampaignItemInput[];
  hasReport?: boolean;
}): WorkflowProgressInput {
  const visible = opts.items.filter((i) => i.currentStatus !== 'Deleted');
  const ai = computeAiReviewSummary(visible);
  const aiReviewPending = ai.needsClassification + ai.pending;

  let approvedCount = 0;
  let generatedPackages = 0;
  let pendingGeneration = 0;
  let failedGeneration = 0;
  let contentReadyCount = 0;
  let submitOpenCount = 0;
  let tracked = 0;

  for (const item of visible) {
    const status = item.currentStatus;
    const gen = item.generationStatus ?? null;

    const inApprovedCohort =
      APPROVED_COHORT.includes(status) ||
      item.reviewDecision === 'Approved' ||
      item.approval === 'approved';

    if (inApprovedCohort && status !== 'Rejected' && status !== 'Ignored') {
      approvedCount++;
      if (gen === 'Failed') {
        failedGeneration++;
      } else if (
        gen === 'Completed' ||
        gen === 'Needs Review' ||
        GENERATED_LIFECYCLES.includes(status)
      ) {
        generatedPackages++;
      } else {
        // Idle / Queued / Generating / null — not yet a finished package
        pendingGeneration++;
      }
    }

    if (
      SUBMIT_OPEN.includes(status) ||
      SUBMIT_TERMINAL.includes(status)
    ) {
      contentReadyCount++;
      if (SUBMIT_OPEN.includes(status)) submitOpenCount++;
    }

    if (
      status === 'Submitted' ||
      status === 'Verified' ||
      status === 'Completed'
    ) {
      tracked++;
    }
  }

  return {
    projectReady: opts.projectReady,
    importedCount: visible.length,
    aiReviewPending,
    approvedCount,
    generatedPackages,
    pendingGeneration,
    failedGeneration,
    contentReadyCount,
    submitOpenCount,
    hasTrackedResults: tracked > 0,
    hasReport: Boolean(opts.hasReport),
  };
}
