import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { WORKFLOW_STEPS, type WorkflowStep } from '@/config/workflow-steps';
import { useAppStore, WORKFLOW_GLOBAL_KEY } from '@/stores/app-store';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';

function stepMatchesPath(step: WorkflowStep, path: string, projectId: string): boolean {
  if (step.orgLevel) return false;
  const normalized = path.replace(`/projects/${projectId}/`, '').replace(/^\//, '');
  return normalized === step.route || normalized.startsWith(`${step.route}/`);
}

export function getStepHref(step: WorkflowStep, projectId: string): string {
  if (step.orgLevel) return step.route;
  return `/projects/${projectId}/${step.route}`;
}

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

  // Visiting later stages must NOT auto-complete Browser Execution (job-driven only).
  const visitCompleteBlocked = new Set(['browser-execution', 'verification', 'reports']);

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

  // Mark Browser Execution complete only when every job is Submitted / Failed / Cancelled
  useEffect(() => {
    if (bee.data?.executionComplete && (bee.data.totalJobs ?? 0) > 0) {
      markStepComplete(projectId, 'browser-execution');
    }
  }, [bee.data?.executionComplete, bee.data?.totalJobs, projectId, markStepComplete]);

  const jobsOpen = (bee.data?.totalJobs ?? 0) > 0 && !bee.data?.executionComplete;

  const completedCount = WORKFLOW_STEPS.filter((s) => {
    if (s.id === 'browser-execution' && jobsOpen) return false;
    return completedSteps.has(s.id);
  }).length;

  const currentStep =
    jobsOpen
      ? WORKFLOW_STEPS.find((s) => s.id === 'browser-execution')!
      : WORKFLOW_STEPS.find((s) => !completedSteps.has(s.id)) ??
        WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1];

  const nextStep =
    jobsOpen
      ? currentStep
      : WORKFLOW_STEPS.find((s) => !completedSteps.has(s.id) && s.id !== currentStep.id) ??
        currentStep;

  const allComplete =
    completedCount >= WORKFLOW_STEPS.length && !jobsOpen;

  return {
    steps: WORKFLOW_STEPS,
    completedSteps,
    completedCount,
    totalSteps: WORKFLOW_STEPS.length,
    currentStep,
    nextStep,
    expertMode,
    learningMode,
    allComplete,
    getStepHref: (step: WorkflowStep) => getStepHref(step, projectId),
  };
}

export function usePageHelpKey(projectId: string): string {
  const location = useLocation();
  const path = location.pathname.replace(`/projects/${projectId}/`, '').replace(/^\//, '');
  return path || 'home';
}
