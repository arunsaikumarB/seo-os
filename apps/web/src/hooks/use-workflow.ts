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
import { isSuccessfulImportRecord } from '@/lib/import-success';
import { useApi } from '@/hooks/use-api';

export { isSuccessfulImportRecord } from '@/lib/import-success';

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

export function getStepHref(step: WorkflowStep, projectId: string): string {
  if (step.orgLevel) return step.route;
  return `/projects/${projectId}/${step.route}`;
}

const VISIT_COMPLETE_BLOCKED = new Set([
  'import-websites',
  'submit-backlinks',
  'track-results',
  'reports-analytics',
]);

/**
 * Workflow State Manager — single source of truth for guided UX.
 * Pages must not invent their own Continue targets or progress math.
 */
export function useWorkflow(projectId: string) {
  const location = useLocation();
  const { request } = useApi();

  const workflowProgress = useAppStore((s) => s.workflowProgress);
  const markStepComplete = useAppStore((s) => s.markStepComplete);
  const unmarkStepComplete = useAppStore((s) => s.unmarkStepComplete);
  const markGlobalStepComplete = useAppStore((s) => s.markGlobalStepComplete);
  const expertMode = useAppStore((s) => s.expertMode);
  const learningMode = useAppStore((s) => s.learningMode);

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
    retry: 1,
  });

  const importsLoaded = importsQuery.isFetched || importsQuery.isError;

  const hasSuccessfulImport = useMemo(() => {
    // Until history loads, do not treat Import as missing (avoids locking flash / thrash)
    if (!importsLoaded) {
      const stored = workflowProgress[projectId] ?? [];
      return stored.includes('import-websites');
    }
    const rows = importsQuery.data?.data ?? [];
    return rows.some((r) => isSuccessfulImportRecord(r));
  }, [importsLoaded, importsQuery.data, workflowProgress, projectId]);

  const completedSteps = useMemo(() => {
    const projectCompleted = workflowProgress[projectId] ?? [];
    const globalCompleted = workflowProgress[WORKFLOW_GLOBAL_KEY] ?? [];
    const set = new Set([...projectCompleted, ...globalCompleted]);
    if (projectId) set.add('create-project');
    // Guard: never treat Import as done without real backend import data (once loaded)
    if (importsLoaded && !hasSuccessfulImport) {
      set.delete('import-websites');
    }
    return set;
  }, [workflowProgress, projectId, hasSuccessfulImport, importsLoaded]);

  useEffect(() => {
    if (!projectId) return;
    const path = location.pathname;
    for (const step of WORKFLOW_STEPS) {
      if (step.orgLevel) continue;
      if (VISIT_COMPLETE_BLOCKED.has(step.id)) continue;
      // Do not advance past Import by visiting later pages with zero imports
      if (
        importsLoaded &&
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
    importsLoaded,
  ]);

  useEffect(() => {
    if (projectId) markGlobalStepComplete('create-project');
  }, [projectId, markGlobalStepComplete]);

  // One-shot sync of Import from backend — store helpers no-op when unchanged
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

  const importGateActive = importsLoaded && !hasSuccessfulImport;

  const completedCount = WORKFLOW_STEPS.filter((s) => {
    if (s.id === 'submit-backlinks' && jobsOpen) return false;
    if (s.id === 'import-websites') return hasSuccessfulImport;
    if (importGateActive && s.id !== 'create-project') return false;
    return isStepDone(completedSteps, s.id);
  }).length;

  const importStep = WORKFLOW_STEPS.find((s) => s.id === 'import-websites')!;

  const currentStep = importGateActive
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

  const nextUnlockedStep = importGateActive
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

  const continueHref = importGateActive
    ? `/projects/${projectId}/backlink-builder/import`
    : jobsOpen
      ? `/projects/${projectId}/backlink-builder/execution`
      : allComplete
        ? `/projects/${projectId}/reports/library`
        : getStepHref(nextUnlockedStep, projectId);

  const continueLabel = importGateActive
    ? 'Import websites'
    : jobsOpen
      ? 'View progress'
      : allComplete
        ? 'Open Reports'
        : 'Continue';

  /** Always allow going to Import; block advancing past it without real import data */
  const continueEnabled =
    hasSuccessfulImport || continueHref.includes('/backlink-builder/import');

  const aiStatusLine = needsHumanAction && firstAction
    ? `${firstAction.reason} — ${firstAction.website}`
    : importGateActive
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
    importsLoaded,
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
      if (importGateActive) return false;
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
