/**
 * Phase 5.5 — Generation → Submission handoff (CSM write path).
 * Atomic Ready (or blocker_reason). No new lifecycle statuses.
 */
import {
  computeHandoffConservation,
  isHandoffBlockerReason,
  selectHandoffEmptyState,
  type HandoffBlockerReason,
  type HandoffConservation,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import {
  listCampaignItems,
  updateCampaignItem,
  type CampaignItemRow,
} from './campaign-state.service.js';

export type HandoffAudit = HandoffConservation & {
  executionJobsQueued: number;
  executionJobsRunning: number;
  waitingHuman: number;
  emptyState: ReturnType<typeof selectHandoffEmptyState>;
  generationRemaining: number;
  generationRunning: number;
};

async function detectSiteBlocker(
  workspaceId: string,
  domain: string | null | undefined
): Promise<HandoffBlockerReason | null> {
  if (!domain) return null;
  try {
    const {
      getSiteProfileByDomain,
      isOutreachOnlyProfile,
      isPaidDirectoryNeedsReview,
      isProfileExecutionReady,
    } = await import('../browser-execution/site-intelligence.service.js');
    const profile = await getSiteProfileByDomain(workspaceId, domain);
    if (!profile) return null; // profile pending — do not block Ready; SIE gate handles at start
    if (profile.profile_status === 'failed') return 'site_unprofilable';
    if (profile.profile_status === 'unsupported') return 'unsupported';
    if (isOutreachOnlyProfile(profile)) return 'outreach_path';
    if (isPaidDirectoryNeedsReview(profile)) return 'needs_review'; // paid → human review path
    if (profile.profile_status === 'pending' || profile.profile_status === 'running') {
      return null; // allow Ready; execution waits on profile
    }
    if (profile.profile_status === 'complete' && !isProfileExecutionReady(profile)) {
      const strat = profile.strategy as { chosen?: string } | null;
      if (strat?.chosen === 'Unsupported') return 'unsupported';
      if (strat?.chosen === 'Email Outreach') return 'outreach_path';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Atomic handoff: generation complete → Ready (Submission Ready) OR store blocker_reason.
 * Single CSM update — never Package Generated then Ready as two writes.
 */
export async function completePackageHandoff(params: {
  workspaceId: string;
  opportunityId: string;
  qualityScore?: number | null;
  packageApprovedBy?: 'auto' | 'user' | null;
  /** When set, do not promote to Ready — store this blocker instead. */
  forceBlocker?: HandoffBlockerReason | null;
  domain?: string | null;
}): Promise<{ status: 'Ready' | 'blocked'; blockerReason: HandoffBlockerReason | null }> {
  const item = (await listCampaignItems(params.workspaceId)).find(
    (i) => i.id === params.opportunityId
  );
  if (!item) {
    throw Object.assign(new Error('Campaign item not found'), { status: 404 });
  }

  if (
    item.currentStatus === 'Deleted' ||
    item.currentStatus === 'Rejected' ||
    item.currentStatus === 'Ignored'
  ) {
    await updateCampaignItem(params.workspaceId, params.opportunityId, {
      blockerReason: 'terminal_state',
      force: true,
    });
    return { status: 'blocked', blockerReason: 'terminal_state' };
  }

  let blocker: HandoffBlockerReason | null = params.forceBlocker ?? null;
  if (!blocker) {
    blocker = await detectSiteBlocker(params.workspaceId, params.domain ?? item.domain);
  }

  if (blocker) {
    await updateCampaignItem(params.workspaceId, params.opportunityId, {
      qualityScore: params.qualityScore ?? item.qualityScore,
      generationStatus: blocker === 'needs_review' ? 'Needs Review' : 'Completed',
      currentStatus:
        blocker === 'quality_failed' || blocker === 'terminal_state'
          ? 'Failed'
          : item.currentStatus === 'Ready'
            ? 'Ready'
            : 'Package Generated',
      packageApprovedBy: params.packageApprovedBy ?? item.packageApprovedBy,
      blockerReason: blocker,
      lastError: blocker === 'needs_review' ? item.lastError : `handoff_blocked:${blocker}`,
      force: true,
    });
    logger.info(
      { opportunityId: params.opportunityId, blocker },
      'handoff blocked — blocker_reason stored'
    );

    // Still prepare Assisted package when content exists (human submits offline)
    if (blocker !== 'quality_failed' && blocker !== 'terminal_state') {
      void import('../browser-execution/assisted-manual.service.js')
        .then((m) => m.prepareAssistedForOpportunity(params.workspaceId, params.opportunityId))
        .catch((err) =>
          logger.warn(
            { err, opportunityId: params.opportunityId },
            'assisted package prepare after blocked handoff failed'
          )
        );
    }

    return { status: 'blocked', blockerReason: blocker };
  }

  // Atomic: Completed + Ready in one write (skip intermediate Package Generated)
  await updateCampaignItem(params.workspaceId, params.opportunityId, {
    qualityScore: params.qualityScore ?? item.qualityScore,
    generationStatus: 'Completed',
    currentStatus: 'Ready',
    packageApprovedBy: params.packageApprovedBy ?? 'auto',
    blockerReason: null,
    lastError: null,
    force: true,
  });

  logger.info({ opportunityId: params.opportunityId }, 'handoff → Submission Ready (Ready)');

  // Phase 7 — prepare Assisted Manual package for every content-ready site (never auto-submits)
  void import('../browser-execution/assisted-manual.service.js')
    .then((m) => m.prepareAssistedForOpportunity(params.workspaceId, params.opportunityId))
    .catch((err) =>
      logger.warn(
        { err, opportunityId: params.opportunityId },
        'assisted package prepare after handoff failed'
      )
    );

  return { status: 'Ready', blockerReason: null };
}

/** Promote stranded Package Generated / Completed-without-Ready items. */
export async function reconcileGenerationHandoff(workspaceId?: string): Promise<{
  scanned: number;
  promoted: number;
  blocked: number;
  skipped: number;
}> {
  const db = getSupabaseAdmin();
  let q = db
    .from('opportunities')
    .select(
      'id, workspace_id, domain, campaign_lifecycle, generation_status, blocker_reason, automation_status'
    )
    .eq('campaign_lifecycle', 'Package Generated')
    .not('automation_status', 'in', '("deleted","ignored")')
    .limit(2000);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);

  const { data, error } = await q;
  if (error) throw error;

  // Also catch Completed generation stuck on Approved (never advanced)
  let q2 = db
    .from('opportunities')
    .select(
      'id, workspace_id, domain, campaign_lifecycle, generation_status, blocker_reason, automation_status'
    )
    .eq('generation_status', 'Completed')
    .eq('campaign_lifecycle', 'Approved')
    .not('automation_status', 'in', '("deleted","ignored")')
    .limit(2000);
  if (workspaceId) q2 = q2.eq('workspace_id', workspaceId);
  const second = await q2;

  const byId = new Map<string, (typeof data extends (infer T)[] | null ? T : never)>();
  for (const row of [...(data ?? []), ...(second.data ?? [])]) {
    byId.set(String(row.id), row);
  }
  return reconcileRows([...byId.values()]);
}

async function reconcileRows(
  rows: Array<{
    id: string;
    workspace_id: string;
    domain: string | null;
    campaign_lifecycle: string | null;
    generation_status: string | null;
    blocker_reason: string | null;
    automation_status: string | null;
  }>
) {
  let promoted = 0;
  let blocked = 0;
  let skipped = 0;
  for (const row of rows) {
    const life = String(row.campaign_lifecycle ?? '');
    const gen = String(row.generation_status ?? '');
    if (life === 'Ready' || life === 'Submitting' || life === 'Waiting Human') {
      skipped++;
      continue;
    }
    // Already has explicit blocker — leave unless Ready-eligible after resolution
    if (row.blocker_reason === 'needs_review' && gen === 'Needs Review') {
      skipped++;
      continue;
    }
    try {
      const result = await completePackageHandoff({
        workspaceId: row.workspace_id,
        opportunityId: row.id,
        domain: row.domain,
        packageApprovedBy: 'auto',
        forceBlocker: isHandoffBlockerReason(row.blocker_reason)
          ? (row.blocker_reason as HandoffBlockerReason)
          : gen === 'Needs Review'
            ? 'needs_review'
            : gen === 'Failed'
              ? 'quality_failed'
              : null,
      });
      if (result.status === 'Ready') promoted++;
      else blocked++;
      logger.info(
        { opportunityId: row.id, result },
        'handoff reconcile repaired stranded package'
      );
    } catch (err) {
      skipped++;
      logger.warn({ err, opportunityId: row.id }, 'handoff reconcile item failed');
    }
  }
  return { scanned: rows.length, promoted, blocked, skipped };
}

export async function getHandoffAudit(workspaceId: string): Promise<HandoffAudit> {
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  const conservation = computeHandoffConservation(items);

  let executionJobsQueued = 0;
  let executionJobsRunning = 0;
  let waitingHuman = 0;
  try {
    const { getExecutionDiagnostics } = await import(
      '../browser-execution/execution-pipeline.service.js'
    );
    const diag = await getExecutionDiagnostics(workspaceId);
    executionJobsQueued = diag.jobsQueued;
    executionJobsRunning = diag.jobsRunning;
    waitingHuman = diag.jobsWaitingHuman;
  } catch {
    /* optional */
  }

  let generationRemaining = 0;
  let generationRunning = 0;
  try {
    const { getContentGenerationBoard } = await import('./content-generation.service.js');
    const board = await getContentGenerationBoard(workspaceId);
    generationRemaining = Number(board.progress?.queued ?? board.progress?.waiting ?? 0);
    generationRunning = Number(board.progress?.generating ?? 0);
  } catch {
    /* optional */
  }

  const emptyState = selectHandoffEmptyState({
    submissionReady: conservation.submissionReady,
    generationRunning,
    generationRemaining,
    conservation,
  });

  return {
    ...conservation,
    executionJobsQueued,
    executionJobsRunning,
    waitingHuman,
    emptyState,
    generationRemaining,
    generationRunning,
  };
}

/** Resolve needs_review blocker after human approve — calls atomic handoff. */
export async function resolveHandoffBlockerAfterApprove(
  workspaceId: string,
  opportunityId: string,
  domain?: string | null
) {
  return completePackageHandoff({
    workspaceId,
    opportunityId,
    packageApprovedBy: 'user',
    domain,
    forceBlocker: null,
  });
}

export function handoffItemsForAudit(items: CampaignItemRow[]) {
  return computeHandoffConservation(items);
}
