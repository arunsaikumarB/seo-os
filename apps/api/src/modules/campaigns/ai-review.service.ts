/**
 * AI Review board + bulk actions — all writes go through CSM updateCampaignItem.
 */
import {
  assignReviewTier,
  computeAiReviewSummary,
  decideAfterAnalysis,
  type ApprovedBy,
  type ReviewDecision,
  type ReviewTier,
} from '@seo-os/backlink-builder';
import {
  listCampaignItems,
  updateCampaignItem,
  type CampaignItemRow,
} from './campaign-state.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export type AiReviewItem = {
  id: string;
  website: string;
  domain: string | null;
  confidenceScore: number | null;
  reviewTier: ReviewTier | null;
  reviewDecision: ReviewDecision | null;
  approvedBy: ApprovedBy;
  classification: string | null;
  classificationLabel: string | null;
  currentStatus: string;
  lastError: string | null;
  duplicateOfId: string | null;
  canApprove: boolean;
  reason: string | null;
};

function toReviewItem(i: CampaignItemRow): AiReviewItem {
  const decision = i.reviewDecision ?? null;
  const needsClass =
    decision === 'Needs Classification' || i.reviewTier === 'needs_classification';
  const terminal =
    decision === 'Approved' ||
    decision === 'Rejected' ||
    decision === 'Unsupported' ||
    decision === 'Duplicate' ||
    decision === 'Dead Website';
  const classified =
    Boolean(i.classification) && String(i.classification).toLowerCase() !== 'unknown';

  return {
    id: i.id,
    website: i.websiteUrl ?? i.domain ?? i.id,
    domain: i.domain ?? null,
    confidenceScore: i.confidenceScore ?? null,
    reviewTier: i.reviewTier ?? null,
    reviewDecision: decision,
    approvedBy: i.approvedBy ?? null,
    classification: i.classification ?? null,
    classificationLabel: i.classificationLabel ?? null,
    currentStatus: i.currentStatus,
    lastError: i.lastError ?? null,
    duplicateOfId: i.duplicateOfId ?? null,
    canApprove: !needsClass && !terminal && classified,
    reason:
      typeof i.raw.metadata === 'object' && i.raw.metadata
        ? String(
            ((i.raw.metadata as Record<string, unknown>).classification as Record<string, unknown>)
              ?.reason ?? ''
          ) || null
        : null,
  };
}

export async function getAiReviewBoard(workspaceId: string) {
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  const summary = computeAiReviewSummary(items);
  const rows = items.map(toReviewItem);

  const autoApproved = rows
    .filter((r) => r.reviewTier === 'auto_approved' || (r.reviewDecision === 'Approved' && r.approvedBy === 'auto'))
    .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  const recommended = rows
    .filter(
      (r) =>
        r.reviewTier === 'recommended' &&
        (r.reviewDecision === 'Pending' || r.reviewDecision == null)
    )
    .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  const needsClassification = rows
    .filter(
      (r) =>
        r.reviewTier === 'needs_classification' ||
        r.reviewDecision === 'Needs Classification'
    )
    .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  const rejected = rows.filter((r) => r.reviewDecision === 'Rejected');
  const unsupported = rows.filter((r) => r.reviewDecision === 'Unsupported');
  const duplicate = rows.filter((r) => r.reviewDecision === 'Duplicate');
  const dead = rows.filter((r) => r.reviewDecision === 'Dead Website');
  const userApproved = rows.filter(
    (r) => r.reviewDecision === 'Approved' && r.approvedBy === 'user'
  );

  return {
    summary,
    tiers: {
      autoApproved,
      recommended,
      needsClassification,
      userApproved,
      rejected,
      unsupported,
      duplicate,
      dead,
    },
    items: rows,
    metricsSource: 'campaign_state' as const,
  };
}

export type AiReviewBulkAction =
  | 'approve'
  | 'reject'
  | 'unsupported'
  | 'outreach'
  | 'retry_analysis';

export async function bulkAiReviewAction(
  workspaceId: string,
  action: AiReviewBulkAction,
  itemIds: string[]
) {
  const board = await getAiReviewBoard(workspaceId);
  const byId = new Map(board.items.map((i) => [i.id, i]));
  let succeeded = 0;
  let skipped = 0;
  const skipReasons: string[] = [];
  const errors: string[] = [];

  for (const id of itemIds) {
    const item = byId.get(id);
    if (!item) {
      skipped++;
      skipReasons.push(`${id}: not found`);
      continue;
    }

    try {
      if (action === 'approve') {
        if (item.reviewDecision === 'Approved') {
          // idempotent no-op
          succeeded++;
          continue;
        }
        if (
          item.reviewDecision === 'Needs Classification' ||
          item.reviewTier === 'needs_classification' ||
          !item.canApprove
        ) {
          skipped++;
          skipReasons.push(`${item.website}: need classification first`);
          continue;
        }
        if (
          item.reviewDecision === 'Unsupported' ||
          item.reviewDecision === 'Duplicate' ||
          item.reviewDecision === 'Dead Website'
        ) {
          skipped++;
          skipReasons.push(`${item.website}: ${item.reviewDecision}`);
          continue;
        }
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Approved',
          reviewDecision: 'Approved',
          approvedBy: 'user',
          approval: 'approved',
          force: true,
        });
        succeeded++;
      } else if (action === 'reject') {
        if (item.reviewDecision === 'Rejected') {
          succeeded++;
          continue;
        }
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Rejected',
          reviewDecision: 'Rejected',
          approvedBy: 'user',
          approval: 'rejected',
          force: true,
        });
        succeeded++;
      } else if (action === 'unsupported') {
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Ignored',
          reviewDecision: 'Unsupported',
          approvedBy: null,
          force: true,
        });
        succeeded++;
      } else if (action === 'outreach') {
        // Map to Ignored / outreach flag in lifecycle
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Ignored',
          reviewDecision: 'Unsupported',
          approvedBy: null,
          lastError: 'Moved to outreach',
          force: true,
        });
        succeeded++;
      } else if (action === 'retry_analysis') {
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Analyzed',
          reviewDecision: 'Pending',
          reviewTier: null,
          confidenceScore: null,
          approvedBy: null,
          lastError: null,
          force: true,
        });
        succeeded++;
      }
    } catch (err) {
      errors.push(`${item.website}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const summary = (await getAiReviewBoard(workspaceId)).summary;

  if (succeeded > 0 || errors.length > 0) {
    try {
      const { notifyStageCompleteAsync } = await import('../platform/stage-notify.service.js');
      const pending = Number((summary as { pending?: number })?.pending ?? 0);
      const approved = Number((summary as { approved?: number })?.approved ?? succeeded);
      notifyStageCompleteAsync({
        workspaceId,
        kind: 'ai_review',
        stageName: 'AI Review',
        summary:
          errors.length > 0
            ? `${action}: ${succeeded} succeeded · ${errors.length} failed · ${skipped} skipped`
            : `${action}: ${succeeded} sites · ${pending} still pending · ${approved} approved`,
        outcome: errors.length > 0 ? 'partial' : 'success',
        href: `/projects/${workspaceId}/content/library`,
        payload: {
          fingerprint: `ai-review:${action}:${succeeded}:${pending}:${errors.length}`,
          action,
          succeeded,
          skipped,
          failed: errors.length,
        },
      });
    } catch {
      /* notify optional */
    }
  }

  return {
    action,
    succeeded,
    skipped,
    skipReasons: skipReasons.slice(0, 20),
    errors: errors.slice(0, 20),
    summary,
  };
}

export async function setAiReviewClassification(
  workspaceId: string,
  itemId: string,
  classificationId: string
) {
  const conf = 75; // unlocks recommended band after user picks type
  const tier = assignReviewTier(conf, classificationId);
  await updateCampaignItem(workspaceId, itemId, {
    classification: classificationId,
    confidenceScore: conf,
    reviewTier: tier,
    reviewDecision: tier === 'needs_classification' ? 'Needs Classification' : 'Pending',
    currentStatus: 'Classified',
    force: true,
  });
  return getAiReviewBoard(workspaceId);
}

/** Apply analysis result through CSM (auto-approve / gate / dead / duplicate). */
export async function applyAnalysisToCampaignItem(
  workspaceId: string,
  itemId: string,
  opts: {
    confidenceScore: number;
    classificationId?: string | null;
    deadWebsite?: boolean;
    duplicateOfId?: string | null;
  }
) {
  const decision = decideAfterAnalysis(opts);
  await updateCampaignItem(workspaceId, itemId, {
    currentStatus: decision.lifecycle,
    confidenceScore: decision.confidenceScore,
    reviewTier: decision.reviewTier,
    reviewDecision: decision.reviewDecision,
    approvedBy: decision.approvedBy,
    approval: decision.reviewDecision === 'Approved' ? 'approved' : 'pending',
    lastError: decision.lastError ?? null,
    duplicateOfId: decision.duplicateOfId ?? null,
    force: true,
  });
}

export async function backfillAiReviewFields(workspaceId: string) {
  const items = await listCampaignItems(workspaceId, { includeDeleted: true });
  let updated = 0;
  for (const item of items) {
    if (item.reviewDecision) continue;
    let decision: ReviewDecision = 'Pending';
    let approvedBy: ApprovedBy = null;
    let tier: ReviewTier | null = item.reviewTier ?? null;
    const conf =
      item.confidenceScore ??
      (typeof (item.raw.metadata as Record<string, unknown>)?.classification === 'object'
        ? Number(
            (
              (item.raw.metadata as Record<string, unknown>).classification as Record<
                string,
                unknown
              >
            )?.confidence ?? 0
          )
        : null);

    if (
      item.currentStatus === 'Approved' ||
      (item.approval === 'approved' && item.currentStatus !== 'Rejected')
    ) {
      decision = 'Approved';
      approvedBy = 'user';
      tier = tier ?? (conf != null && conf > 90 ? 'auto_approved' : 'recommended');
    } else if (item.currentStatus === 'Rejected') {
      decision = 'Rejected';
    } else if (item.currentStatus === 'Ignored') {
      decision = 'Unsupported';
    } else if (item.currentStatus === 'Skipped') {
      decision = 'Duplicate';
    } else if (
      item.currentStatus === 'Failed' &&
      String(item.lastError ?? '').toLowerCase().includes('dead')
    ) {
      decision = 'Dead Website';
    } else if (conf != null) {
      tier = assignReviewTier(conf, item.classification);
      if (tier === 'needs_classification') decision = 'Needs Classification';
      else if (tier === 'auto_approved') {
        decision = 'Approved';
        approvedBy = 'auto';
      } else decision = 'Pending';
    }

    await updateCampaignItem(workspaceId, item.id, {
      reviewDecision: decision,
      reviewTier: tier,
      confidenceScore: conf,
      approvedBy,
      force: true,
    });
    updated++;
  }
  return { updated, summary: computeAiReviewSummary(await listCampaignItems(workspaceId)) };
}

/** Find existing campaign item by domain for duplicate detection. */
export async function findExistingByDomain(workspaceId: string, domain: string) {
  const d = domain.toLowerCase().replace(/^www\./, '');
  const { data } = await getSupabaseAdmin()
    .from('opportunities')
    .select('id, domain')
    .eq('workspace_id', workspaceId)
    .ilike('domain', d)
    .neq('automation_status', 'deleted')
    .limit(1)
    .maybeSingle();
  return data ? String(data.id) : null;
}
