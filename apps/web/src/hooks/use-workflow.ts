import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { WORKFLOW_STEPS, type WorkflowStep } from '@/config/workflow-steps';
import { useAppStore, WORKFLOW_GLOBAL_KEY } from '@/stores/app-store';
import { useActiveOrg } from '@/hooks/use-active-org';

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
  const { hasOrganizations } = useActiveOrg();

  const completedSteps = useMemo(() => {
    const projectCompleted = workflowProgress[projectId] ?? [];
    const globalCompleted = workflowProgress[WORKFLOW_GLOBAL_KEY] ?? [];
    const set = new Set([...projectCompleted, ...globalCompleted]);
    if (hasOrganizations) set.add('create-org');
    if (projectId) set.add('create-project');
    return set;
  }, [workflowProgress, hasOrganizations, projectId]);

  useEffect(() => {
    const path = location.pathname;
    for (const step of WORKFLOW_STEPS) {
      if (step.orgLevel) continue;
      if (stepMatchesPath(step, path, projectId)) {
        markStepComplete(projectId, step.id);
        break;
      }
    }
  }, [location.pathname, projectId, markStepComplete]);

  useEffect(() => {
    if (hasOrganizations) markGlobalStepComplete('create-org');
  }, [hasOrganizations, markGlobalStepComplete]);

  useEffect(() => {
    if (projectId) markGlobalStepComplete('create-project');
  }, [projectId, markGlobalStepComplete]);

  const completedCount = WORKFLOW_STEPS.filter((s) => completedSteps.has(s.id)).length;

  const currentStep =
    WORKFLOW_STEPS.find((s) => !completedSteps.has(s.id)) ??
    WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1];

  const nextStep =
    WORKFLOW_STEPS.find((s) => !completedSteps.has(s.id) && s.id !== currentStep.id) ??
    currentStep;

  const allComplete = completedCount >= WORKFLOW_STEPS.length;

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
