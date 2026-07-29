import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  WORKFLOW_STEPS,
  type WorkflowStep,
} from '@/config/workflow-steps';
import { useAppStore } from '@/stores/app-store';
import { useExecutionSummary } from '@/hooks/use-execution-summary';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { formatEta } from '@/lib/bee-execution-ui';
import { useApi } from '@/hooks/use-api';

export { isSuccessfulImportRecord } from '@/lib/import-success';

function stepMatchesPath(step: WorkflowStep, path: string, projectId: string): boolean {
  if (step.orgLevel) return false;
  const normalized = path.replace(`/projects/${projectId}/`, '').replace(/^\//, '');
  return normalized === step.route || normalized.startsWith(`${step.route}/`);
}

export function getStepHref(step: WorkflowStep, projectId: string): string {
  if (step.orgLevel) return step.route;
  return `/projects/${projectId}/${step.route}`;
}

type WorkflowProgressApi = {
  currentStepId: string;
  completedCount: number;
  totalSteps: number;
  progressPercent: number;
  allComplete: boolean;
  steps: Array<{ id: string; number: number; state: 'done' | 'current' | 'upcoming' }>;
  flags: {
    createDone: boolean;
    importDone: boolean;
    aiReviewDone: boolean;
    generateDone: boolean;
    submitDone: boolean;
    trackResultsDone: boolean;
    reportsDone: boolean;
  };
  input: {
    projectReady: boolean;
    importedCount: number;
    aiReviewPending: number;
    aiNeedsReview: number;
    approvedCount: number;
    generatedPackages: number;
    pendingGeneration: number;
    failedGeneration: number;
    contentReadyCount: number;
    submitOpenCount: number;
    hasTrackedResults: boolean;
    hasReport: boolean;
  };
  timings?: Array<{
    stepId: string;
    phase: 'idle' | 'running' | 'done';
    estimateMinutes: number;
    elapsedMs: number | null;
    startedAt?: string | null;
  }>;
};

/**
 * Workflow State Manager — single source of truth for guided UX.
 * Step done/current/upcoming comes ONLY from CSM via getWorkflowProgress
 * (GET .../workflow-progress). Never from page visits or localStorage.
 */
export function useWorkflow(projectId: string) {
  const location = useLocation();
  const { request } = useApi();

  const expertMode = useAppStore((s) => s.expertMode);
  const learningMode = useAppStore((s) => s.learningMode);

  const progressQ = useQuery({
    queryKey: ['workflow-progress', projectId],
    queryFn: () =>
      request<{ data: WorkflowProgressApi }>(
        `/v1/projects/${projectId}/backlink-builder/workflow-progress`
      ),
    enabled: !!projectId,
    staleTime: 5_000,
    refetchInterval: 5_000,
    retry: 1,
  });

  const api = progressQ.data?.data;
  const hasSuccessfulImport = (api?.input.importedCount ?? 0) >= 1;
  // Until the CSM progress endpoint responds, do not treat Import as missing
  // (avoids locking the stepper during deploy / first paint).
  const importsLoaded = progressQ.isSuccess;

  const completedSteps = useMemo(() => {
    const set = new Set<string>();
    for (const s of api?.steps ?? []) {
      if (s.state === 'done') set.add(s.id);
    }
    return set;
  }, [api?.steps]);

  const execSummary = useExecutionSummary(projectId, 2_000);
  const summary = execSummary.data;
  const interventions = useInterventions(projectId, 3_000);
  const actionItems = interventions.data?.data.items ?? [];
  const needsHumanAction = actionItems.length > 0;
  const firstAction = actionItems[0] ?? null;

  const campaignState = summary?.campaignState ?? 'Idle';
  const campaignIsRunning = Boolean((summary?.running ?? 0) > 0 || campaignState === 'Running');
  const jobsOpen =
    campaignIsRunning ||
    campaignState === 'Waiting Human' ||
    campaignState === 'Paused' ||
    (campaignState === 'Starting' && (summary?.queued ?? 0) > 0);

  const completedCount = api?.completedCount ?? 0;
  const totalSteps = api?.totalSteps ?? WORKFLOW_STEPS.length;

  const currentStep =
    WORKFLOW_STEPS.find((s) => s.id === api?.currentStepId) ??
    WORKFLOW_STEPS.find((s) => s.id === 'import-websites') ??
    WORKFLOW_STEPS[0];

  const activeStep =
    WORKFLOW_STEPS.find((s) => stepMatchesPath(s, location.pathname, projectId)) ?? null;

  const isOnHome =
    location.pathname.endsWith('/home') ||
    location.pathname.replace(/\/$/, '').endsWith(`/projects/${projectId}`);

  const nextUnlockedStep = currentStep;
  const nextStep =
    WORKFLOW_STEPS.find(
      (s) => !completedSteps.has(s.id) && s.id !== currentStep.id
    ) ?? currentStep;

  const allComplete = Boolean(api?.allComplete);

  const progressPercent =
    jobsOpen || campaignState === 'Completed' || campaignState === 'Failed To Start'
      ? Math.round(summary?.progressPercent ?? api?.progressPercent ?? 0)
      : Math.round(api?.progressPercent ?? 0);

  const continueHref = !hasSuccessfulImport
    ? `/projects/${projectId}/backlink-builder/import`
    : jobsOpen
      ? `/projects/${projectId}/backlink-builder/assisted-manual`
      : allComplete
        ? `/projects/${projectId}/reports/library`
        : getStepHref(nextUnlockedStep, projectId);

  const continueLabel = !hasSuccessfulImport
    ? 'Import websites'
    : jobsOpen
      ? 'Open Assisted Manual'
      : allComplete
        ? 'Open Reports'
        : 'Continue';

  const continueEnabled =
    hasSuccessfulImport || continueHref.includes('/backlink-builder/import');

  const importGateActive = importsLoaded && !hasSuccessfulImport;

  const aiStatusLine =
    needsHumanAction && firstAction
      ? `${firstAction.reason} — ${firstAction.website}`
      : importGateActive
        ? 'Import websites to begin AI review'
        : summary?.aiStatusLine
          ? summary.aiStatusLine
          : allComplete
            ? 'Campaign complete'
            : `Working on ${currentStep.title}`;

  const etaLabel =
    jobsOpen && summary?.etaSeconds
      ? formatEta(summary.etaSeconds)
      : currentStep.estimatedMinutes
        ? `~${currentStep.estimatedMinutes} min`
        : null;

  const isStepComplete = (stepId: string) => {
    const row = api?.steps.find((s) => s.id === stepId);
    return row?.state === 'done';
  };

  return {
    steps: WORKFLOW_STEPS,
    completedSteps,
    completedCount,
    totalSteps,
    currentStep,
    activeStep,
    isOnHome,
    nextStep,
    nextUnlockedStep,
    continueHref,
    continueLabel,
    continueEnabled,
    hasSuccessfulImport,
    importsLoaded,
    progressPercent,
    aiStatusLine,
    etaLabel,
    jobsOpen,
    needsHumanAction,
    firstAction,
    actionItems,
    bee: summary
      ? {
          totalJobs: summary.total,
          completedJobs: summary.completed,
          remainingJobs: summary.remaining,
          progressPercent: summary.progressPercent,
          executionComplete: summary.executionComplete,
          running: summary.running,
          queued: summary.queued,
          campaignState: summary.campaignState,
          campaignIsRunning,
          aiStatusLine: summary.aiStatusLine,
          etaSeconds: summary.etaSeconds,
        }
      : undefined,
    expertMode,
    learningMode,
    allComplete,
    workflowProgressApi: api,
    stepTimings: api?.timings ?? [],
    isStepComplete,
    getStepHref: (step: WorkflowStep) => getStepHref(step, projectId),
  };
}

export function usePageHelpKey(projectId: string): string {
  const location = useLocation();
  const path = location.pathname.replace(`/projects/${projectId}/`, '').replace(/^\//, '');
  return path || 'home';
}

/** @deprecated Use useWorkflow — alias for Workflow State Manager */
export const useWorkflowState = useWorkflow;
