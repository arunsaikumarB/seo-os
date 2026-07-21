import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  WORKFLOW_STEPS,
  WORKFLOW_STEP_ALIASES,
  type WorkflowStep,
} from '@/config/workflow-steps';
import { useAppStore, WORKFLOW_GLOBAL_KEY } from '@/stores/app-store';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { formatEta } from '@/lib/bee-execution-ui';

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

/**
 * Workflow State Manager — single source of truth for guided UX.
 * Pages must not invent their own Continue targets or progress math.
 */
export function useWorkflow(projectId: string) {
  const location = useLocation();
  const {
    workflowProgress,
    markStepComplete,
    markGlobalStepComplete,
    expertMode,
    learningMode,
  } = useAppStore();

  const completedSteps = useMemo(() => {
    const projectCompleted = workflowProgress[projectId] ?? [];
    const globalCompleted = workflowProgress[WORKFLOW_GLOBAL_KEY] ?? [];
    const set = new Set([...projectCompleted, ...globalCompleted]);
    if (projectId) set.add('create-project');
    return set;
  }, [workflowProgress, projectId]);

  const visitCompleteBlocked = new Set(['submit-backlinks', 'track-results', 'reports-analytics']);

  useEffect(() => {
    const path = location.pathname;
    for (const step of WORKFLOW_STEPS) {
      if (step.orgLevel) continue;
      if (visitCompleteBlocked.has(step.id)) continue;
      if (stepMatchesPath(step, path, projectId)) {
        markStepComplete(projectId, step.id);
        break;
      }
    }
  }, [location.pathname, projectId, markStepComplete]);

  useEffect(() => {
    if (projectId) markGlobalStepComplete('create-project');
  }, [projectId, markGlobalStepComplete]);

  const bee = useBeeExecutionProgress(projectId, 5_000);
  const interventions = useInterventions(projectId, 3_000);
  const actionItems = interventions.data?.data.items ?? [];
  const needsHumanAction = actionItems.length > 0;
  const firstAction = actionItems[0] ?? null;

  const campaignState = bee.data?.campaignState ?? 'Idle';
  const campaignIsRunning = Boolean(bee.data?.campaignIsRunning);
  /** Active campaign — never from Failed To Start / Idle alone */
  const jobsOpen =
    campaignIsRunning ||
    campaignState === 'Waiting Human' ||
    campaignState === 'Paused' ||
    campaignState === 'Starting';

  useEffect(() => {
    if (bee.data?.executionComplete && campaignState === 'Completed') {
      markStepComplete(projectId, 'submit-backlinks');
    }
  }, [bee.data?.executionComplete, campaignState, projectId, markStepComplete]);

  const completedCount = WORKFLOW_STEPS.filter((s) => {
    if (s.id === 'submit-backlinks' && jobsOpen) return false;
    return isStepDone(completedSteps, s.id);
  }).length;

  /** Campaign progress step (what the AI campaign is on) */
  const currentStep =
    jobsOpen
      ? WORKFLOW_STEPS.find((s) => s.id === 'submit-backlinks')!
      : WORKFLOW_STEPS.find((s) => !isStepDone(completedSteps, s.id)) ??
        WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1];

  /** Page the user is viewing */
  const activeStep =
    WORKFLOW_STEPS.find((s) => stepMatchesPath(s, location.pathname, projectId)) ?? null;

  const isOnHome =
    location.pathname.endsWith('/home') ||
    location.pathname.replace(/\/$/, '').endsWith(`/projects/${projectId}`);

  /** Next unlocked step the Continue button always targets */
  const nextUnlockedStep =
    jobsOpen
      ? WORKFLOW_STEPS.find((s) => s.id === 'submit-backlinks')!
      : WORKFLOW_STEPS.find((s) => !isStepDone(completedSteps, s.id)) ??
        WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1];

  const nextStep =
    jobsOpen
      ? currentStep
      : WORKFLOW_STEPS.find(
          (s) => !isStepDone(completedSteps, s.id) && s.id !== currentStep.id
        ) ?? currentStep;

  const allComplete = completedCount >= WORKFLOW_STEPS.length && !jobsOpen;

  /** Progress ONLY from Execution State Manager when a campaign is active */
  const progressPercent =
    jobsOpen || campaignState === 'Completed' || campaignState === 'Failed To Start'
      ? Math.round(bee.data?.progressPercent ?? 0)
      : Math.round((completedCount / Math.max(WORKFLOW_STEPS.length, 1)) * 100);

  const continueHref = jobsOpen
    ? `/projects/${projectId}/backlink-builder/execution`
    : allComplete
      ? `/projects/${projectId}/reports/library`
      : getStepHref(nextUnlockedStep, projectId);

  const continueLabel = jobsOpen
    ? 'View progress'
    : allComplete
      ? 'Open Reports'
      : 'Continue';

  const aiStatusLine = needsHumanAction && firstAction
    ? `${firstAction.reason} — ${firstAction.website}`
    : bee.data?.aiStatusLine
      ? bee.data.aiStatusLine
      : allComplete
        ? 'Campaign complete'
        : `Working on ${currentStep.title}`;

  const etaLabel = jobsOpen && bee.data?.etaSeconds
    ? formatEta(bee.data.etaSeconds)
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
    isStepComplete: (stepId: string) => isStepDone(completedSteps, stepId),
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
