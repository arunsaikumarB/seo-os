/**
 * Execution State Manager (API) — sole aggregator for campaign execution state.
 * Submit Backlinks, Track Results, Verification, Reports, Dashboard, Workflow
 * all read through getExecutionState().
 *
 * Phase 6.1 — Execution Summary / Track Results tiles derive from Campaign Items
 * (CSM) via shared selectors; job rows only overlay live status when present.
 */
import {
  campaignItemsToExecutionJobs,
  computeCampaignCounts,
  computeExecutionCounts,
  dedupeJobsByOpportunity,
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
  /** Visible campaign items (excludes Deleted / Ignored / Failed to Start). */
  campaignItems: ExecutionStateItem[];
  failedToStart: ExecutionStateItem[];
  /** Failed queue — does not block automation. */
  failedQueue: ExecutionStateItem[];
  /** Waiting Human queue. */
  waitingHuman: ExecutionStateItem[];
  /** Verification-eligible (Submitted / Verified / Approved only). */
  verificationEligible: ExecutionStateItem[];
  trackResults: Record<string, number>;
  campaignState: string;
  campaignIsRunning: boolean;
  aiStatusLine: string;
  progressPercent: number;
  totalExecutable: number;
  ignoreListCount: number;
  generatedAt: string;
  metricsSource: 'live' | 'campaign_state';
};

function dispositionOf(job: Record<string, unknown>): string | null {
  if (job.disposition != null) return String(job.disposition);
  const m = job.metrics as { disposition?: string } | null;
  return m?.disposition != null ? String(m.disposition) : null;
}

export async function getExecutionState(workspaceId: string): Promise<ExecutionStateSnapshot> {
  const jobsRaw = await listJobs(workspaceId);
  const ignore = await listGlobalIgnore(workspaceId).catch(() => ({ items: [] as unknown[] }));
  // Phase 6: one job per Campaign Item for all counters and queues.
  const jobs = dedupeJobsByOpportunity(
    jobsRaw.map((j) => {
      const row = j as Record<string, unknown>;
      return {
        ...j,
        id: String(j.id),
        status: String(j.status),
        opportunity_id: j.opportunity_id != null ? String(j.opportunity_id) : null,
        disposition: dispositionOf(row),
        error_code: j.error_code != null ? String(j.error_code) : null,
        created_at: j.created_at != null ? String(j.created_at) : null,
      };
    })
  );

  const items: ExecutionStateItem[] = jobs.map((j) => {
    const row = j as Record<string, unknown>;
    const disposition = dispositionOf(row);
    const rawStatus = String(j.status);
    const status = toPublicExecutionStatus(rawStatus, {
      disposition,
      errorCode: j.error_code != null ? String(j.error_code) : null,
    });
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

  // Phase 6.1 / 6.3.2 — summary from CSM Campaign Items with LIVE job overlay.
  // Without overlay, Submitting→Running while jobs sit Queued/Preparing → false Finished / 0 remaining.
  let counts: ExecutionStateCounts;
  let metricsSource: 'campaign_state' | 'live' = 'live';
  try {
    const { listCampaignItems } = await import('../campaigns/campaign-state.service.js');
    const csmItems = await listCampaignItems(workspaceId, { includeDeleted: true });
    const jobsByOpportunity = new Map<
      string,
      {
        id: string;
        status: string;
        site_domain?: string | null;
        opportunity_id?: string | null;
        disposition?: string | null;
        error_code?: string | null;
        created_at?: string | null;
      }
    >();
    for (const j of jobs) {
      const oid = j.opportunityId;
      if (!oid || jobsByOpportunity.has(oid)) continue;
      jobsByOpportunity.set(oid, {
        id: j.jobId,
        status: j.rawStatus,
        site_domain: j.website,
        opportunity_id: oid,
        disposition: j.disposition,
        error_code: j.errorCode,
        created_at: j.createdAt,
      });
    }
    const synthetic = campaignItemsToExecutionJobs(
      csmItems.map((i) => ({
        id: i.id,
        currentStatus: i.currentStatus,
        domain: i.domain ?? null,
      })),
      jobsByOpportunity
    );
    counts = computeExecutionCounts(synthetic);
    metricsSource = 'campaign_state';

    // Phase 6.1 — cross-page invariant (Track Results ≡ Campaign Health ≡ CSM cohort).
    const csmCounts = computeCampaignCounts(csmItems);
    const submissionCohort =
      (csmCounts.byStatus['Package Generated'] ?? 0) +
      csmCounts.ready +
      csmCounts.submitting +
      csmCounts.waiting +
      csmCounts.retrying +
      csmCounts.submitted +
      csmCounts.verified +
      csmCounts.completed +
      csmCounts.failed +
      csmCounts.skipped +
      csmCounts.rejected;
    if (
      counts['Waiting Human'] !== csmCounts.waiting ||
      (submissionCohort > 0 && counts.totalExecutable !== submissionCohort)
    ) {
      const detail = {
        waitingHuman: counts['Waiting Human'],
        csmWaiting: csmCounts.waiting,
        totalExecutable: counts.totalExecutable,
        submissionCohort,
        packageGenerated: csmCounts.packageGenerated,
      };
      console.error(
        '[truth] Cross-page invariant violated: Track Results / Execution Summary ≠ Campaign Health (CSM)',
        detail
      );
      try {
        const { logTruthViolation } = await import('./bee-evidence.service.js');
        await logTruthViolation({
          workspaceId,
          kind: 'cross_page_invariant',
          source: 'execution_summary_vs_csm',
          detail,
        });
      } catch {
        /* best-effort */
      }
    }
  } catch {
    counts = computeExecutionCounts(
      jobs.map((j) => {
        const row = j as Record<string, unknown>;
        return {
          id: String(j.id),
          status: String(j.status),
          site_domain: j.site_domain != null ? String(j.site_domain) : null,
          opportunity_id: j.opportunity_id != null ? String(j.opportunity_id) : null,
          pause_reason: j.pause_reason != null ? String(j.pause_reason) : null,
          disposition: dispositionOf(row),
          error_code: j.error_code != null ? String(j.error_code) : null,
          error_message: j.error_message != null ? String(j.error_message) : null,
          created_at: j.created_at != null ? String(j.created_at) : null,
          metrics: (j.metrics as Record<string, unknown>) ?? null,
        };
      })
    );
  }

  const campaignItems = items.filter((i) => !i.hidden && i.status !== 'Failed to Start');
  const failedToStart = items.filter((i) => i.status === 'Failed to Start');
  const failedQueue = campaignItems.filter((i) => i.status === 'Failed');
  const waitingHuman = campaignItems.filter((i) => i.status === 'Waiting Human');
  const verificationEligible = items.filter((i) =>
    isVerificationEligible(i.rawStatus, i.disposition)
  );

  return {
    counts,
    items,
    campaignItems,
    failedToStart,
    failedQueue,
    waitingHuman,
    verificationEligible,
    trackResults: {
      Submitted: counts.Submitted + counts.Completed,
      Running: counts.Running,
      'Waiting Human': counts['Waiting Human'],
      Failed: counts.Failed,
      'Failed to Start': counts['Failed to Start'],
      Skipped: counts.Skipped,
      Deleted: counts.Deleted,
      Verified: counts.Verified,
      Approved: counts.Approved,
      Rejected: counts.Rejected,
    },
    campaignState: counts.campaignState,
    campaignIsRunning: counts.campaignIsRunning,
    aiStatusLine: counts.aiStatusLine,
    progressPercent: counts.progressPercent,
    totalExecutable: counts.totalExecutable,
    ignoreListCount: ignore.items?.length ?? 0,
    generatedAt: new Date().toISOString(),
    metricsSource,
  };
}

/** Compatibility shim — statistics consumers read ESM counts + CSM Submission Ready. */
export async function getStatisticsFromExecutionState(workspaceId: string) {
  const state = await getExecutionState(workspaceId);
  const policy = await getOrCreatePolicy(workspaceId);
  const maxWorkers = Math.max(1, Number(policy.max_parallel_sessions ?? 4));
  const c = state.counts;
  const completed =
    c.Submitted + c.Completed + c.Verified + c.Approved;
  const remaining = c.Queued; // not yet started — never includes Running/Starting
  // Phase 6.3.2 — Finished only when cohort is fully terminal (no Starting/Queued/open)
  const executionComplete =
    Boolean(c.executionComplete) &&
    c.campaignOpen === 0 &&
    c.Running === 0 &&
    c.Starting === 0 &&
    c.Queued === 0 &&
    c['Waiting Human'] === 0;
  let submissionReady = 0;
  let handoff: Awaited<
    ReturnType<typeof import('../campaigns/generation-handoff.service.js').getHandoffAudit>
  > | null = null;
  try {
    const { getCampaignCounts } = await import('../campaigns/campaign-state.service.js');
    submissionReady = (await getCampaignCounts(workspaceId)).ready;
    const { getHandoffAudit } = await import('../campaigns/generation-handoff.service.js');
    handoff = await getHandoffAudit(workspaceId);
  } catch {
    /* CSM optional during partial boot */
  }

  const aiStatusLine =
    submissionReady > 0 && c.campaignState === 'Idle'
      ? 'Campaign ready for submission'
      : c.aiStatusLine;

  return {
    state,
    running: c.Running + c.Starting,
    queued: c.Queued,
    /** CSM Submission Ready count (Phase 5.5) — was wrongly bound to execution job Ready */
    ready: submissionReady,
    submissionReady,
    handoff,
    paused: 0,
    needs_approval: c['Waiting Human'],
    /** Success completions — same as submitted / aiSubmitted (Phase 4.7 consistency) */
    completed,
    failed: c.Failed,
    failedToStart: c['Failed to Start'],
    blocked: handoff?.blocked ?? 0,
    cancelled: c.Deleted,
    watching: c['Waiting Human'],
    submitted: completed,
    skipped: c.Skipped,
    deleted: c.Deleted,
    ignored: c.Ignored,
    verified: c.Verified,
    approved: c.Approved,
    rejected: c.Rejected,
    needsYou: c['Waiting Human'],
    waitingUser: c['Waiting Human'],
    waitingApproval: c['Waiting Human'],
    waitingHuman: c['Waiting Human'],
    waitingVerification: 0,
    waitingLogin: 0,
    waitingMfa: 0,
    retrying: 0,
    aiSubmitted: completed,
    totalJobs: c.totalExecutable,
    /** Same numerator base as `completed` — never campaignResolved (Failed/Skipped) */
    completedJobs: completed,
    remainingJobs: remaining,
    progressPercent: c.progressPercent,
    executionComplete,
    campaignState: executionComplete ? 'Completed' : c.campaignState,
    campaignIsRunning: c.campaignIsRunning,
    aiStatusLine: executionComplete ? 'Campaign complete' : aiStatusLine,
    successRate:
      completed + c.Failed > 0
        ? Math.round((completed / (completed + c.Failed)) * 1000) / 10
        : null,
    maxParallelSessions: maxWorkers,
    activeWorkerCount: Math.min(maxWorkers, c.Running + c.Starting),
    workerUsage: `${Math.min(maxWorkers, c.Running + c.Starting)}/${maxWorkers}`,
    etaSeconds: 0,
    estimatedApprovalTime: '7–14 days',
    estimatedVerificationTime: '24 hours',
    needsYourAction: c['Waiting Human'],
    trackResults: state.trackResults,
    failedQueue: state.failedQueue,
    failedToStartQueue: state.failedToStart,
    metricsSource: state.metricsSource,
    /** Phase 4.7 — one summary object for all surfaces */
    executionSummary: {
      queued: c.Queued,
      running: c.Running + c.Starting,
      completed,
      waitingHuman: c['Waiting Human'],
      skipped: c.Skipped,
      failed: c.Failed,
      deleted: c.Deleted,
      remaining,
      total: c.totalExecutable,
      progressPercent: c.progressPercent,
      etaSeconds: 0,
      executionComplete,
      campaignState: executionComplete ? 'Completed' : c.campaignState,
      aiStatusLine: executionComplete ? 'Campaign complete' : aiStatusLine,
      submissionReady,
    },
  };
}

/** Soft-remove opportunity from current project after Delete Forever. */
export async function removeOpportunityFromProject(
  workspaceId: string,
  opportunityId: string | null | undefined
) {
  if (!opportunityId) return;
  try {
    const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
    await updateCampaignItem(workspaceId, opportunityId, {
      currentStatus: 'Deleted',
      submissionStatus: 'Deleted',
      lastError: null,
      force: true,
    });
  } catch {
    await getSupabaseAdmin()
      .from('opportunities')
      .update({
        automation_status: 'deleted',
        campaign_lifecycle: 'Deleted',
        pipeline_stage: 'lost',
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId);
  }

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
