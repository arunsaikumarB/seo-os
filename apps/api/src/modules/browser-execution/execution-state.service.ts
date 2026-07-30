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
  const maxWorkers = Math.max(1, Number(policy.max_parallel_sessions ?? 2));
  // Cap to container-safe concurrency (Phase 6.3.5)
  const { BEE_RELIABILITY } = await import('./bee-config.js');
  const cappedWorkers = Math.min(maxWorkers, BEE_RELIABILITY.MAX_BROWSER_SESSIONS);
  const c = state.counts;
  const completed = c.Submitted + c.Completed + c.Verified + c.Approved;

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

  let inFlight = c.Running + c.Starting;
  let queued = c.Queued;
  let campaignState = c.campaignState;
  let campaignIsRunning = c.campaignIsRunning;
  let aiStatusLine =
    submissionReady > 0 && c.campaignState === 'Idle'
      ? 'Campaign ready for submission'
      : c.aiStatusLine;

  // Auto-publish OFF: Ready CSM items must not look like a browser submit queue.
  // Live job rows still drive Waiting Human / Running if the user opted in earlier.
  // Remaining / Complete must still reflect Assisted Manual open packages (CSM Ready).
  let assistedOpen = 0;
  if (policy.auto_publish_automatable !== true) {
    assistedOpen = Math.max(0, submissionReady);
    // Also count CSM open cohort (Ready / Waiting Human / Package Generated) via campaignOpen
    // when Ready count is stale — prefer the larger of submissionReady and campaignOpen-without-live.
    const csmOpenForAssisted = Math.max(
      0,
      c.campaignOpen - (c.Running + c.Starting + c.Queued)
    );
    // When auto is off, CSM Queued synthetic = Ready items — those are assisted open
    assistedOpen = Math.max(assistedOpen, c.Queued, csmOpenForAssisted, c['Waiting Human']);

    const liveFromJobs = state.items.filter((i) => {
      const s = i.rawStatus;
      return (
        [
          'queued',
          'retry_scheduled',
          'waiting_infrastructure',
          'preparing',
          'starting',
          'launching_browser',
          'authenticating',
          'navigating',
          'analyzing_form',
          'uploading_assets',
          'filling_fields',
          'validating',
          'submitting',
          'running',
          'waiting_human',
          'needs_approval',
          'paused',
          'awaiting_user',
          'ready_for_review',
          'ready_to_continue',
        ].includes(s) ||
        s.startsWith('watching_') ||
        s.startsWith('blocked_')
      );
    });
    const liveRunning = liveFromJobs.filter((i) =>
      ['Running', 'Starting'].includes(i.status)
    ).length;
    const liveWaiting = liveFromJobs.filter((i) => i.status === 'Waiting Human').length;
    const liveQueued = liveFromJobs.filter((i) => i.status === 'Queued').length;
    inFlight = liveRunning;
    queued = liveQueued;
    if (liveRunning > 0) {
      campaignState = 'Running';
      campaignIsRunning = true;
      aiStatusLine = `Submitting (${liveRunning} running / ${liveQueued} queued)`;
    } else if (liveWaiting > 0 || assistedOpen > 0) {
      campaignState = 'Waiting Human';
      campaignIsRunning = false;
      aiStatusLine =
        assistedOpen > 0
          ? `Assisted Manual — ${assistedOpen} site${assistedOpen === 1 ? '' : 's'} remaining`
          : 'Waiting for you';
    } else if (liveQueued > 0) {
      campaignState = 'Starting';
      campaignIsRunning = false;
      aiStatusLine = `Submitting (0 running / ${liveQueued} queued)`;
    } else {
      campaignState = 'Idle';
      campaignIsRunning = false;
      aiStatusLine =
        submissionReady > 0
          ? 'Ready for Assisted Manual'
          : 'Campaign ready for submission';
    }
  }

  // Phase 6.3.6 — Remaining includes in-flight so Submitting cohort never looks like all-zeros
  // Assisted path: remaining = open packages still needing Done (not just live browser queue)
  const remaining =
    policy.auto_publish_automatable !== true
      ? Math.max(queued + inFlight, assistedOpen, c.campaignOpen)
      : queued + inFlight;
  const liveWaitingHuman =
    policy.auto_publish_automatable !== true
      ? Math.max(
          state.items.filter((i) => i.status === 'Waiting Human').length,
          assistedOpen > 0 ? assistedOpen : c['Waiting Human']
        )
      : c['Waiting Human'];
  // Finished only when the CSM cohort is fully terminal — never while Assisted packages remain
  const submittedCount = c.Submitted + c.Completed;
  const verifiedCount = c.Verified + c.Approved;
  const executionComplete =
    policy.auto_publish_automatable !== true
      ? inFlight === 0 &&
        remaining === 0 &&
        assistedOpen === 0 &&
        c.campaignOpen === 0 &&
        submissionReady === 0
      : Boolean(c.executionComplete) &&
        c.campaignOpen === 0 &&
        c.Running === 0 &&
        c.Starting === 0 &&
        c.Queued === 0 &&
        c['Waiting Human'] === 0;

  const result = {
    state,
    running: inFlight,
    queued,
    /** CSM Submission Ready count (Phase 5.5) — was wrongly bound to execution job Ready */
    ready: submissionReady,
    submissionReady,
    handoff,
    paused: 0,
    needs_approval: liveWaitingHuman,
    /** Success completions — Submitted + Verified + Approved (Phase 4.7 consistency) */
    completed,
    /** Explicit Submitted tile (includes assisted-manual Done; excludes Verified-only bump) */
    submitted: submittedCount,
    verified: verifiedCount,
    failed: c.Failed,
    failedToStart: c['Failed to Start'],
    blocked: handoff?.blocked ?? 0,
    cancelled: c.Deleted,
    watching: liveWaitingHuman,
    skipped: c.Skipped,
    deleted: c.Deleted,
    ignored: c.Ignored,
    approved: c.Approved,
    rejected: c.Rejected,
    needsYou: liveWaitingHuman,
    waitingUser: liveWaitingHuman,
    waitingApproval: liveWaitingHuman,
    waitingHuman: liveWaitingHuman,
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
    campaignState: executionComplete ? 'Completed' : campaignState,
    campaignIsRunning,
    aiStatusLine: executionComplete ? 'Campaign finished' : aiStatusLine,
    successRate:
      completed + c.Failed > 0
        ? Math.round((completed / (completed + c.Failed)) * 1000) / 10
        : null,
    maxParallelSessions: cappedWorkers,
    activeWorkerCount: Math.min(cappedWorkers, inFlight),
    workerUsage: `${Math.min(cappedWorkers, inFlight)}/${cappedWorkers}`,
    etaSeconds: 0,
    estimatedApprovalTime: '7–14 days',
    estimatedVerificationTime: '24 hours',
    needsYourAction: liveWaitingHuman,
    trackResults: {
      ...state.trackResults,
      Submitted: submittedCount,
      Verified: verifiedCount,
      Completed: completed,
    },
    failedQueue: state.failedQueue,
    failedToStartQueue: state.failedToStart,
    metricsSource: state.metricsSource,
    /** Phase 4.7 — one summary object for all surfaces */
    executionSummary: {
      queued,
      running: inFlight,
      completed,
      submitted: submittedCount,
      verified: verifiedCount,
      waitingHuman: liveWaitingHuman,
      skipped: c.Skipped,
      failed: c.Failed,
      deleted: c.Deleted,
      remaining,
      total: c.totalExecutable,
      progressPercent: c.progressPercent,
      etaSeconds: 0,
      executionComplete,
      campaignState: executionComplete ? 'Completed' : campaignState,
      aiStatusLine: executionComplete ? 'Campaign finished' : aiStatusLine,
      submissionReady,
    },
  };

  // Edge-trigger: only when honesty-complete (no un-actioned packages)
  if (executionComplete && c.totalExecutable > 0) {
    void maybeNotifyCampaignFinished(workspaceId, {
      submitted: submittedCount,
      verified: verifiedCount,
      failed: c.Failed,
      skipped: c.Skipped,
      manualWaiting: 0,
    }).catch(() => undefined);
  }

  return result;
}

async function maybeNotifyCampaignFinished(
  workspaceId: string,
  counts: {
    submitted: number;
    verified: number;
    failed: number;
    skipped: number;
    manualWaiting: number;
  }
) {
  // Count assisted packages still open — never claim finished while Done is pending
  try {
    const { data: openPkgs } = await getSupabaseAdmin()
      .from('assisted_packages')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['not_started', 'in_progress']);
    if ((openPkgs ?? []).length > 0) return;
  } catch {
    /* best-effort */
  }

  const { notifyStageCompleteAsync } = await import('../platform/stage-notify.service.js');
  const manualDone = counts.submitted; // assisted Done lands in Submitted
  notifyStageCompleteAsync({
    workspaceId,
    kind: 'campaign_finished',
    stageName: 'Campaign finished',
    summary: `Submitted ${counts.submitted} · Verified ${counts.verified} · Failed ${counts.failed} · Skipped ${counts.skipped}`,
    outcome: counts.failed > 0 ? 'partial' : 'success',
    href: `/projects/${workspaceId}/backlink-builder/track-results`,
    longRunning: true,
    dedupeMs: 3_600_000,
    payload: {
      fingerprint: `campaign:${counts.submitted}:${counts.verified}:${counts.failed}:${counts.skipped}`,
      ...counts,
      manual: manualDone,
    },
  });
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
