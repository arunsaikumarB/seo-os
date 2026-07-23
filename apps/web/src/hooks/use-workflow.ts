import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  WORKFLOW_STEPS,
  WORKFLOW_STEP_ALIASES,
  type WorkflowStep,
} from '@/config/workflow-steps';
import { useAppStore, WORKFLOW_GLOBAL_KEY } from '@/stores/app-store';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import { useExecutionSummary } from '@/hooks/use-execution-summary';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { formatEta } from '@/lib/bee-execution-ui';
import { useApi } from '@/hooks/use-api';

function stepMatchesPath(step: WorkflowStep, path: string, projectId: string): boolean {
  if (step.orgLevel) return false;
  const normalized = path.replace(`/projects/${projectId}/`, '').replace(/^\//, '');
  return normalized === step.route || normalized.startsWith(`${step.route}/`);
}

function isStepDone(completed: Set<string>, stepId: string): boolean {
  if (completed.has(stepId)) return true;
  const aliases = WORKFLOW_STEP_ALIASES[stepId] ?? [];
  return aliases.some((a) => completed.has(a));
}

/** True when at least one import produced rows / opportunities (not “opened the page”). */
export function isSuccessfulImportRecord(row: {
  status?: string | null;
  opportunities_created?: number | null;
  valid_rows?: number | null;
  total_rows?: number | null;
}): boolean {
  if (Number(row.opportunities_created ?? 0) > 0) return true;
  if (Number(row.valid_rows ?? 0) > 0) return true;
  const s = String(row.status ?? '').toLowerCase();
  if (['failed', 'error', 'cancelled', 'canceled'].includes(s)) return false;
  if (
    ['completed', 'complete', 'classified', 'done', 'success', 'analyzed'].includes(s) &&
    Number(row.total_rows ?? 0) > 0
  ) {
    return true;
  }
  return false;
}

export function getStepHref(step: WorkflowStep, projectId: string): string {
  if (step.orgLevel) return step.route;
  return `/projects/${projectId}/${step.route}`;
}

/**
 * Workflow State Manager — single source of truth for guided UX.
 * Pages must not invent their own Continue targets or progress math.
 */
export function useWorkflow(projectId: string) {
  const location = useLocation();
  const { request } = useApi();
  const {
    workflowProgress,
    markStepComplete,
    unmarkStepComplete,
    markGlobalStepComplete,
    expertMode,
    learningMode,
  } = useAppStore();

  const importsQuery = useQuery({
    queryKey: ['backlink-imports', projectId],
    queryFn: () =>
      request<{
        data: Array<{
          status: string;
          opportunities_created: number;
          valid_rows: number;
          total_rows: number;
        }>;
      }>(`/v1/projects/${projectId}/backlink-builder/automation/imports`),
    enabled: !!projectId,
    staleTime: 15_000,
  });

  const hasSuccessfulImport = useMemo(() => {
    const rows = importsQuery.data?.data ?? [];
    return rows.some((r) => isSuccessfulImportRecord(r));
  }, [importsQuery.data]);

  const importsLoaded = importsQuery.isFetched || importsQuery.isError;

  const completedSteps = useMemo(() => {
    const projectCompleted = workflowProgress[projectId] ?? [];
    const globalCompleted = workflowProgress[WORKFLOW_GLOBAL_KEY] ?? [];
    const set = new Set([...projectCompleted, ...globalCompleted]);
    if (projectId) set.add('create-project');
    // Guard: never treat Import as done without real backend import data
    if (!hasSuccessfulImport) {
      set.delete('import-websites');
    }
    return set;
  }, [workflowProgress, projectId, hasSuccessfulImport]);

  /** Steps that must NOT complete merely by visiting the route */
  const visitCompleteBlocked = useMemo(
    () =>
      new Set([
        'import-websites',
        'submit-backlinks',
        'track-results',
        'reports-analytics',
      ]),
    []
  );

  useEffect(() => {
    const path = location.pathname;
    for (const step of WORKFLOW_STEPS) {
      if (step.orgLevel) continue;
      if (visitCompleteBlocked.has(step.id)) continue;
      // Do not advance past Import by visiting later pages with zero imports
      if (
        !hasSuccessfulImport &&
        step.id !== 'create-project' &&
        step.id !== 'import-websites'
      ) {
        continue;
      }
      if (stepMatchesPath(step, path, projectId)) {
        markStepComplete(projectId, step.id);
        break;
      }
    }
  }, [
    location.pathname,
    projectId,
    markStepComplete,
    hasSuccessfulImport,
    visitCompleteBlocked,
  ]);

  useEffect(() => {
    if (projectId) markGlobalStepComplete('create-project');
  }, [projectId, markGlobalStepComplete]);

  // Sync Import from backend — clears stale localStorage “visit complete”
  useEffect(() => {
    if (!projectId || !importsLoaded) return;
    if (hasSuccessfulImport) {
      markStepComplete(projectId, 'import-websites');
    } else {
      unmarkStepComplete(projectId, 'import-websites');
    }
  }, [
    projectId,
    importsLoaded,
    hasSuccessfulImport,
    markStepComplete,
    unmarkStepComplete,
  ]);

  const bee = useBeeExecutionProgress(projectId, 5_000);
  const execSummary = useExecutionSummary(projectId, 2_000);
  const summary = execSummary.data;
  const interventions = useInterventions(projectId, 3_000);
  const actionItems = interventions.data?.data.items ?? [];
  const needsHumanAction = actionItems.length > 0;
  const firstAction = actionItems[0] ?? null;

  const campaignState = summary?.campaignState ?? bee.data?.campaignState ?? 'Idle';
  const campaignIsRunning = Boolean(
    (summary?.running ?? 0) > 0 || bee.data?.campaignIsRunning
  );
  const jobsOpen =
    campaignIsRunning ||
    campaignState === 'Waiting Human' ||
    campaignState === 'Paused' ||
    campaignState === 'Starting';

  useEffect(() => {
    if (
      (summary?.executionComplete || bee.data?.executionComplete) &&
      campaignState === 'Completed'
    ) {
      markStepComplete(projectId, 'submit-backlinks');
    }
  }, [
    summary?.executionComplete,
    bee.data?.executionComplete,
    campaignState,
    projectId,
    markStepComplete,
  ]);

  const completedCount = WORKFLOW_STEPS.filter((s) => {
    if (s.id === 'submit-backlinks' && jobsOpen) return false;
    if (s.id === 'import-websites') return hasSuccessfulImport;
    if (!hasSuccessfulImport && s.id !== 'create-project') return false;
    return isStepDone(completedSteps, s.id);
  }).length;

  const importStep = WORKFLOW_STEPS.find((s) => s.id === 'import-websites')!;

  const currentStep = !hasSuccessfulImport
    ? importStep
    : jobsOpen
      ? WORKFLOW_STEPS.find((s) => s.id === 'submit-backlinks')!
      : WORKFLOW_STEPS.find((s) => !isStepDone(completedSteps, s.id)) ??
        WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1];

  const activeStep =
    WORKFLOW_STEPS.find((s) => stepMatchesPath(s, location.pathname, projectId)) ?? null;

  const isOnHome =
    location.pathname.endsWith('/home') ||
    location.pathname.replace(/\/$/, '').endsWith(`/projects/${projectId}`);

  const nextUnlockedStep = !hasSuccessfulImport
    ? importStep
    : jobsOpen
      ? WORKFLOW_STEPS.find((s) => s.id === 'submit-backlinks')!
      : WORKFLOW_STEPS.find((s) => !isStepDone(completedSteps, s.id)) ??
        WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1];

  const nextStep = jobsOpen
    ? currentStep
    : WORKFLOW_STEPS.find(
        (s) => !isStepDone(completedSteps, s.id) && s.id !== currentStep.id
      ) ?? currentStep;

  const allComplete =
    hasSuccessfulImport && completedCount >= WORKFLOW_STEPS.length && !jobsOpen;

  const progressPercent =
    jobsOpen || campaignState === 'Completed' || campaignState === 'Failed To Start'
      ? Math.round(summary?.progressPercent ?? bee.data?.progressPercent ?? 0)
      : Math.round((completedCount / Math.max(WORKFLOW_STEPS.length, 1)) * 100);

  const continueHref = !hasSuccessfulImport
    ? `/projects/${projectId}/backlink-builder/import`
    : jobsOpen
      ? `/projects/${projectId}/backlink-builder/execution`
      : allComplete
        ? `/projects/${projectId}/reports/library`
        : getStepHref(nextUnlockedStep, projectId);

  const continueLabel = !hasSuccessfulImport
    ? 'Import websites'
    : jobsOpen
      ? 'View progress'
      : allComplete
        ? 'Open Reports'
        : 'Continue';

  /** Continue to AI Review only after a real import */
  const continueEnabled = hasSuccessfulImport;

  const aiStatusLine = needsHumanAction && firstAction
    ? `${firstAction.reason} — ${firstAction.website}`
    : !hasSuccessfulImport
      ? 'Import websites to begin AI review'
      : summary?.aiStatusLine
        ? summary.aiStatusLine
        : bee.data?.aiStatusLine
          ? bee.data.aiStatusLine
          : allComplete
            ? 'Campaign complete'
            : `Working on ${currentStep.title}`;

  const etaLabel =
    jobsOpen && (summary?.etaSeconds || bee.data?.etaSeconds)
      ? formatEta(summary?.etaSeconds || bee.data?.etaSeconds || 0)
      : currentStep.estimatedMinutes
        ? `~${currentStep.estimatedMinutes} min`
        : null;

  return {
    steps: WORKFLOW_STEPS,
    completedSteps,
    completedCount,
    totalSteps: WORKFLOW_STEPS.length,
    currentStep,
    activeStep,
    isOnHome,
    nextStep,
    nextUnlockedStep,
    continueHref,
    continueLabel,
    continueEnabled,
    hasSuccessfulImport,
    progressPercent,
    aiStatusLine,
    etaLabel,
    jobsOpen,
    needsHumanAction,
    firstAction,
    actionItems,
    bee: bee.data,
    expertMode,
    learningMode,
    allComplete,
    isStepComplete: (stepId: string) => {
      if (stepId === 'create-project') return true;
      if (stepId === 'import-websites') return hasSuccessfulImport;
      if (!hasSuccessfulImport) return false;
      return isStepDone(completedSteps, stepId);
    },
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
