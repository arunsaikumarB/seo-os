/**
 * Phase 13 — Workflow stepper progress from CSM (API) + per-step processing times.
 */
import {
  deriveWorkflowProgressInput,
  getWorkflowProgress,
  type GuidedWorkflowStepId,
  type WorkflowProgress,
  type WorkflowProgressInput,
} from '@seo-os/backlink-builder';
import { listCampaignItems } from './campaign-state.service.js';
import { getProjectByWorkspaceId } from '../projects/project.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

function projectIsReady(project: {
  domain?: string | null;
  url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
} | null): boolean {
  if (!project) return false;
  const domain = String(project.domain ?? '').trim();
  if (!domain) return false;
  const url = String(project.url ?? '').trim();
  return Boolean(url || domain);
}

async function workspaceHasReport(workspaceId: string): Promise<boolean> {
  const { count, error } = await getSupabaseAdmin()
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  if (error) return false;
  return (count ?? 0) > 0;
}

const ESTIMATE_MINUTES: Record<GuidedWorkflowStepId, number> = {
  'create-project': 2,
  'import-websites': 5,
  'ai-review': 5,
  'generate-content': 10,
  'submit-backlinks': 15,
  'track-results': 5,
  'reports-analytics': 5,
};

export type StepTimingDto = {
  stepId: GuidedWorkflowStepId;
  phase: 'idle' | 'running' | 'done';
  estimateMinutes: number;
  elapsedMs: number | null;
  startedAt: string | null;
};

function msBetween(start?: string | null, end?: string | null): number | null {
  if (!start) return null;
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

async function computeStepTimings(
  workspaceId: string,
  progress: WorkflowProgress,
  input: WorkflowProgressInput,
  project: { created_at?: string | null; updated_at?: string | null } | null
): Promise<StepTimingDto[]> {
  const flags = progress.flags;

  const [{ data: runs }, { data: imports }] = await Promise.all([
    getSupabaseAdmin()
      .from('backlink_automation_runs')
      .select('started_at, completed_at, status, created_at')
      .eq('workspace_id', workspaceId)
      .order('started_at', { ascending: false })
      .limit(8),
    getSupabaseAdmin()
      .from('backlink_imports')
      .select('created_at, status, updated_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const latestRun = (runs ?? [])[0] ?? null;
  const latestImport = (imports ?? [])[0] ?? null;
  const runBusy =
    latestRun &&
    ['running', 'queued', 'analyzing', 'generating'].includes(String(latestRun.status));
  const importBusy =
    latestImport &&
    ['analyzing', 'generating', 'queued', 'running', 'validated'].includes(
      String(latestImport.status)
    );
  const pipelineBusy = Boolean(runBusy || importBusy);
  const pipelineStart =
    latestRun?.started_at ?? latestRun?.created_at ?? latestImport?.created_at ?? null;
  const pipelineEnd = latestRun?.completed_at ?? latestImport?.updated_at ?? null;

  const importElapsed = pipelineBusy
    ? msBetween(pipelineStart, null)
    : msBetween(pipelineStart, pipelineEnd);

  const items = await listCampaignItems(workspaceId, { includeDeleted: false });

  // AI Review: own clock (do not reuse Import). Runs while pending analysis / classify remains.
  const reviewItemTimes = items
    .map((i) => i.updatedAt ?? i.createdAt)
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((n) => Number.isFinite(n));
  const reviewStartIso =
    pipelineEnd ??
    latestImport?.updated_at ??
    latestImport?.created_at ??
    (reviewItemTimes.length ? new Date(Math.min(...reviewItemTimes)).toISOString() : null);
  const aiReviewBusy =
    flags.importDone &&
    !flags.aiReviewDone &&
    (pipelineBusy || input.aiReviewPending > 0);
  const aiReviewEndIso = reviewItemTimes.length
    ? new Date(Math.max(...reviewItemTimes)).toISOString()
    : null;
  const aiReviewElapsed = aiReviewBusy
    ? msBetween(reviewStartIso, null)
    : flags.aiReviewDone
      ? msBetween(reviewStartIso, aiReviewEndIso) ??
        (reviewItemTimes.length >= 2
          ? Math.max(...reviewItemTimes) - Math.min(...reviewItemTimes)
          : reviewItemTimes.length === 1
            ? 0
            : null)
      : null;

  const genBusy = items.some(
    (i) => i.generationStatus === 'Queued' || i.generationStatus === 'Generating'
  ) || (flags.aiReviewDone && input.pendingGeneration > 0);
  const genCohort = items.filter(
    (i) =>
      i.generationStatus === 'Queued' ||
      i.generationStatus === 'Generating' ||
      i.generationStatus === 'Completed' ||
      i.generationStatus === 'Needs Review' ||
      i.generationStatus === 'Failed' ||
      ['Package Generated', 'Ready', 'Submitting', 'Waiting Human', 'Submitted', 'Verified', 'Completed'].includes(
        i.currentStatus
      )
  );
  const genTimes = genCohort
    .map((i) => i.updatedAt ?? i.createdAt)
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((n) => Number.isFinite(n));
  const genBusyTimes = items
    .filter((i) => i.generationStatus === 'Queued' || i.generationStatus === 'Generating')
    .map((i) => i.updatedAt ?? i.createdAt)
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((n) => Number.isFinite(n));
  const genAttempted =
    genTimes.length > 0 ||
    input.generatedPackages > 0 ||
    input.failedGeneration > 0 ||
    input.pendingGeneration > 0;
  const genStartedAt = genBusy
    ? genBusyTimes.length
      ? new Date(Math.min(...genBusyTimes)).toISOString()
      : genTimes.length
        ? new Date(Math.min(...genTimes)).toISOString()
        : reviewStartIso
    : null;
  const genFinishedAttempt =
    !genBusy &&
    genAttempted &&
    (flags.generateDone ||
      (input.pendingGeneration === 0 &&
        (input.generatedPackages > 0 || input.failedGeneration > 0)));
  const genElapsed = genBusy
    ? genStartedAt
      ? msBetween(genStartedAt, null)
      : null
    : genFinishedAttempt && genTimes.length >= 2
      ? Math.max(...genTimes) - Math.min(...genTimes)
      : genFinishedAttempt && genTimes.length === 1
        ? 0
        : genFinishedAttempt
          ? msBetween(reviewStartIso, aiReviewEndIso)
          : null;

  const submitBusy = items.some((i) => i.currentStatus === 'Submitting');
  const submitCohort = items.filter((i) =>
    ['Submitting', 'Waiting Human', 'Submitted', 'Verified', 'Completed', 'Ready', 'Package Generated'].includes(
      i.currentStatus
    )
  );
  const submitTimes = submitCohort
    .map((i) => i.updatedAt)
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((n) => Number.isFinite(n));
  const submitBusyTimes = items
    .filter((i) => i.currentStatus === 'Submitting')
    .map((i) => i.updatedAt)
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((n) => Number.isFinite(n));
  const submitStartedAt =
    submitBusy && submitBusyTimes.length
      ? new Date(Math.min(...submitBusyTimes)).toISOString()
      : null;
  const submitElapsed = submitBusy
    ? submitStartedAt
      ? msBetween(submitStartedAt, null)
      : null
    : flags.submitDone && submitTimes.length >= 2
      ? Math.max(...submitTimes) - Math.min(...submitTimes)
      : flags.submitDone && submitTimes.length === 1
        ? 0
        : null;

  const trackedItems = items.filter((i) =>
    ['Submitted', 'Verified', 'Completed'].includes(i.currentStatus)
  );
  const trackTimes = trackedItems
    .map((i) => i.updatedAt)
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((n) => Number.isFinite(n));
  const trackElapsed =
    flags.trackResultsDone && trackTimes.length >= 2
      ? Math.max(...trackTimes) - Math.min(...trackTimes)
      : flags.trackResultsDone && trackTimes.length === 1
        ? 0
        : null;

  let reportElapsed: number | null = null;
  if (flags.reportsDone) {
    const { data: reports } = await getSupabaseAdmin()
      .from('reports')
      .select('created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })
      .limit(5);
    const rTimes = (reports ?? [])
      .map((r) => new Date(String(r.created_at)).getTime())
      .filter((n) => Number.isFinite(n));
    if (rTimes.length >= 2) reportElapsed = Math.max(...rTimes) - Math.min(...rTimes);
    else if (rTimes.length === 1) reportElapsed = 0;
  }

  const createElapsed = flags.createDone
    ? msBetween(project?.created_at, project?.updated_at)
    : null;

  /** Only "running" when work is actually in flight — never because CSM says this is next. */
  const phaseFor = (id: GuidedWorkflowStepId): StepTimingDto['phase'] => {
    const row = progress.steps.find((s) => s.id === id);
    if (row?.state === 'done') return 'done';
    if (id === 'import-websites' && pipelineBusy) return 'running';
    if (id === 'ai-review' && aiReviewBusy) return 'running';
    if (id === 'generate-content' && genBusy) return 'running';
    // Show "took Xs" after a generate attempt finishes (incl. all-Failed), even if step not green yet
    if (id === 'generate-content' && genFinishedAttempt) return 'done';
    if (id === 'submit-backlinks' && submitBusy) return 'running';
    return 'idle';
  };

  const startedAtFor = (id: GuidedWorkflowStepId, phase: StepTimingDto['phase']): string | null => {
    if (phase !== 'running') return null;
    if (id === 'import-websites') return pipelineStart;
    if (id === 'ai-review') return reviewStartIso;
    if (id === 'generate-content') return genStartedAt ?? reviewStartIso;
    if (id === 'submit-backlinks') return submitStartedAt;
    return null;
  };

  const elapsedFor = (id: GuidedWorkflowStepId): number | null => {
    switch (id) {
      case 'create-project':
        return createElapsed;
      case 'import-websites':
        return importElapsed;
      case 'ai-review':
        return aiReviewElapsed;
      case 'generate-content':
        return genElapsed;
      case 'submit-backlinks':
        return flags.submitDone || submitBusy ? submitElapsed : null;
      case 'track-results':
        return flags.trackResultsDone ? trackElapsed : null;
      case 'reports-analytics':
        return flags.reportsDone ? reportElapsed : null;
      default:
        return null;
    }
  };

  return (Object.keys(ESTIMATE_MINUTES) as GuidedWorkflowStepId[]).map((stepId) => {
    const phase = phaseFor(stepId);
    return {
      stepId,
      phase,
      estimateMinutes: ESTIMATE_MINUTES[stepId],
      elapsedMs: elapsedFor(stepId),
      startedAt: startedAtFor(stepId, phase),
    };
  });
}

/** Shared selector used by every stepper / learning-mode consumer. */
export async function getWorkflowProgressForWorkspace(
  workspaceId: string
): Promise<{
  input: WorkflowProgressInput;
  progress: WorkflowProgress;
  timings: StepTimingDto[];
}> {
  const [items, project, hasReport] = await Promise.all([
    listCampaignItems(workspaceId, { includeDeleted: false }),
    getProjectByWorkspaceId(workspaceId),
    workspaceHasReport(workspaceId),
  ]);

  const input = deriveWorkflowProgressInput({
    projectReady: projectIsReady(project),
    items,
    hasReport,
  });

  const progress = getWorkflowProgress(input);
  const timings = await computeStepTimings(workspaceId, progress, input, {
    created_at: project?.createdAt ?? null,
    updated_at: project?.updatedAt ?? null,
  });

  return { input, progress, timings };
}
