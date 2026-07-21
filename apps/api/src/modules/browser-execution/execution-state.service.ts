/**
 * Execution State Manager (API) — sole aggregator for campaign execution state.
 * Submit Backlinks, Track Results, Verification, Reports, Dashboard, Workflow
 * all read through getExecutionState().
 */
import {
  computeExecutionCounts,
  isHiddenFromProject,
  isVerificationEligible,
  toPublicExecutionStatus,
  type ExecutionPublicStatus,
  type ExecutionStateCounts,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { listJobs, getOrCreatePolicy } from './bee.service.js';
import { listGlobalIgnore } from './bee-ignore.service.js';

export type ExecutionStateItem = {
  jobId: string;
  website: string;
  opportunityId: string | null;
  status: ExecutionPublicStatus;
  rawStatus: string;
  disposition: string | null;
  pauseReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  finishedAt: string | null;
  hidden: boolean;
};

export type ExecutionStateSnapshot = {
  counts: ExecutionStateCounts;
  items: ExecutionStateItem[];
  /** Visible campaign items (excludes Deleted / Ignored). */
  campaignItems: ExecutionStateItem[];
  /** Failed queue — does not block automation. */
  failedQueue: ExecutionStateItem[];
  /** Waiting Human queue. */
  waitingHuman: ExecutionStateItem[];
  /** Verification-eligible (Submitted / Verified / Approved only). */
  verificationEligible: ExecutionStateItem[];
  trackResults: {
    Submitted: number;
    Running: number;
    'Waiting Human': number;
    Failed: number;
    Skipped: number;
    Deleted: number;
    Verified: number;
    Approved: number;
    Rejected: number;
  };
  ignoreListCount: number;
  generatedAt: string;
  metricsSource: 'live';
};

function dispositionOf(job: Record<string, unknown>): string | null {
  if (job.disposition != null) return String(job.disposition);
  const m = job.metrics as { disposition?: string } | null;
  return m?.disposition != null ? String(m.disposition) : null;
}

export async function getExecutionState(workspaceId: string): Promise<ExecutionStateSnapshot> {
  const jobs = await listJobs(workspaceId);
  const ignore = await listGlobalIgnore(workspaceId).catch(() => ({ items: [] as unknown[] }));

  const items: ExecutionStateItem[] = jobs.map((j) => {
    const row = j as Record<string, unknown>;
    const disposition = dispositionOf(row);
    const rawStatus = String(j.status);
    const status = toPublicExecutionStatus(rawStatus, { disposition });
    return {
      jobId: String(j.id),
      website: String(j.site_domain ?? 'Website'),
      opportunityId: j.opportunity_id ? String(j.opportunity_id) : null,
      status,
      rawStatus,
      disposition,
      pauseReason: j.pause_reason != null ? String(j.pause_reason) : null,
      errorCode: j.error_code != null ? String(j.error_code) : null,
      errorMessage: j.error_message != null ? String(j.error_message) : null,
      createdAt: j.created_at != null ? String(j.created_at) : null,
      finishedAt: j.finished_at != null ? String(j.finished_at) : null,
      hidden: isHiddenFromProject(rawStatus, disposition),
    };
  });

  const counts = computeExecutionCounts(
    jobs.map((j) => {
      const row = j as Record<string, unknown>;
      return {
        id: String(j.id),
        status: String(j.status),
        site_domain: j.site_domain != null ? String(j.site_domain) : null,
        opportunity_id: j.opportunity_id != null ? String(j.opportunity_id) : null,
        pause_reason: j.pause_reason != null ? String(j.pause_reason) : null,
        disposition: dispositionOf(row),
        metrics: (j.metrics as Record<string, unknown>) ?? null,
      };
    })
  );

  const campaignItems = items.filter((i) => !i.hidden);
  const failedQueue = campaignItems.filter((i) => i.status === 'Failed');
  const waitingHuman = campaignItems.filter((i) => i.status === 'Waiting Human');
  const verificationEligible = items.filter((i) =>
    isVerificationEligible(i.rawStatus, i.disposition)
  );

  return {
    counts,
    items,
    campaignItems,
    failedQueue,
    waitingHuman,
    verificationEligible,
    trackResults: {
      Submitted: counts.Submitted,
      Running: counts.Running,
      'Waiting Human': counts['Waiting Human'],
      Failed: counts.Failed,
      Skipped: counts.Skipped,
      Deleted: counts.Deleted,
      Verified: counts.Verified,
      Approved: counts.Approved,
      Rejected: counts.Rejected,
    },
    ignoreListCount: ignore.items?.length ?? 0,
    generatedAt: new Date().toISOString(),
    metricsSource: 'live',
  };
}

/** Compatibility shim — statistics consumers read ESM counts. */
export async function getStatisticsFromExecutionState(workspaceId: string) {
  const state = await getExecutionState(workspaceId);
  const policy = await getOrCreatePolicy(workspaceId);
  const maxWorkers = Math.max(1, Number(policy.max_parallel_sessions ?? 4));
  const c = state.counts;

  return {
    state,
    running: c.Running,
    queued: c.Queued,
    ready: c.Queued,
    paused: 0,
    needs_approval: c['Waiting Human'],
    completed: c.Submitted + c.Verified + c.Approved,
    failed: c.Failed,
    blocked: 0,
    cancelled: c.Deleted,
    watching: c['Waiting Human'],
    submitted: c.Submitted,
    skipped: c.Skipped,
    deleted: c.Deleted,
    ignored: c.Ignored,
    verified: c.Verified,
    approved: c.Approved,
    rejected: c.Rejected,
    needsYou: c['Waiting Human'],
    waitingUser: c['Waiting Human'],
    waitingApproval: c['Waiting Human'],
    waitingVerification: 0,
    waitingLogin: 0,
    waitingMfa: 0,
    retrying: 0,
    aiSubmitted: c.Submitted + c.Verified,
    totalJobs: c.campaignTotal,
    completedJobs: c.campaignResolved,
    remainingJobs: c.Running + c.Queued,
    progressPercent: c.progressPercent,
    executionComplete: c.executionComplete,
    successRate:
      c.Submitted + c.Failed > 0
        ? Math.round((c.Submitted / (c.Submitted + c.Failed)) * 1000) / 10
        : null,
    maxParallelSessions: maxWorkers,
    activeWorkerCount: Math.min(maxWorkers, c.Running),
    workerUsage: `${Math.min(maxWorkers, c.Running)}/${maxWorkers}`,
    etaSeconds: 0,
    estimatedApprovalTime: '7–14 days',
    needsYourAction: c['Waiting Human'],
    trackResults: state.trackResults,
    failedQueue: state.failedQueue,
    metricsSource: 'live' as const,
  };
}

/** Soft-remove opportunity from current project after Delete Forever. */
export async function removeOpportunityFromProject(
  workspaceId: string,
  opportunityId: string | null | undefined
) {
  if (!opportunityId) return;
  await getSupabaseAdmin()
    .from('opportunities')
    .update({
      automation_status: 'deleted',
      pipeline_stage: 'lost',
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);

  // Drop pending verification rows for this opportunity
  await getSupabaseAdmin()
    .from('backlinks')
    .update({
      verification_status: 'lost',
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('opportunity_id', opportunityId)
    .eq('verification_status', 'pending');
}

/** Cancel pending pg-boss jobs for a BEE execution job id (best-effort). */
export async function cancelQueuedBossJobsForExecution(jobId: string) {
  try {
    const { getBoss, QUEUES } = await import('../../jobs/boss.js');
    const boss = await getBoss();
    if (!boss) return;
    // Cancel common singleton keys used by BEE
    const keys = [
      `bee-execute-${jobId}`,
      `bee-retry-${jobId}`,
      `bee-watch-${jobId}`,
    ];
    for (const queue of [QUEUES.PLAYWRIGHT, QUEUES.LOW, QUEUES.CRAWL]) {
      for (const key of keys) {
        try {
          // pg-boss v10: cancel by fetching active/created jobs is limited;
          // send a no-op cancel via delete where possible
          await (boss as { cancel?: (q: string, id: string) => Promise<unknown> }).cancel?.(
            queue,
            key
          );
        } catch {
          /* best-effort */
        }
      }
    }
  } catch {
    /* optional */
  }
}
